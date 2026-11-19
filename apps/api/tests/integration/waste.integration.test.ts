import { ERROR_CODES } from '@istana-buah/shared';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import type Redis from 'ioredis';
import request from 'supertest';
import { createApp } from '../../src/app';
import { appConfig } from '../../src/config/app.config';
import { authConfig } from '../../src/config/auth.config';
import { buildDatabaseConfig } from '../../src/config/database.config';
import { buildRedisConfig } from '../../src/config/redis.config';
import { RedisCacheStore } from '../../src/lib/cache';
import { createPrismaClient, disconnectDatabase } from '../../src/lib/prisma';
import { createRedisClient, disconnectRedis } from '../../src/lib/redis';
import { RedisRateLimitStore } from '../../src/middleware/rateLimiter';
import {
  startEphemeralServices,
  type EphemeralServicesHandle,
} from '../helpers/ephemeral-services';

jest.setTimeout(180_000);

describe('M09-001 Integration: Waste & Shrinkage API (/v1/waste-records & /v1/reports/waste-summary)', () => {
  let services: EphemeralServicesHandle | undefined;
  let prismaClient: PrismaClient;
  let redisClient: Redis;
  let app: Express;

  const PASSWORD = 'ValidPass123!';
  const tokens: Record<'CASHIER' | 'MANAGER' | 'OWNER', string> = {
    CASHIER: '',
    MANAGER: '',
    OWNER: '',
  };

  const auth = (role: keyof typeof tokens): Record<string, string> => ({
    Authorization: `Bearer ${tokens[role]}`,
  });

  let mangoId: string;
  let appleId: string;

  beforeAll(async () => {
    services = await startEphemeralServices();
    const dbCfg = buildDatabaseConfig({ DATABASE_URL: services.databaseUrl, DB_POOL_LIMIT: '10' });
    prismaClient = createPrismaClient(dbCfg.url);
    redisClient = createRedisClient(
      buildRedisConfig({
        REDIS_URL: services.redisUrl,
        REDIS_MAX_RETRIES: '2',
        REDIS_CONNECT_TIMEOUT_MS: '5000',
      }),
    );

    const passwordHash = await bcrypt.hash(PASSWORD, authConfig.bcryptRounds);
    await prismaClient.$transaction([
      prismaClient.user.create({
        data: { username: 'kasir_wst', passwordHash, fullName: 'Kasir Waste', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'mgr_wst', passwordHash, fullName: 'Manajer Waste', role: 'MANAGER' },
      }),
      prismaClient.user.create({
        data: { username: 'owner_wst', passwordHash, fullName: 'Owner Waste', role: 'OWNER' },
      }),
    ]);

    const category = await prismaClient.category.create({ data: { name: 'Buah Waste Uji' } });
    const mango = await prismaClient.product.create({
      data: {
        name: 'Mangga Alpukat',
        categoryId: category.id,
        productType: 'WEIGHT',
        pricePerKg: '42000.00',
        costPerKg: '25000.00',
        stockQty: '10.000',
        minStockAlert: '3.000',
        isActive: true,
      },
    });
    const apple = await prismaClient.product.create({
      data: {
        name: 'Apel Merah',
        categoryId: category.id,
        productType: 'UNIT',
        pricePerUnit: '15000.00',
        costPerUnit: '10000.00',
        stockQty: '20.000',
        minStockAlert: '5.000',
        isActive: true,
      },
    });
    mangoId = mango.id;
    appleId = apple.id;

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm09-waste-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-waste-it'),
    });

    const loginRole = async (username: string): Promise<string> => {
      const res = await request(app).post('/v1/auth/login').send({ username, password: PASSWORD });
      return res.body.data.accessToken as string;
    };

    tokens.CASHIER = await loginRole('kasir_wst');
    tokens.MANAGER = await loginRole('mgr_wst');
    tokens.OWNER = await loginRole('owner_wst');
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  it('menegakkan RBAC, mengurangi stok & mencatat WASTE_OUT, mencegah stok negatif saat request paralel, serta memperbarui laporan & dashboard', async () => {
    // 1. RBAC: Unauthenticated 401 & CASHIER 403
    expect((await request(app).get('/v1/waste-records')).status).toBe(401);
    const cashierBlocked = await request(app).post('/v1/waste-records').set(auth('CASHIER')).send({
      productId: mangoId,
      wasteType: 'ROTTEN',
      quantity: 1,
      reason: 'Uji akses kasir',
    });
    expect(cashierBlocked.status).toBe(403);
    expect(cashierBlocked.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect((await request(app).get('/v1/reports/waste-summary').set(auth('CASHIER'))).status).toBe(
      403,
    );

    // 2. Seed cache dashboard terlebih dahulu (todayWaste = 0)
    const dashBefore = await request(app).get('/v1/dashboard/summary').set(auth('OWNER'));
    expect(dashBefore.status).toBe(200);
    expect(dashBefore.body.data.todayWaste.count).toBe(0);

    // 3. Konkurensi paralel: stok Mangga = 10kg, dua request masing-masing mencatat susut 8kg
    // Harus tepat 1 sukses (201) & 1 ditolak 422 INSUFFICIENT_STOCK
    const [w1, w2] = await Promise.all([
      request(app).post('/v1/waste-records').set(auth('MANAGER')).send({
        productId: mangoId,
        wasteType: 'ROTTEN',
        quantity: 8,
        reason: 'Busuk keranjang bawah batch 1',
      }),
      request(app).post('/v1/waste-records').set(auth('OWNER')).send({
        productId: mangoId,
        wasteType: 'ROTTEN',
        quantity: 8,
        reason: 'Busuk keranjang bawah batch 2',
      }),
    ]);

    const statuses = [w1.status, w2.status].sort();
    expect(statuses).toEqual([201, 422]);
    const okWaste = w1.status === 201 ? w1.body.data : w2.body.data;
    expect(okWaste.estimatedCost).toBe('200000.00'); // 8 * 25000

    // Pastikan stok Mangga tinggal 2.000 kg (tidak pernah negatif)
    const mangoRow = await prismaClient.product.findUniqueOrThrow({ where: { id: mangoId } });
    expect(mangoRow.stockQty.toString()).toBe('2');

    // 4. Catat kerusakan Apel (UNIT): 3 pcs @ HPP 10.000 = 30.000
    const appleWaste = await request(app).post('/v1/waste-records').set(auth('MANAGER')).send({
      productId: appleId,
      wasteType: 'DAMAGED',
      quantity: 3,
      reason: 'Tergencet saat bongkar muat',
      photoUrl: 'https://cdn.istanabuah.id/bukti-apel.jpg',
    });
    expect(appleWaste.status).toBe(201);
    expect(appleWaste.body.data.estimatedCost).toBe('30000.00');

    // Cek mutasi stok WASTE_OUT
    const movRes = await request(app)
      .get(`/v1/stock/movements?productId=${appleId}&movementType=WASTE_OUT`)
      .set(auth('MANAGER'));
    expect(movRes.status).toBe(200);
    expect(movRes.body.data).toHaveLength(1);
    expect(movRes.body.data[0].balanceBefore).toBe('20');
    expect(movRes.body.data[0].balanceAfter).toBe('17');

    // 5. Cek GET /v1/waste-records & detail /:id
    const listRes = await request(app)
      .get('/v1/waste-records?wasteType=DAMAGED')
      .set(auth('OWNER'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(appleWaste.body.data.id);

    const detailRes = await request(app).get(`/v1/waste-records/${okWaste.id}`).set(auth('OWNER'));
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.productName).toBe('Mangga Alpukat');

    // 6. Cek laporan GET /v1/reports/waste-summary
    const summaryRes = await request(app)
      .get('/v1/reports/waste-summary?groupBy=day')
      .set(auth('OWNER'));
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.totalRecords).toBe(2);
    expect(summaryRes.body.data.totalEstimatedCost).toBe('230000.00');
    expect(summaryRes.body.data.topProducts[0].productId).toBe(mangoId);

    // 7. Pastikan cache Dashboard otomatis terbust dan menampilkan todayWaste akurat
    const dashAfter = await request(app).get('/v1/dashboard/summary').set(auth('OWNER'));
    expect(dashAfter.status).toBe(200);
    expect(dashAfter.body.data.todayWaste).toEqual({
      count: 2,
      totalEstimatedCost: '230000.00',
    });
  });
});
