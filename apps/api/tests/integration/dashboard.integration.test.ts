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
import { getCalendarYmdDashedInTimeZone, shiftYmdDashed } from '../../src/utils/date-helpers';
import {
  startEphemeralServices,
  type EphemeralServicesHandle,
} from '../helpers/ephemeral-services';

jest.setTimeout(180_000);

describe('M08-001 Integration: Dashboard Owner & Manajer API (/v1/dashboard)', () => {
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
  let ownerId: string;

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
        data: { username: 'kasir_dash', passwordHash, fullName: 'Kasir Dash', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'mgr_dash', passwordHash, fullName: 'Manajer Dash', role: 'MANAGER' },
      }),
      prismaClient.user.create({
        data: { username: 'owner_dash', passwordHash, fullName: 'Owner Dash', role: 'OWNER' },
      }),
    ]);
    ownerId = ownerUser.id;

    const catLocal = await prismaClient.category.create({ data: { name: 'Buah Lokal Dash' } });
    const supplier = await prismaClient.supplier.create({ data: { name: 'Petani Uji Dash' } });

    const mango = await prismaClient.product.create({
      data: {
        name: 'Mangga Dash',
        categoryId: catLocal.id,
        productType: 'WEIGHT',
        pricePerKg: '40000.00',
        costPerKg: '25000.00',
        stockQty: '5.000',
        minStockAlert: '10.000',
        isActive: true,
      },
    });
    const apple = await prismaClient.product.create({
      data: {
        name: 'Apel Dash',
        categoryId: catLocal.id,
        productType: 'UNIT',
        pricePerUnit: '15000.00',
        costPerUnit: '9000.00',
        stockQty: '0.000',
        minStockAlert: '5.000',
        isActive: true,
      },
    });
    mangoId = mango.id;
    appleId = apple.id;

    await prismaClient.purchaseOrder.create({
      data: {
        supplierId: supplier.id,
        referenceNo: 'PO-20261119-01',
        totalAmount: '600000.00',
        paidAmount: '250000.00',
        status: 'PARTIAL',
        createdBy: ownerId,
      },
    });

    await prismaClient.wasteRecord.create({
      data: {
        productId: mangoId,
        wasteType: 'ROTTEN',
        quantity: '1.000',
        estimatedCost: '25000.00',
        reason: 'Busuk penyimpanan',
        recordedBy: ownerId,
      },
    });

    // Seed transaksi kemarin agar comparison kemarin vs hari ini teruji nyata
    const todayYmd = getCalendarYmdDashedInTimeZone(new Date(), appConfig.timezone);
    const yesterdayYmd = shiftYmdDashed(todayYmd, -1);
    const yesterdayDate = new Date(`${yesterdayYmd}T05:00:00.000Z`);

    await prismaClient.transaction.create({
      data: {
        transactionNo: 'TRX-YEST-0001',
        cashierId: ownerId,
        status: 'COMPLETED',
        subtotal: '100000.00',
        totalAmount: '100000.00',
        paymentMethod: 'QRIS',
        amountPaid: '100000.00',
        transactedAt: yesterdayDate,
        items: {
          create: {
            productId: mangoId,
            productName: 'Mangga Dash',
            productType: 'WEIGHT',
            quantity: '2.500',
            unitPrice: '40000.00',
            unitCost: '25000.00',
            lineTotal: '100000.00',
          },
        },
      },
    });

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm08-dash-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-dash-it'),
    });

    const loginRole = async (username: string): Promise<string> => {
      const res = await request(app).post('/v1/auth/login').send({ username, password: PASSWORD });
      return res.body.data.accessToken as string;
    };

    tokens.CASHIER = await loginRole('kasir_dash');
    tokens.MANAGER = await loginRole('mgr_dash');
    tokens.OWNER = await loginRole('owner_dash');
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  it('menegakkan RBAC OWNER/MANAGER (403 untuk CASHIER), menghitung KPI & charts real-time serta membust cache saat shift/transaksi baru', async () => {
    // 1. Unauthenticated -> 401; CASHIER -> 403
    expect((await request(app).get('/v1/dashboard/summary')).status).toBe(401);
    const cashierBlocked = await request(app).get('/v1/dashboard/summary').set(auth('CASHIER'));
    expect(cashierBlocked.status).toBe(403);
    expect(cashierBlocked.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    expect((await request(app).get('/v1/dashboard/charts').set(auth('CASHIER'))).status).toBe(403);

    // 2. Kasir membuka shift + melakukan transaksi Rp 80.000
    const openShiftRes = await request(app)
      .post('/v1/shifts/open')
      .set(auth('CASHIER'))
      .send({ openingCash: 300000, notes: 'Shift Pagi Dash' });
    expect(openShiftRes.status).toBe(201);

    const txRes = await request(app)
      .post('/v1/transactions')
      .set(auth('CASHIER'))
      .send({
        items: [{ productId: mangoId, quantity: 2, unitPrice: 40000 }],
        paymentMethod: 'CASH',
        amountPaid: 100000,
      });
    expect(txRes.status).toBe(201);

    // 3. OWNER mengambil summary
    const sumRes = await request(app).get('/v1/dashboard/summary').set(auth('OWNER'));
    expect(sumRes.status).toBe(200);
    expect(sumRes.body.data.today.revenue).toBe('80000.00');
    expect(sumRes.body.data.today.grossProfit).toBe('30000.00');
    expect(sumRes.body.data.yesterday.revenue).toBe('100000.00');
    expect(sumRes.body.data.comparison.revenueChangeAmount).toBe('-20000.00');
    expect(sumRes.body.data.comparison.revenueChangePercent).toBe('-20.00');
    expect(sumRes.body.data.openShifts.count).toBe(1);
    expect(sumRes.body.data.lowStock.totalCount).toBe(2);
    expect(sumRes.body.data.lowStock.outOfStockCount).toBe(1);
    expect(sumRes.body.data.topProductsToday[0].productId).toBe(mangoId);
    expect(sumRes.body.data.unpaidPurchaseOrders).toEqual({
      count: 1,
      totalOutstandingDebt: '350000.00',
    });
    expect(sumRes.body.data.todayWaste).toEqual({
      count: 1,
      totalEstimatedCost: '25000.00',
    });

    // 4. Charts 7 hari penuh
    const chartRes = await request(app).get('/v1/dashboard/charts?days=7').set(auth('MANAGER'));
    expect(chartRes.status).toBe(200);
    expect(chartRes.body.data.timeline).toHaveLength(7);
    expect(chartRes.body.data.totalRevenue).toBe('180000.00');
    expect(chartRes.body.data.categoryBreakdown[0].categoryName).toBe('Buah Lokal Dash');

    // 5. Cache otomatis bust setelah transaksi baru (Apel? stok Apel 0 -> restok dulu atau pakai Mangga lagi)
    const tx2Res = await request(app)
      .post('/v1/transactions')
      .set(auth('CASHIER'))
      .send({
        items: [{ productId: mangoId, quantity: 1, unitPrice: 40000 }],
        paymentMethod: 'QRIS',
        amountPaid: 40000,
      });
    expect(tx2Res.status).toBe(201);
    expect(appleId).toBeDefined();

    const sumAfter = await request(app).get('/v1/dashboard/summary').set(auth('OWNER'));
    expect(sumAfter.status).toBe(200);
    expect(sumAfter.body.data.today.revenue).toBe('120000.00');
    expect(sumAfter.body.data.comparison.revenueChangePercent).toBe('20.00');
  });
});
