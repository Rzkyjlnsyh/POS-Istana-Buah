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

describe('M05-001 Integration: Supplier CRUD API (/v1/suppliers)', () => {
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

  let ownerUserId: string;

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
    const [, , ownerUser] = await prismaClient.$transaction([
      prismaClient.user.create({
        data: { username: 'kasir_sup', passwordHash, fullName: 'Kasir Sup', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'manajer_sup', passwordHash, fullName: 'Manajer Sup', role: 'MANAGER' },
      }),
      prismaClient.user.create({
        data: { username: 'pemilik_sup', passwordHash, fullName: 'Pemilik Sup', role: 'OWNER' },
      }),
    ]);
    ownerUserId = ownerUser.id;

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm05-sup-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-sup-it'),
    });

    const loginRole = async (username: string): Promise<string> => {
      const res = await request(app).post('/v1/auth/login').send({ username, password: PASSWORD });
      return res.body.data.accessToken as string;
    };

    tokens.CASHIER = await loginRole('kasir_sup');
    tokens.MANAGER = await loginRole('manajer_sup');
    tokens.OWNER = await loginRole('pemilik_sup');
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  it('menolak unauthenticated (401) dan CASHIER (403 FORBIDDEN)', async () => {
    expect((await request(app).get('/v1/suppliers')).status).toBe(401);

    const cashierRes = await request(app).get('/v1/suppliers').set(auth('CASHIER'));
    expect(cashierRes.status).toBe(403);
    expect(cashierRes.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('mendukung CRUD penuh supplier, validasi duplikat 409, ringkasan PO/hutang, dan proteksi SUPPLIER_IN_USE', async () => {
    // 1. Create supplier
    const createRes = await request(app).post('/v1/suppliers').set(auth('MANAGER')).send({
      name: 'UD Kebun Hijau',
      contactPerson: 'Siti Rahayu',
      phoneNumber: '081298765432',
      address: 'Kab. Semarang',
      notes: 'Suplai mangga & alpukat',
    });
    expect(createRes.status).toBe(201);
    const supId = createRes.body.data.id as string;
    expect(createRes.body.data.outstandingDebt).toBe('0.00');

    // 2. Duplicate supplier (case-insensitive) -> 409 DUPLICATE_SUPPLIER
    const dupRes = await request(app)
      .post('/v1/suppliers')
      .set(auth('MANAGER'))
      .send({ name: 'ud kebun hijau' });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe(ERROR_CODES.DUPLICATE_SUPPLIER);

    // 3. Buat PO PENDING untuk verifikasi ringkasan hutang + proteksi delete
    const po = await prismaClient.purchaseOrder.create({
      data: {
        supplierId: supId,
        referenceNo: 'PO-20261117-01',
        totalAmount: '1250000.00',
        paidAmount: '500000.00',
        status: 'PENDING',
        createdBy: ownerUserId,
      },
    });

    // List supplier & detail supplier menampilkan outstandingDebt = 750000.00
    const listRes = await request(app).get('/v1/suppliers?search=Kebun').set(auth('OWNER'));
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].outstandingDebt).toBe('750000.00');

    const detailRes = await request(app).get(`/v1/suppliers/${supId}`).set(auth('OWNER'));
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.recentPurchaseOrders).toHaveLength(1);
    expect(detailRes.body.data.recentPurchaseOrders[0].remainingDebt).toBe('750000.00');

    // Update supplier
    const updateRes = await request(app)
      .put(`/v1/suppliers/${supId}`)
      .set(auth('MANAGER'))
      .send({ phoneNumber: '081300001111', contactPerson: 'Siti R.' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.contactPerson).toBe('Siti R.');

    // Delete ditolak selama ada PO PENDING
    const blockedDelete = await request(app).delete(`/v1/suppliers/${supId}`).set(auth('OWNER'));
    expect(blockedDelete.status).toBe(409);
    expect(blockedDelete.body.error.code).toBe(ERROR_CODES.SUPPLIER_IN_USE);

    // Selesaikan PO -> soft delete berhasil
    await prismaClient.purchaseOrder.update({
      where: { id: po.id },
      data: { status: 'RECEIVED', deliveredAt: new Date() },
    });

    const delRes = await request(app).delete(`/v1/suppliers/${supId}`).set(auth('OWNER'));
    expect(delRes.status).toBe(200);

    // Detail setelah soft delete -> 404
    const afterDelDetail = await request(app).get(`/v1/suppliers/${supId}`).set(auth('OWNER'));
    expect(afterDelDetail.status).toBe(404);
  });
});
