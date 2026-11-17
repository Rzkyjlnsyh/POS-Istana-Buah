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

describe('M05-002 Integration: Purchase Order API (/v1/purchase-orders)', () => {
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

  let supplierId: string;
  let mangoId: string;

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
        data: { username: 'kasir_po', passwordHash, fullName: 'Kasir PO', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'manajer_po', passwordHash, fullName: 'Manajer PO', role: 'MANAGER' },
      }),
      prismaClient.user.create({
        data: { username: 'pemilik_po', passwordHash, fullName: 'Pemilik PO', role: 'OWNER' },
      }),
    ]);

    const category = await prismaClient.category.create({
      data: { name: 'Buah PO Test' },
    });
    const mango = await prismaClient.product.create({
      data: {
        name: 'Mangga Indramayu',
        categoryId: category.id,
        productType: 'WEIGHT',
        pricePerKg: '28000.00',
        costPerKg: '18000.00',
        stockQty: '5.000',
        isActive: true,
      },
    });
    mangoId = mango.id;

    const supplier = await prismaClient.supplier.create({
      data: { name: 'UD Buah Nusantara', isActive: true },
    });
    supplierId = supplier.id;

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm05-po-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-po-it'),
    });

    const loginRole = async (username: string): Promise<string> => {
      const res = await request(app).post('/v1/auth/login').send({ username, password: PASSWORD });
      return res.body.data.accessToken as string;
    };

    tokens.CASHIER = await loginRole('kasir_po');
    tokens.MANAGER = await loginRole('manajer_po');
    tokens.OWNER = await loginRole('pemilik_po');
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  it('menolak unauthenticated (401) dan CASHIER (403 FORBIDDEN)', async () => {
    expect((await request(app).get('/v1/purchase-orders')).status).toBe(401);

    const cashierRes = await request(app).get('/v1/purchase-orders').set(auth('CASHIER'));
    expect(cashierRes.status).toBe(403);
    expect(cashierRes.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('mengelola siklus hidup PO: create -> unpaidOnly -> pay hutang -> receive stok -> cancel guard & paralel', async () => {
    // 1. Create PO dengan DP
    const createRes = await request(app)
      .post('/v1/purchase-orders')
      .set(auth('MANAGER'))
      .send({
        supplierId,
        items: [{ productId: mangoId, quantity: 20, unitCost: 18000 }],
        paidAmount: 100000,
        notes: 'PO Kloter Pagi',
      });

    expect(createRes.status).toBe(201);
    const poId = createRes.body.data.id as string;
    expect(createRes.body.data.referenceNo).toMatch(/^PO-\d{8}-\d{2,}$/);
    expect(createRes.body.data.totalAmount).toBe('360000.00');
    expect(createRes.body.data.remainingDebt).toBe('260000.00');

    // 2. Query unpaidOnly menampilkan PO dengan sisa hutang
    const unpaidRes = await request(app)
      .get('/v1/purchase-orders?unpaidOnly=true')
      .set(auth('OWNER'));
    expect(unpaidRes.status).toBe(200);
    expect(unpaidRes.body.data.some((p: { id: string }) => p.id === poId)).toBe(true);

    // 3. Bayar melebihi sisa hutang (260rb) -> ditolak 400
    const overpayRes = await request(app)
      .put(`/v1/purchase-orders/${poId}/payment`)
      .set(auth('OWNER'))
      .send({ amount: 300000 });
    expect(overpayRes.status).toBe(400);

    // 4. Lunasi sisa hutang 260rb -> remainingDebt = 0.00
    const payRes = await request(app)
      .put(`/v1/purchase-orders/${poId}/payment`)
      .set(auth('OWNER'))
      .send({ amount: 260000, notes: 'Lunas tunai kasir pusat' });
    expect(payRes.status).toBe(200);
    expect(payRes.body.data.remainingDebt).toBe('0.00');

    // 5. Terima barang dari PO ini via Stock API -> PO menjadi RECEIVED
    const receiveRes = await request(app)
      .post('/v1/stock/receive')
      .set(auth('MANAGER'))
      .send({
        purchaseOrderId: poId,
        items: [{ productId: mangoId, quantity: 20, unitCost: 18000 }],
      });
    expect(receiveRes.status).toBe(201);

    const detailAfterReceive = await request(app)
      .get(`/v1/purchase-orders/${poId}`)
      .set(auth('MANAGER'));
    expect(detailAfterReceive.status).toBe(200);
    expect(detailAfterReceive.body.data.status).toBe('RECEIVED');

    // 6. Cancel PO yang sudah RECEIVED harus ditolak 400
    const cancelReceivedRes = await request(app)
      .put(`/v1/purchase-orders/${poId}/cancel`)
      .set(auth('OWNER'));
    expect(cancelReceivedRes.status).toBe(400);

    // 7. Create 3 PO paralel harus menghasilkan referenceNo unik tanpa tabrakan
    const parallelPOs = await Promise.all(
      Array.from({ length: 3 }, (_, idx) =>
        request(app)
          .post('/v1/purchase-orders')
          .set(auth('MANAGER'))
          .send({
            supplierId,
            items: [{ productId: mangoId, quantity: 5, unitCost: 18000 }],
            notes: `Parallel PO #${String(idx + 1)}`,
          }),
      ),
    );
    const refs = new Set<string>();
    for (const poRes of parallelPOs) {
      expect(poRes.status).toBe(201);
      refs.add(poRes.body.data.referenceNo as string);
    }
    expect(refs.size).toBe(3);

    // Batalkan salah satu PO PENDING
    const pendingPoId = parallelPOs[0]?.body.data.id as string;
    const cancelRes = await request(app)
      .put(`/v1/purchase-orders/${pendingPoId}/cancel`)
      .set(auth('OWNER'));
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('CANCELLED');
  });
});
