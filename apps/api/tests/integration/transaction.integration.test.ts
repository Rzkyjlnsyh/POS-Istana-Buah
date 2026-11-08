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
import { createPrismaClient, disconnectDatabase } from '../../src/lib/prisma';
import { createRedisClient, disconnectRedis } from '../../src/lib/redis';
import {
  startEphemeralServices,
  type EphemeralServicesHandle,
} from '../helpers/ephemeral-services';

jest.setTimeout(180_000);

describe('M03-001 Integration: Transaction API, POS Atomic Stock & Idempotency', () => {
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

  let testWeightProductId: string;
  let testUnitProductId: string;

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
        data: { username: 'kasir_pos', passwordHash, fullName: 'Kasir POS', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'manajer_pos', passwordHash, fullName: 'Manajer POS', role: 'MANAGER' },
      }),
      prismaClient.user.create({
        data: { username: 'pemilik_pos', passwordHash, fullName: 'Pemilik POS', role: 'OWNER' },
      }),
    ]);

    const category = await prismaClient.category.create({
      data: {
        name: 'Buah Segar Transaksi',
        description: 'Kategori untuk pengujian transaksi POS',
      },
    });

    const weightProd = await prismaClient.product.create({
      data: {
        name: 'Mangga Arumanis Super',
        categoryId: category.id,
        productType: 'WEIGHT',
        pricePerKg: '25000.00',
        costPerKg: '18000.00',
        stockQty: '10.000', // 10 kg
        minStockAlert: '2.000',
        isActive: true,
      },
    });
    testWeightProductId = weightProd.id;

    const unitProd = await prismaClient.product.create({
      data: {
        name: 'Semangka Utuh Merah',
        categoryId: category.id,
        productType: 'UNIT',
        pricePerUnit: '30000.00',
        costPerUnit: '22000.00',
        stockQty: '5.000', // 5 butir
        minStockAlert: '1.000',
        isActive: true,
      },
    });
    testUnitProductId = unitProd.id;

    app = createApp(appConfig, {
      prismaClient,
    });

    // Login seluruh role
    const cashierLogin = await request(app)
      .post('/v1/auth/login')
      .send({ username: 'kasir_pos', password: PASSWORD });
    tokens.CASHIER = cashierLogin.body.data.accessToken;

    const managerLogin = await request(app)
      .post('/v1/auth/login')
      .send({ username: 'manajer_pos', password: PASSWORD });
    tokens.MANAGER = managerLogin.body.data.accessToken;

    const ownerLogin = await request(app)
      .post('/v1/auth/login')
      .send({ username: 'pemilik_pos', password: PASSWORD });
    tokens.OWNER = ownerLogin.body.data.accessToken;
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  describe('POST /v1/transactions (M03-001)', () => {
    it('TC-POS-001: Transaksi WEIGHT berhasil, hitung kembalian dan kurangi stok atomik', async () => {
      const res = await request(app)
        .post('/v1/transactions')
        .set(auth('CASHIER'))
        .send({
          items: [
            {
              productId: testWeightProductId,
              quantity: 1.5,
              unitPrice: 25000,
            },
          ],
          discountAmount: 0,
          paymentMethod: 'CASH',
          amountPaid: 50000,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalAmount).toBe('37500');
      expect(res.body.data.amountPaid).toBe('50000');
      expect(res.body.data.changeAmount).toBe('12500');
      expect(res.body.data.transactionNo).toMatch(/^TRX-\d{8}-\d{4}$/);
      expect(res.body.data.receiptData).toBeDefined();
      expect(res.body.data.receiptData.items).toHaveLength(1);

      // Verifikasi stok produk berkurang di DB: 10.0 - 1.5 = 8.5 kg
      const updatedProd = await prismaClient.product.findUnique({
        where: { id: testWeightProductId },
      });
      expect(Number(updatedProd?.stockQty)).toBe(8.5);

      // Verifikasi StockMovement SALE_OUT tercatat di DB
      const movement = await prismaClient.stockMovement.findFirst({
        where: {
          productId: testWeightProductId,
          movementType: 'SALE_OUT',
          referenceId: res.body.data.id,
        },
      });
      expect(movement).not.toBeNull();
      expect(Number(movement?.quantity)).toBe(1.5);
      expect(Number(movement?.balanceBefore)).toBe(10);
      expect(Number(movement?.balanceAfter)).toBe(8.5);
    });

    it('TC-POS-002: Transaksi gagal saat stok tidak mencukupi (422 INSUFFICIENT_STOCK)', async () => {
      // Sisa stok testUnitProductId adalah 5 butir. Coba beli 10 butir
      const res = await request(app)
        .post('/v1/transactions')
        .set(auth('CASHIER'))
        .send({
          items: [
            {
              productId: testUnitProductId,
              quantity: 10,
              unitPrice: 30000,
            },
          ],
          paymentMethod: 'CASH',
          amountPaid: 300000,
        });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe(ERROR_CODES.INSUFFICIENT_STOCK);

      // Stok tidak berubah
      const prodInDb = await prismaClient.product.findUnique({
        where: { id: testUnitProductId },
      });
      expect(Number(prodInDb?.stockQty)).toBe(5);
    });

    it('TC-POS-003: Idempotency offline sync dengan clientId sama menghasilkan transaksi tunggal', async () => {
      const clientId = 'offline-client-dedup-uuid-777';
      const payload = {
        clientId,
        items: [
          {
            productId: testUnitProductId,
            quantity: 1,
            unitPrice: 30000,
          },
        ],
        paymentMethod: 'CASH' as const,
        amountPaid: 50000,
      };

      // Request pertama
      const res1 = await request(app).post('/v1/transactions').set(auth('CASHIER')).send(payload);

      expect(res1.status).toBe(201);
      const txId1 = res1.body.data.id;
      const txNo1 = res1.body.data.transactionNo;

      // Request kedua dengan clientId yang persis sama
      const res2 = await request(app).post('/v1/transactions').set(auth('CASHIER')).send(payload);

      expect(res2.status).toBe(201);
      expect(res2.body.data.id).toBe(txId1);
      expect(res2.body.data.transactionNo).toBe(txNo1);

      // Pastikan di database hanya ada 1 transaksi dengan clientId tersebut
      const count = await prismaClient.transaction.count({
        where: { clientId },
      });
      expect(count).toBe(1);

      // Stok hanya berkurang 1 (dari 5 menjadi 4), bukan 2
      const prodInDb = await prismaClient.product.findUnique({
        where: { id: testUnitProductId },
      });
      expect(Number(prodInDb?.stockQty)).toBe(4);
    });
  });

  describe('GET /v1/transactions & GET /v1/transactions/:id', () => {
    it('mengambil list transaksi dengan filter dan pagination', async () => {
      const res = await request(app)
        .get('/v1/transactions?page=1&limit=10&paymentMethod=CASH')
        .set(auth('CASHIER'));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta.page).toBe(1);
    });

    it('NFR-SEC-09: CASHIER tidak dapat melihat unitCost pada detail transaksi, namun MANAGER dapat', async () => {
      const listRes = await request(app).get('/v1/transactions?limit=1').set(auth('CASHIER'));
      const sampleTxId = listRes.body.data[0].id;

      // Kasir membaca detail
      const cashierView = await request(app)
        .get(`/v1/transactions/${sampleTxId}`)
        .set(auth('CASHIER'));
      expect(cashierView.status).toBe(200);
      expect(cashierView.body.data.items[0].unitCost).toBeNull();

      // Manajer membaca detail
      const managerView = await request(app)
        .get(`/v1/transactions/${sampleTxId}`)
        .set(auth('MANAGER'));
      expect(managerView.status).toBe(200);
      expect(managerView.body.data.items[0].unitCost).not.toBeNull();
    });
  });

  describe('PUT /v1/transactions/:id/void (M03-001)', () => {
    it('menolak CASHIER saat mencoba void transaksi (403 FORBIDDEN)', async () => {
      const listRes = await request(app).get('/v1/transactions?limit=1').set(auth('CASHIER'));
      const sampleTxId = listRes.body.data[0].id;

      const res = await request(app)
        .put(`/v1/transactions/${sampleTxId}/void`)
        .set(auth('CASHIER'))
        .send({ reason: 'Kasir salah input' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('MANAGER berhasil void transaksi, mengembalikan stok produk dan mencatat RETURN_IN', async () => {
      // Buat transaksi baru untuk di-void
      const createRes = await request(app)
        .post('/v1/transactions')
        .set(auth('CASHIER'))
        .send({
          items: [
            {
              productId: testUnitProductId,
              quantity: 2,
              unitPrice: 30000,
            },
          ],
          paymentMethod: 'CASH',
          amountPaid: 60000,
        });

      const txToVoidId = createRes.body.data.id;
      // Stok sebelum void: 4 - 2 = 2 butir
      const prodBeforeVoid = await prismaClient.product.findUnique({
        where: { id: testUnitProductId },
      });
      expect(Number(prodBeforeVoid?.stockQty)).toBe(2);

      // Void transaksi oleh MANAGER
      const voidRes = await request(app)
        .put(`/v1/transactions/${txToVoidId}/void`)
        .set(auth('MANAGER'))
        .send({ reason: 'Pelanggan batal membeli karena salah ambil varian' });

      expect(voidRes.status).toBe(200);
      expect(voidRes.body.data.status).toBe('VOIDED');
      expect(voidRes.body.data.voidReason).toContain('Pelanggan batal');

      // Stok setelah void harus kembali menjadi 2 + 2 = 4 butir
      const prodAfterVoid = await prismaClient.product.findUnique({
        where: { id: testUnitProductId },
      });
      expect(Number(prodAfterVoid?.stockQty)).toBe(4);

      // Mutasi stok RETURN_IN tercatat
      const returnMovement = await prismaClient.stockMovement.findFirst({
        where: {
          productId: testUnitProductId,
          movementType: 'RETURN_IN',
          referenceId: txToVoidId,
        },
      });
      expect(returnMovement).not.toBeNull();
      expect(Number(returnMovement?.quantity)).toBe(2);
    });
  });
});
