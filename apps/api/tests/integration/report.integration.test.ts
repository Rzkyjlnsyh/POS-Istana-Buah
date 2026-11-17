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

describe('M07-001 Integration: Report & Export API (/v1/reports)', () => {
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
  let categoryLocalId: string;

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
        data: { username: 'kasir_rpt', passwordHash, fullName: 'Kasir Laporan', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'mgr_rpt', passwordHash, fullName: 'Manajer Laporan', role: 'MANAGER' },
      }),
      prismaClient.user.create({
        data: { username: 'owner_rpt', passwordHash, fullName: 'Pemilik Toko', role: 'OWNER' },
      }),
    ]);

    const catLocal = await prismaClient.category.create({ data: { name: 'Buah Tropis' } });
    const catImport = await prismaClient.category.create({ data: { name: 'Buah Impor' } });
    categoryLocalId = catLocal.id;

    const mango = await prismaClient.product.create({
      data: {
        name: 'Mangga Gedong Gincu',
        categoryId: catLocal.id,
        productType: 'WEIGHT',
        pricePerKg: '40000.00',
        costPerKg: '25000.00',
        stockQty: '20.000',
        minStockAlert: '10.000',
        isActive: true,
      },
    });
    const apple = await prismaClient.product.create({
      data: {
        name: 'Apel Honeycrisp',
        categoryId: catImport.id,
        productType: 'UNIT',
        pricePerUnit: '15000.00',
        costPerUnit: '10000.00',
        stockQty: '5.000',
        minStockAlert: '8.000',
        isActive: true,
      },
    });
    mangoId = mango.id;
    appleId = apple.id;

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm07-report-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-report-it'),
    });

    const loginRole = async (username: string): Promise<string> => {
      const res = await request(app).post('/v1/auth/login').send({ username, password: PASSWORD });
      return res.body.data.accessToken as string;
    };

    tokens.CASHIER = await loginRole('kasir_rpt');
    tokens.MANAGER = await loginRole('mgr_rpt');
    tokens.OWNER = await loginRole('owner_rpt');
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  it('menegakkan RBAC OWNER/MANAGER (403 untuk CASHIER), menghitung laporan HPP/margin & membust cache otomatis saat transaksi baru', async () => {
    // 1. Unauthenticated -> 401; CASHIER -> 403
    expect((await request(app).get('/v1/reports/sales-summary')).status).toBe(401);
    const cashierBlocked = await request(app).get('/v1/reports/sales-summary').set(auth('CASHIER'));
    expect(cashierBlocked.status).toBe(403);
    expect(cashierBlocked.body.error.code).toBe(ERROR_CODES.FORBIDDEN);

    expect((await request(app).get('/v1/reports/stock-current').set(auth('CASHIER'))).status).toBe(
      403,
    );
    expect((await request(app).get('/v1/reports/export/sales').set(auth('CASHIER'))).status).toBe(
      403,
    );

    // 2. Transaksi 1 (CASH): 2.5 kg Mangga @ 40rb = 100rb (HPP = 2.5 * 25rb = 62.5rb)
    const tx1 = await request(app)
      .post('/v1/transactions')
      .set(auth('CASHIER'))
      .send({
        items: [{ productId: mangoId, quantity: 2.5, unitPrice: 40000 }],
        paymentMethod: 'CASH',
        amountPaid: 100000,
      });
    expect(tx1.status).toBe(201);

    // Transaksi 2 (QRIS): 4 pcs Apel @ 15rb = 60rb (HPP = 4 * 10rb = 40rb)
    const tx2 = await request(app)
      .post('/v1/transactions')
      .set(auth('CASHIER'))
      .send({
        items: [{ productId: appleId, quantity: 4, unitPrice: 15000 }],
        paymentMethod: 'QRIS',
        amountPaid: 60000,
      });
    expect(tx2.status).toBe(201);

    // Transaksi 3 lalu VOID (harus dihitung di voidedTransactions, bukan revenue)
    const tx3 = await request(app)
      .post('/v1/transactions')
      .set(auth('CASHIER'))
      .send({
        items: [{ productId: mangoId, quantity: 1, unitPrice: 40000 }],
        paymentMethod: 'CASH',
        amountPaid: 40000,
      });
    expect(tx3.status).toBe(201);

    const voidRes = await request(app)
      .put(`/v1/transactions/${tx3.body.data.id}/void`)
      .set(auth('MANAGER'))
      .send({ reason: 'Salah input timbangan uji' });
    expect(voidRes.status).toBe(200);

    // 3. Cek sales-summary (Total Rev = 160.000, COGS = 102.500, Laba Kotor = 57.500)
    const summaryRes = await request(app)
      .get('/v1/reports/sales-summary?groupBy=day')
      .set(auth('MANAGER'));
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.data.totalRevenue).toBe('160000.00');
    expect(summaryRes.body.data.totalTransactions).toBe(2);
    expect(summaryRes.body.data.voidedTransactions).toBe(1);
    expect(summaryRes.body.data.totalCostOfGoodsSold).toBe('102500.00');
    expect(summaryRes.body.data.grossProfit).toBe('57500.00');
    expect(summaryRes.body.data.paymentBreakdown).toHaveLength(2);

    // 4. Cek product-performance sortBy=revenue & sortBy=qty
    const perfByRev = await request(app)
      .get('/v1/reports/product-performance?sortBy=revenue&limit=10')
      .set(auth('OWNER'));
    expect(perfByRev.status).toBe(200);
    expect(perfByRev.body.data.items[0].productId).toBe(mangoId);
    expect(perfByRev.body.data.items[0].totalRevenue).toBe('100000.00');

    const perfByQty = await request(app)
      .get('/v1/reports/product-performance?sortBy=qty&limit=10')
      .set(auth('OWNER'));
    expect(perfByQty.status).toBe(200);
    expect(perfByQty.body.data.items[0].productId).toBe(appleId);

    // 5. Cek stock-current (Sisa stok Mangga: 17.5 kg * 25rb = 437.5rb; Apel: 1 pcs * 10rb = 10rb)
    const stockRes = await request(app).get('/v1/reports/stock-current').set(auth('MANAGER'));
    expect(stockRes.status).toBe(200);
    expect(stockRes.body.data.totalProducts).toBe(2);
    expect(stockRes.body.data.lowStockCount).toBe(1); // Apel (1 <= 8)
    expect(stockRes.body.data.totalStockCostValue).toBe('447500.00');
    expect(stockRes.body.data.totalStockRetailValue).toBe('715000.00');

    const filteredStock = await request(app)
      .get(`/v1/reports/stock-current?categoryId=${categoryLocalId}&lowStockOnly=false`)
      .set(auth('MANAGER'));
    expect(filteredStock.status).toBe(200);
    expect(filteredStock.body.data.totalProducts).toBe(1);

    // 6. Cache bust otomatis ketika ada penjualan baru
    const tx4 = await request(app)
      .post('/v1/transactions')
      .set(auth('CASHIER'))
      .send({
        items: [{ productId: appleId, quantity: 1, unitPrice: 15000 }],
        paymentMethod: 'CASH',
        amountPaid: 20000,
      });
    expect(tx4.status).toBe(201);

    const summaryAfterTx = await request(app)
      .get('/v1/reports/sales-summary?groupBy=day')
      .set(auth('OWNER'));
    expect(summaryAfterTx.status).toBe(200);
    expect(summaryAfterTx.body.data.totalRevenue).toBe('175000.00');
    expect(summaryAfterTx.body.data.totalTransactions).toBe(3);

    // 7. Ekspor CSV, Excel XML (.xls), dan PDF (%PDF-1.4)
    const csvRes = await request(app).get('/v1/reports/export/sales?format=csv').set(auth('OWNER'));
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    expect(csvRes.text).toContain('175000.00');

    const xlsRes = await request(app)
      .get('/v1/reports/export/sales?format=excel')
      .set(auth('OWNER'));
    expect(xlsRes.status).toBe(200);
    expect(xlsRes.headers['content-type']).toContain('application/vnd.ms-excel');
    expect(xlsRes.text).toContain('Detail Transaksi');

    const pdfRes = await request(app)
      .get('/v1/reports/export/sales?format=pdf')
      .set(auth('OWNER'))
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toBe('application/pdf');
    expect((pdfRes.body as Buffer).toString('utf8').startsWith('%PDF-1.4')).toBe(true);
    expect((pdfRes.body as Buffer).toString('utf8').trim().endsWith('%%EOF')).toBe(true);
  });
});
