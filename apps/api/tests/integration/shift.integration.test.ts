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

describe('M06-001 Integration: Shift Kasir API (/v1/shifts)', () => {
  let services: EphemeralServicesHandle | undefined;
  let prismaClient: PrismaClient;
  let redisClient: Redis;
  let app: Express;

  const PASSWORD = 'ValidPass123!';
  const tokens: Record<'CASHIER1' | 'CASHIER2' | 'MANAGER', string> = {
    CASHIER1: '',
    CASHIER2: '',
    MANAGER: '',
  };

  const auth = (role: keyof typeof tokens): Record<string, string> => ({
    Authorization: `Bearer ${tokens[role]}`,
  });

  let productId: string;

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
        data: { username: 'kasir_shift1', passwordHash, fullName: 'Kasir Satu', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'kasir_shift2', passwordHash, fullName: 'Kasir Dua', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'mgr_shift', passwordHash, fullName: 'Manajer Shift', role: 'MANAGER' },
      }),
    ]);

    const cat = await prismaClient.category.create({ data: { name: 'Buah Shift Test' } });
    const prod = await prismaClient.product.create({
      data: {
        name: 'Jeruk Sunkist',
        categoryId: cat.id,
        productType: 'WEIGHT',
        pricePerKg: '30000.00',
        costPerKg: '20000.00',
        stockQty: '50.000',
        isActive: true,
      },
    });
    productId = prod.id;

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm06-shift-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-shift-it'),
    });

    const loginRole = async (username: string): Promise<string> => {
      const res = await request(app).post('/v1/auth/login').send({ username, password: PASSWORD });
      return res.body.data.accessToken as string;
    };

    tokens.CASHIER1 = await loginRole('kasir_shift1');
    tokens.CASHIER2 = await loginRole('kasir_shift2');
    tokens.MANAGER = await loginRole('mgr_shift');
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  it('menjalankan siklus penuh buka shift anti-double-open, transaksi terhubung otomatis, isolasi kasir & tutup shift', async () => {
    // 1. Unauthenticated -> 401
    expect((await request(app).get('/v1/shifts/active')).status).toBe(401);

    // 2. Concurrent double-open oleh CASHIER1 harus menghasilkan tepat 1x 201 & 1x 409 SHIFT_ALREADY_OPEN
    const [open1, open2] = await Promise.all([
      request(app)
        .post('/v1/shifts/open')
        .set(auth('CASHIER1'))
        .send({ openingCash: 500000, notes: 'Shift Pagi' }),
      request(app)
        .post('/v1/shifts/open')
        .set(auth('CASHIER1'))
        .send({ openingCash: 500000, notes: 'Shift Pagi Ganda' }),
    ]);

    const statuses = [open1.status, open2.status].sort();
    expect(statuses).toEqual([201, 409]);

    const createdShift = open1.status === 201 ? open1.body.data : open2.body.data;
    const shiftId = createdShift.id as string;
    expect(createdShift.shiftNo).toMatch(/^SHIFT-\d{8}-\d{3}$/);

    // 3. CASHIER1 melakukan transaksi CASH (Rp 60.000) + QRIS (Rp 30.000) tanpa mengirim shiftId eksplisit
    const txCashRes = await request(app)
      .post('/v1/transactions')
      .set(auth('CASHIER1'))
      .send({
        items: [{ productId, quantity: 2, unitPrice: 30000 }],
        paymentMethod: 'CASH',
        amountPaid: 100000,
      });
    expect(txCashRes.status).toBe(201);
    expect(txCashRes.body.data.shiftId).toBe(shiftId);

    const txQrisRes = await request(app)
      .post('/v1/transactions')
      .set(auth('CASHIER1'))
      .send({
        items: [{ productId, quantity: 1, unitPrice: 30000 }],
        paymentMethod: 'QRIS',
        amountPaid: 30000,
      });
    expect(txQrisRes.status).toBe(201);

    // Cek /shifts/active mencerminkan ringkasan live
    const activeRes = await request(app).get('/v1/shifts/active').set(auth('CASHIER1'));
    expect(activeRes.status).toBe(200);
    expect(activeRes.body.data.totalSales).toBe('90000.00');
    expect(activeRes.body.data.expectedCash).toBe('560000.00'); // 500rb + 60rb tunai

    // 4. CASHIER2 terisolasi (tidak melihat shift CASHIER1 dan ditolak menutup shift orang lain)
    const listCashier2 = await request(app).get('/v1/shifts').set(auth('CASHIER2'));
    expect(listCashier2.status).toBe(200);
    expect(listCashier2.body.data).toHaveLength(0);

    const closeByOther = await request(app)
      .put(`/v1/shifts/${shiftId}/close`)
      .set(auth('CASHIER2'))
      .send({ closingCash: 560000 });
    expect(closeByOther.status).toBe(403);

    // 5. CASHIER1 menutup shift dengan selisih Rp +5.000
    const closeRes = await request(app)
      .put(`/v1/shifts/${shiftId}/close`)
      .set(auth('CASHIER1'))
      .send({ closingCash: 565000, notes: 'Selesai aman' });
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.data.status).toBe('CLOSED');
    expect(closeRes.body.data.expectedCash).toBe('560000.00');
    expect(closeRes.body.data.cashDifference).toBe('5000.00');
    expect(closeRes.body.data.summary.cashSales).toBe('60000.00');
    expect(closeRes.body.data.summary.qrisSales).toBe('30000.00');

    // Tutup ganda ditolak 400 SHIFT_ALREADY_CLOSED
    const doubleClose = await request(app)
      .put(`/v1/shifts/${shiftId}/close`)
      .set(auth('CASHIER1'))
      .send({ closingCash: 565000 });
    expect(doubleClose.status).toBe(400);
    expect(doubleClose.body.error.code).toBe(ERROR_CODES.SHIFT_ALREADY_CLOSED);

    // MANAGER dapat memantau seluruh riwayat shift & membuka detail shift kasir lain
    const mgrList = await request(app).get('/v1/shifts?status=CLOSED').set(auth('MANAGER'));
    expect(mgrList.status).toBe(200);
    expect(mgrList.body.data.some((s: { id: string }) => s.id === shiftId)).toBe(true);

    const mgrDetail = await request(app).get(`/v1/shifts/${shiftId}`).set(auth('MANAGER'));
    expect(mgrDetail.status).toBe(200);
    expect(mgrDetail.body.data.id).toBe(shiftId);

    const cashier2Detail = await request(app).get(`/v1/shifts/${shiftId}`).set(auth('CASHIER2'));
    expect(cashier2Detail.status).toBe(404);
  });
});
