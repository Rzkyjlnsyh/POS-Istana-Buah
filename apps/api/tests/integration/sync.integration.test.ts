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

describe('M11-002 Integration: Offline Sync Batch (POST /v1/sync/batch) & Delta Pull (GET /v1/sync/pull)', () => {
  let services: EphemeralServicesHandle | undefined;
  let prismaClient: PrismaClient;
  let redisClient: Redis;
  let app: Express;

  const PASSWORD = 'ValidPass123!';
  const tokens: Record<'CASHIER' | 'MANAGER', string> = {
    CASHIER: '',
    MANAGER: '',
  };

  let manggaId: string;
  let alpukatId: string;

  const auth = (role: keyof typeof tokens): Record<string, string> => ({
    Authorization: `Bearer ${tokens[role]}`,
  });

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
        data: { username: 'kasir_sync', passwordHash, fullName: 'Kasir Sync', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: {
          username: 'manajer_sync',
          passwordHash,
          fullName: 'Manajer Sync',
          role: 'MANAGER',
        },
      }),
    ]);

    const category = await prismaClient.category.create({
      data: { name: 'Buah Sync Segar', description: 'Kategori uji sync' },
    });

    const mangga = await prismaClient.product.create({
      data: {
        name: 'Mangga Sync Manis',
        categoryId: category.id,
        productType: 'WEIGHT',
        pricePerKg: '25000.00',
        costPerKg: '18000.00',
        stockQty: '10.000',
        minStockAlert: '2.000',
        isActive: true,
      },
    });
    manggaId = mangga.id;

    const alpukat = await prismaClient.product.create({
      data: {
        name: 'Alpukat Mentega Terbatas',
        categoryId: category.id,
        productType: 'UNIT',
        pricePerUnit: '20000.00',
        costPerUnit: '14000.00',
        stockQty: '1.000',
        minStockAlert: '1.000',
        isActive: true,
      },
    });
    alpukatId = alpukat.id;

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm11-sync-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-sync-it'),
    });

    const cashierLogin = await request(app)
      .post('/v1/auth/login')
      .send({ username: 'kasir_sync', password: PASSWORD });
    tokens.CASHIER = cashierLogin.body.data.accessToken;

    const managerLogin = await request(app)
      .post('/v1/auth/login')
      .send({ username: 'manajer_sync', password: PASSWORD });
    tokens.MANAGER = managerLogin.body.data.accessToken;
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  it('menolak request tanpa autentikasi pada endpoint sinkronisasi (401)', async () => {
    const res = await request(app).get('/v1/sync/pull');
    expect(res.status).toBe(401);
  });

  it('TC-POS-003 & TC-OFFLINE-002: memproses batch offline idempoten (clientId deduplicated) dan melaporkan konflik stok', async () => {
    const firstClientId = 'pos-dev-01-trx-offline-001';
    const secondClientId = 'pos-dev-01-trx-offline-002';
    const conflictClientId = 'pos-dev-01-trx-offline-003';

    const payload = {
      deviceId: 'pos-dev-01',
      operations: [
        {
          type: 'TRANSACTION',
          clientId: firstClientId,
          timestamp: '2026-11-19T10:00:00.000Z',
          data: {
            paymentMethod: 'CASH',
            amountPaid: 50000,
            items: [{ productId: manggaId, quantity: 1.5, unitPrice: 25000 }],
          },
        },
        {
          type: 'TRANSACTION',
          clientId: secondClientId,
          timestamp: '2026-11-19T10:05:00.000Z',
          data: {
            paymentMethod: 'QRIS',
            amountPaid: 25000,
            items: [{ productId: manggaId, quantity: 1.0, unitPrice: 25000 }],
          },
        },
        {
          type: 'TRANSACTION',
          clientId: conflictClientId,
          timestamp: '2026-11-19T10:10:00.000Z',
          data: {
            paymentMethod: 'CASH',
            amountPaid: 100000,
            items: [{ productId: alpukatId, quantity: 5, unitPrice: 20000 }],
          },
        },
      ],
    };

    // Pengiriman batch pertama: 2 transaksi berhasil masuk DB, 1 transaksi konflik stok
    const res1 = await request(app).post('/v1/sync/batch').set(auth('CASHIER')).send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body.data.processed).toBe(3);
    expect(res1.body.data.success).toHaveLength(2);
    expect(res1.body.data.conflicts).toHaveLength(1);
    expect(res1.body.data.conflicts[0]).toEqual(
      expect.objectContaining({
        clientId: conflictClientId,
        code: ERROR_CODES.INSUFFICIENT_STOCK,
      }),
    );

    const updatedMangga = await prismaClient.product.findUniqueOrThrow({ where: { id: manggaId } });
    expect(Number(updatedMangga.stockQty)).toBeCloseTo(7.5, 3);

    // Pengiriman ulang clientId sama (TC-POS-003 Idempotency) -> tidak mengurangi stok ulang
    const resDuplicate = await request(app)
      .post('/v1/sync/batch')
      .set(auth('CASHIER'))
      .send({
        deviceId: 'pos-dev-01',
        operations: [payload.operations[0], payload.operations[1]],
      });

    expect(resDuplicate.status).toBe(200);
    expect(resDuplicate.body.data.success).toHaveLength(2);
    expect(resDuplicate.body.data.success[0].serverId).toBe(res1.body.data.success[0].serverId);

    const afterDuplicateMangga = await prismaClient.product.findUniqueOrThrow({
      where: { id: manggaId },
    });
    expect(Number(afterDuplicateMangga.stockQty)).toBeCloseTo(7.5, 3);

    const txCountInDb = await prismaClient.transaction.count({
      where: { clientId: { in: [firstClientId, secondClientId] } },
    });
    expect(txCountInDb).toBe(2);
  });

  it('menarik pembaruan katalog delta via GET /v1/sync/pull dan menyembunyikan HPP untuk CASHIER', async () => {
    const resCashier = await request(app)
      .get('/v1/sync/pull?types=products,categories')
      .set(auth('CASHIER'));

    expect(resCashier.status).toBe(200);
    expect(resCashier.body.data.products.length).toBeGreaterThanOrEqual(2);
    expect(resCashier.body.data.categories.length).toBeGreaterThanOrEqual(1);
    expect(resCashier.body.data.products[0].costPerKg).toBeNull();
    expect(resCashier.body.data.products[0].costPerUnit).toBeNull();

    const futureSince = encodeURIComponent('2099-01-01T00:00:00.000Z');
    const resDeltaEmpty = await request(app)
      .get(`/v1/sync/pull?since=${futureSince}&types=products`)
      .set(auth('MANAGER'));

    expect(resDeltaEmpty.status).toBe(200);
    expect(resDeltaEmpty.body.data.products).toHaveLength(0);
    expect(resDeltaEmpty.body.data.categories).toHaveLength(0);
  });
});
