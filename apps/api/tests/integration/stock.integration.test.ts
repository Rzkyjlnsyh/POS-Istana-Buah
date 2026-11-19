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

describe('M04-001 Integration: Stock Service API (/v1/stock)', () => {
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

  let categoryId: string;
  let mangoId: string;
  let orangeId: string;
  let supplierId: string;
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
        data: { username: 'kasir_stk', passwordHash, fullName: 'Kasir Stok', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'manajer_stk', passwordHash, fullName: 'Manajer Stok', role: 'MANAGER' },
      }),
      prismaClient.user.create({
        data: { username: 'pemilik_stk', passwordHash, fullName: 'Pemilik Stok', role: 'OWNER' },
      }),
    ]);
    ownerUserId = ownerUser.id;

    const category = await prismaClient.category.create({
      data: { name: 'Buah Tropis', description: 'Kategori uji manajemen stok' },
    });
    categoryId = category.id;

    const mango = await prismaClient.product.create({
      data: {
        name: 'Mangga Harum Manis',
        categoryId,
        productType: 'WEIGHT',
        pricePerKg: '28000.00',
        costPerKg: '18000.00',
        stockQty: '5.000',
        minStockAlert: '4.000',
        isActive: true,
      },
    });
    mangoId = mango.id;

    const orange = await prismaClient.product.create({
      data: {
        name: 'Jeruk Mandarin',
        categoryId,
        productType: 'WEIGHT',
        pricePerKg: '32000.00',
        costPerKg: '22000.00',
        stockQty: '3.000',
        minStockAlert: '5.000',
        isActive: true,
      },
    });
    orangeId = orange.id;

    const supplier = await prismaClient.supplier.create({
      data: {
        name: 'CV Agro Makmur',
        contactPerson: 'Budi Santoso',
        phoneNumber: '081234567890',
        isActive: true,
      },
    });
    supplierId = supplier.id;

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm04-stk-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-stk-it'),
    });

    const loginRole = async (username: string): Promise<string> => {
      const res = await request(app).post('/v1/auth/login').send({ username, password: PASSWORD });
      return res.body.data.accessToken as string;
    };

    tokens.CASHIER = await loginRole('kasir_stk');
    tokens.MANAGER = await loginRole('manajer_stk');
    tokens.OWNER = await loginRole('pemilik_stk');
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  describe('RBAC & Keamanan (TC-SEC-003)', () => {
    it('menolak unauthenticated (401) dan menolak CASHIER pada endpoint tulis/audit stok (403)', async () => {
      const unauthRes = await request(app).get('/v1/stock/low-alert');
      expect(unauthRes.status).toBe(401);

      const receiveRes = await request(app)
        .post('/v1/stock/receive')
        .set(auth('CASHIER'))
        .send({ items: [{ productId: mangoId, quantity: 5 }] });
      expect(receiveRes.status).toBe(403);
      expect(receiveRes.body.error.code).toBe(ERROR_CODES.FORBIDDEN);

      const opnameRes = await request(app)
        .post('/v1/stock/opname')
        .set(auth('CASHIER'))
        .send({ items: [{ productId: mangoId, physicalQty: 5 }] });
      expect(opnameRes.status).toBe(403);

      const movRes = await request(app).get('/v1/stock/movements').set(auth('CASHIER'));
      expect(movRes.status).toBe(403);

      // CASHIER boleh melihat peringatan stok menipis tanpa data sensitif HPP
      const lowRes = await request(app).get('/v1/stock/low-alert').set(auth('CASHIER'));
      expect(lowRes.status).toBe(200);
      expect(lowRes.body.data).toHaveLength(1);
      expect(lowRes.body.data[0].name).toBe('Jeruk Mandarin');
      expect(lowRes.body.data[0].deficit).toBe('2');
      expect(lowRes.body.data[0].costPerKg).toBeUndefined();
    });
  });

  describe('POST /v1/stock/receive (TC-STK-001)', () => {
    it('TC-STK-001: penerimaan 20 kg Mangga menambah stok 5 -> 25 kg dan mencatat StockMovement', async () => {
      const res = await request(app)
        .post('/v1/stock/receive')
        .set(auth('MANAGER'))
        .send({
          supplierId,
          items: [{ productId: mangoId, quantity: 20, unitCost: 19000 }],
          notes: 'Panen Raya Probolinggo',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.supplierName).toBe('CV Agro Makmur');
      expect(res.body.data.movements).toHaveLength(1);
      expect(res.body.data.movements[0].movementType).toBe('PURCHASE_IN');
      expect(res.body.data.movements[0].balanceBefore).toBe('5');
      expect(res.body.data.movements[0].balanceAfter).toBe('25');

      const updatedMango = await prismaClient.product.findUnique({ where: { id: mangoId } });
      expect(Number(updatedMango?.stockQty)).toBe(25);
      expect(Number(updatedMango?.costPerKg)).toBe(19000);
    });

    it('memperbarui status Purchase Order (PARTIAL -> RECEIVED) dan membust cache low-alert', async () => {
      const po = await prismaClient.purchaseOrder.create({
        data: {
          supplierId,
          referenceNo: 'PO-20261117-01',
          totalAmount: '500000.00',
          status: 'PENDING',
          createdBy: ownerUserId,
          items: {
            create: [
              {
                productId: orangeId,
                quantity: '10.000',
                unitCost: '22000.00',
                totalCost: '220000.00',
              },
              {
                productId: mangoId,
                quantity: '5.000',
                unitCost: '19000.00',
                totalCost: '95000.00',
              },
            ],
          },
        },
      });

      // Penerimaan parsial pertama: Jeruk 6 kg -> PO PARTIAL & Jeruk naik dari 3 ke 9 (> minStockAlert 5)
      const partialRes = await request(app)
        .post('/v1/stock/receive')
        .set(auth('OWNER'))
        .send({
          purchaseOrderId: po.id,
          items: [{ productId: orangeId, quantity: 6 }],
          notes: 'Kloter 1',
        });
      expect(partialRes.status).toBe(201);

      const poAfterPartial = await prismaClient.purchaseOrder.findUnique({ where: { id: po.id } });
      expect(poAfterPartial?.status).toBe('PARTIAL');

      // Cache low-alert harus langsung terbust: Jeruk tidak lagi menipis
      const lowAfterReceive = await request(app).get('/v1/stock/low-alert').set(auth('MANAGER'));
      expect(lowAfterReceive.status).toBe(200);
      expect(lowAfterReceive.body.data).toHaveLength(0);

      // Penerimaan kloter 2: sisa Jeruk 4 kg + Mangga 5 kg -> PO RECEIVED
      const fullRes = await request(app)
        .post('/v1/stock/receive')
        .set(auth('OWNER'))
        .send({
          purchaseOrderId: po.id,
          items: [
            { productId: orangeId, quantity: 4 },
            { productId: mangoId, quantity: 5 },
          ],
        });
      expect(fullRes.status).toBe(201);

      const poAfterFull = await prismaClient.purchaseOrder.findUnique({ where: { id: po.id } });
      expect(poAfterFull?.status).toBe('RECEIVED');
      expect(poAfterFull?.deliveredAt).not.toBeNull();
    });
  });

  describe('POST /v1/stock/opname & PUT /v1/stock/opname/:id/finalize', () => {
    it('mendukung draft lalu finalisasi serta opname langsung dengan selisih bertanda', async () => {
      // Mangga saat ini = 30 kg, Jeruk = 13 kg
      const draftRes = await request(app)
        .post('/v1/stock/opname')
        .set(auth('MANAGER'))
        .send({
          items: [{ productId: orangeId, physicalQty: 11.5, notes: 'Susut pengiriman' }],
          notes: 'Opname draft sore',
          finalize: false,
        });

      expect(draftRes.status).toBe(201);
      expect(draftRes.body.data.status).toBe('DRAFT');
      expect(draftRes.body.data.referenceNo).toMatch(/^OPN-\d{8}-\d{2,}$/);

      // Stok belum berubah saat masih DRAFT
      const orangeDuringDraft = await prismaClient.product.findUnique({ where: { id: orangeId } });
      expect(Number(orangeDuringDraft?.stockQty)).toBe(13);

      // Finalisasi draft
      const finalizeRes = await request(app)
        .put(`/v1/stock/opname/${draftRes.body.data.id}/finalize`)
        .set(auth('MANAGER'));
      expect(finalizeRes.status).toBe(200);
      expect(finalizeRes.body.data.status).toBe('COMPLETED');
      expect(finalizeRes.body.data.items[0].difference).toBe('-1.5');

      const orangeAfterOpname = await prismaClient.product.findUnique({ where: { id: orangeId } });
      expect(Number(orangeAfterOpname?.stockQty)).toBe(11.5);

      // Finalisasi ulang harus ditolak 400 STOCK_OPNAME_ALREADY_COMPLETED
      const doubleFinalizeRes = await request(app)
        .put(`/v1/stock/opname/${draftRes.body.data.id}/finalize`)
        .set(auth('OWNER'));
      expect(doubleFinalizeRes.status).toBe(400);
      expect(doubleFinalizeRes.body.error.code).toBe(ERROR_CODES.STOCK_OPNAME_ALREADY_COMPLETED);

      // Opname langsung (finalize: true default) menaikkan stok Jeruk kembali dari 11.5 -> 2.0 (memicu low-alert lagi)
      const immediateRes = await request(app)
        .post('/v1/stock/opname')
        .set(auth('OWNER'))
        .send({
          items: [
            { productId: mangoId, physicalQty: 28 },
            { productId: orangeId, physicalQty: 2 },
          ],
          notes: 'Opname final akhir shift',
        });
      expect(immediateRes.status).toBe(201);
      expect(immediateRes.body.data.status).toBe('COMPLETED');
      expect(immediateRes.body.data.adjustedItemsCount).toBe(2);

      // Low-alert muncul kembali untuk Jeruk
      const lowRes = await request(app)
        .get(`/v1/stock/low-alert?categoryId=${categoryId}`)
        .set(auth('MANAGER'));
      expect(lowRes.status).toBe(200);
      expect(lowRes.body.data).toHaveLength(1);
      expect(lowRes.body.data[0].id).toBe(orangeId);
    });
  });

  describe('GET /v1/stock/movements & /v1/stock/opnames', () => {
    it('mengembalikan riwayat mutasi stok & dokumen opname dengan filter akurat', async () => {
      const movRes = await request(app)
        .get(`/v1/stock/movements?productId=${mangoId}&type=PURCHASE_IN`)
        .set(auth('MANAGER'));

      expect(movRes.status).toBe(200);
      expect(movRes.body.data.length).toBeGreaterThanOrEqual(2);
      expect(movRes.body.data[0].productId).toBe(mangoId);
      expect(movRes.body.data[0].createdByName).toBeTruthy();

      const opnListRes = await request(app)
        .get('/v1/stock/opnames?status=COMPLETED')
        .set(auth('OWNER'));
      expect(opnListRes.status).toBe(200);
      expect(opnListRes.body.data.length).toBeGreaterThanOrEqual(2);

      const detailRes = await request(app)
        .get(`/v1/stock/opnames/${opnListRes.body.data[0].id}`)
        .set(auth('OWNER'));
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.items.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Concurrency Safety (Anti Race-Condition)', () => {
    it('5 receiveStock paralel pada produk sama menjaga akumulasi stok eksak & nomor opname paralel bebas tabrakan', async () => {
      const beforeMango = await prismaClient.product.findUnique({ where: { id: mangoId } });
      const startStock = Number(beforeMango?.stockQty ?? 0);

      const parallelReceives = await Promise.all(
        Array.from({ length: 5 }, (_, idx) =>
          request(app)
            .post('/v1/stock/receive')
            .set(auth('MANAGER'))
            .send({
              items: [{ productId: mangoId, quantity: 1.25 }],
              notes: `Parallel receive #${String(idx + 1)}`,
            }),
        ),
      );

      for (const r of parallelReceives) {
        expect(r.status).toBe(201);
      }

      const afterMango = await prismaClient.product.findUnique({ where: { id: mangoId } });
      expect(Number(afterMango?.stockQty)).toBe(startStock + 6.25);

      const parallelOpnames = await Promise.all(
        Array.from({ length: 3 }, (_, idx) =>
          request(app)
            .post('/v1/stock/opname')
            .set(auth('OWNER'))
            .send({
              items: [{ productId: mangoId, physicalQty: Number(afterMango?.stockQty) }],
              notes: `Parallel opname #${String(idx + 1)}`,
            }),
        ),
      );

      const refNos = new Set<string>();
      for (const op of parallelOpnames) {
        expect(op.status).toBe(201);
        refNos.add(op.body.data.referenceNo as string);
      }
      expect(refNos.size).toBe(3);
    });
  });
});
