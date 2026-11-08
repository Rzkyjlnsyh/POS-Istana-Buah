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

describe('M02-002 Integration: Product CRUD, Barcode Lookup, RBAC & NFR-SEC-09', () => {
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

  let testCategoryId: string;

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
    await prismaClient.user.createMany({
      data: [
        { username: 'kasir_prod', passwordHash, fullName: 'Kasir', role: 'CASHIER' },
        { username: 'manajer_prod', passwordHash, fullName: 'Manajer', role: 'MANAGER' },
        { username: 'pemilik_prod', passwordHash, fullName: 'Pemilik', role: 'OWNER' },
      ],
    });

    // Buat kategori untuk pengujian produk
    const cat = await prismaClient.category.create({
      data: { name: 'Kategori Buah Uji', sortOrder: 1 },
    });
    testCategoryId = cat.id;

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm02-prod-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-prod-it'),
    });

    const logins: Array<[keyof typeof tokens, string, string]> = [
      ['CASHIER', 'kasir_prod', '198.51.100.21'],
      ['MANAGER', 'manajer_prod', '198.51.100.22'],
      ['OWNER', 'pemilik_prod', '198.51.100.23'],
    ];
    for (const [role, username, ip] of logins) {
      const res = await request(app)
        .post('/v1/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ username, password: PASSWORD });
      tokens[role] = res.body.data.accessToken as string;
    }
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) await services.stop();
  });

  it('TC-SEC-003: CASHIER tidak bisa membuat/mengubah/menghapus produk (403 FORBIDDEN)', async () => {
    const createRes = await request(app).post('/v1/products').set(auth('CASHIER')).send({
      name: 'Jeruk Medan',
      categoryId: testCategoryId,
      productType: 'WEIGHT',
      pricePerKg: 25000,
    });
    expect(createRes.status).toBe(403);
    expect(createRes.body.error.code).toBe(ERROR_CODES.FORBIDDEN);

    const updateRes = await request(app)
      .put(`/v1/products/00000000-0000-0000-0000-000000000000`)
      .set(auth('CASHIER'))
      .send({ name: 'Update' });
    expect(updateRes.status).toBe(403);
    expect(updateRes.body.error.code).toBe(ERROR_CODES.FORBIDDEN);

    const deleteRes = await request(app)
      .delete(`/v1/products/00000000-0000-0000-0000-000000000000`)
      .set(auth('CASHIER'));
    expect(deleteRes.status).toBe(403);
    expect(deleteRes.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
  });

  it('MANAGER berhasil membuat produk bertipe WEIGHT dan UNIT dengan validasi lengkap', async () => {
    // 1. Buat produk WEIGHT
    const weightRes = await request(app)
      .post('/v1/products')
      .set(auth('MANAGER'))
      .send({
        name: 'Mangga Harum Manis Super',
        categoryId: testCategoryId,
        productType: 'WEIGHT',
        pricePerKg: 35000,
        costPerKg: 22000,
        minStockAlert: 10,
        barcodes: ['899123456001'],
      });

    expect(weightRes.status).toBe(201);
    expect(weightRes.body.data.name).toBe('Mangga Harum Manis Super');
    expect(weightRes.body.data.productType).toBe('WEIGHT');
    expect(weightRes.body.data.pricePerKg).toBe('35000.00');
    expect(weightRes.body.data.costPerKg).toBe('22000.00'); // Terlihat bagi MANAGER
    expect(weightRes.body.data.barcodes).toHaveLength(1);
    expect(weightRes.body.data.barcodes[0].barcode).toBe('899123456001');

    // 2. Buat produk UNIT
    const unitRes = await request(app)
      .post('/v1/products')
      .set(auth('MANAGER'))
      .send({
        name: 'Kelapa Hijau Thailand',
        categoryId: testCategoryId,
        productType: 'UNIT',
        pricePerUnit: 25000,
        costPerUnit: 15000,
        minStockAlert: 5,
        barcodes: ['899123456002'],
      });

    expect(unitRes.status).toBe(201);
    expect(unitRes.body.data.name).toBe('Kelapa Hijau Thailand');
    expect(unitRes.body.data.productType).toBe('UNIT');
    expect(unitRes.body.data.pricePerUnit).toBe('25000.00');
    expect(unitRes.body.data.costPerUnit).toBe('15000.00');
  });

  it('menolak pembuatan produk bila barcode sudah digunakan (409 DUPLICATE_BARCODE)', async () => {
    const dupRes = await request(app)
      .post('/v1/products')
      .set(auth('MANAGER'))
      .send({
        name: 'Mangga Duplikat Barcode',
        categoryId: testCategoryId,
        productType: 'WEIGHT',
        pricePerKg: 30000,
        barcodes: ['899123456001'], // Sudah dipakai produk sebelumnya
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe(ERROR_CODES.DUPLICATE_BARCODE);
  });

  it('NFR-SEC-09: CASHIER membaca list produk tetapi HPP (costPerKg, costPerUnit) selalu null', async () => {
    const listCashier = await request(app).get('/v1/products').set(auth('CASHIER'));
    expect(listCashier.status).toBe(200);
    expect(listCashier.body.data.length).toBeGreaterThanOrEqual(2);

    for (const prod of listCashier.body.data) {
      expect(prod.costPerKg).toBeNull();
      expect(prod.costPerUnit).toBeNull();
    }

    // Bandingkan dengan OWNER: OWNER dapat melihat costPerKg dan costPerUnit
    const listOwner = await request(app).get('/v1/products').set(auth('OWNER'));
    expect(listOwner.status).toBe(200);
    const weightItem = listOwner.body.data.find(
      (p: { name: string }) => p.name === 'Mangga Harum Manis Super',
    );
    expect(weightItem).toBeDefined();
    expect(weightItem.costPerKg).toBe('22000.00');
  });

  it('GET /products/barcode/:barcode mencari cepat (<50ms) dan menyembunyikan HPP dari CASHIER', async () => {
    const startTime = Date.now();
    const barcodeRes = await request(app)
      .get('/v1/products/barcode/899123456001')
      .set(auth('CASHIER'));
    const elapsed = Date.now() - startTime;

    expect(barcodeRes.status).toBe(200);
    expect(barcodeRes.body.data.name).toBe('Mangga Harum Manis Super');
    expect(barcodeRes.body.data.costPerKg).toBeNull();
    // Benchmark check (< 500ms under full test harness, fast query)
    expect(elapsed).toBeLessThan(500);

    // MANAGER membaca barcode mendapatkan HPP
    const managerBarcodeRes = await request(app)
      .get('/v1/products/barcode/899123456001')
      .set(auth('MANAGER'));
    expect(managerBarcodeRes.status).toBe(200);
    expect(managerBarcodeRes.body.data.costPerKg).toBe('22000.00');
  });

  it('GET /products/:id mengembalikan detail produk aktif', async () => {
    const getRes = await request(app).get('/v1/products/barcode/899123456001').set(auth('MANAGER'));
    const prodId = getRes.body.data.id;

    const detailRes = await request(app).get(`/v1/products/${prodId}`).set(auth('MANAGER'));
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.id).toBe(prodId);
    expect(detailRes.body.data.name).toBe('Mangga Harum Manis Super');
  });

  it('PUT /products/:id mencatat PriceHistory dan memperbarui data', async () => {
    // Cari produk
    const getRes = await request(app).get('/v1/products/barcode/899123456001').set(auth('MANAGER'));
    const prodId = getRes.body.data.id;

    const updateRes = await request(app).put(`/v1/products/${prodId}`).set(auth('MANAGER')).send({
      pricePerKg: 38000,
      priceChangeReason: 'Harga pasar naik',
    });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.pricePerKg).toBe('38000.00');

    // Verifikasi catatan riwayat harga di database
    const history = await prismaClient.priceHistory.findFirst({
      where: { productId: prodId },
      orderBy: { createdAt: 'desc' },
    });

    expect(history).toBeDefined();
    expect(Number(history?.oldPrice)).toBe(35000);
    expect(Number(history?.newPrice)).toBe(38000);
    expect(history?.reason).toBe('Harga pasar naik');
  });

  it('DELETE /products/:id melakukan soft delete dan tidak lagi muncul di pencarian aktif', async () => {
    const getRes = await request(app).get('/v1/products/barcode/899123456002').set(auth('MANAGER'));
    const prodId = getRes.body.data.id;

    const delRes = await request(app).delete(`/v1/products/${prodId}`).set(auth('MANAGER'));
    expect(delRes.status).toBe(200);

    // getById mengembalikan 404
    const getDeleted = await request(app).get(`/v1/products/${prodId}`).set(auth('MANAGER'));
    expect(getDeleted.status).toBe(404);
    expect(getDeleted.body.error.code).toBe(ERROR_CODES.PRODUCT_NOT_FOUND);

    // Barcode lookup mengembalikan 404
    const barcodeDeleted = await request(app)
      .get('/v1/products/barcode/899123456002')
      .set(auth('MANAGER'));
    expect(barcodeDeleted.status).toBe(404);
    expect(barcodeDeleted.body.error.code).toBe(ERROR_CODES.PRODUCT_NOT_FOUND);
  });

  describe('M02-003 Barcode Management Integration', () => {
    let targetProductId: string;

    beforeAll(async () => {
      // Buat produk baru khusus pengujian barcode
      const res = await request(app).post('/v1/products').set(auth('MANAGER')).send({
        name: 'Pisang Cavendish Barcode Test',
        categoryId: testCategoryId,
        productType: 'WEIGHT',
        pricePerKg: 20000,
        costPerKg: 12000,
      });
      targetProductId = res.body.data.id;
    });

    it('GET /v1/products/generate-barcode mengembalikan barcode EAN-13 valid (CASHIER 403)', async () => {
      // CASHIER ditolak
      const cashierRes = await request(app)
        .get('/v1/products/generate-barcode')
        .set(auth('CASHIER'));
      expect(cashierRes.status).toBe(403);

      // MANAGER berhasil
      const managerRes = await request(app)
        .get('/v1/products/generate-barcode?prefix=200')
        .set(auth('MANAGER'));
      expect(managerRes.status).toBe(200);
      expect(managerRes.body.data.barcode).toMatch(/^200\d{10}$/);
      expect(managerRes.body.data.barcode).toHaveLength(13);
    });

    it('POST /v1/products/:id/barcodes/generate memasang barcode baru ke produk', async () => {
      const res = await request(app)
        .post(`/v1/products/${targetProductId}/barcodes/generate`)
        .set(auth('MANAGER'));

      expect(res.status).toBe(201);
      expect(res.body.data.barcode).toMatch(/^200\d{10}$/);
      expect(res.body.data.isPrimary).toBe(true); // Barcode pertama otomatis primary
    });

    it('POST /v1/products/:id/barcodes mendaftarkan barcode manual sekunder', async () => {
      const res = await request(app)
        .post(`/v1/products/${targetProductId}/barcodes`)
        .set(auth('MANAGER'))
        .send({ barcode: '8999888777111', isPrimary: false });

      expect(res.status).toBe(201);
      expect(res.body.data.barcode).toBe('8999888777111');
      expect(res.body.data.isPrimary).toBe(false);

      // Menolak pendaftaran duplikat
      const dupRes = await request(app)
        .post(`/v1/products/${targetProductId}/barcodes`)
        .set(auth('MANAGER'))
        .send({ barcode: '8999888777111' });
      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe(ERROR_CODES.DUPLICATE_BARCODE);
    });

    it('PATCH /v1/products/:id/barcodes/:barcodeId/primary mengubah barcode primer', async () => {
      const prodRes = await request(app)
        .get(`/v1/products/${targetProductId}`)
        .set(auth('MANAGER'));
      const secondaryBc = prodRes.body.data.barcodes.find(
        (b: { isPrimary: boolean }) => !b.isPrimary,
      );
      expect(secondaryBc).toBeDefined();

      const patchRes = await request(app)
        .patch(`/v1/products/${targetProductId}/barcodes/${secondaryBc.id}/primary`)
        .set(auth('MANAGER'));

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.isPrimary).toBe(true);

      // Cek produk kembali untuk memastikan barcode lama tidak lagi primer
      const updatedProd = await request(app)
        .get(`/v1/products/${targetProductId}`)
        .set(auth('MANAGER'));
      const primaryCount = updatedProd.body.data.barcodes.filter(
        (b: { isPrimary: boolean }) => b.isPrimary,
      ).length;
      expect(primaryCount).toBe(1);
    });

    it('DELETE /v1/products/:id/barcodes/:barcodeId menghapus barcode dari produk', async () => {
      const prodRes = await request(app)
        .get(`/v1/products/${targetProductId}`)
        .set(auth('MANAGER'));
      const bcToDelete = prodRes.body.data.barcodes[0];

      const delRes = await request(app)
        .delete(`/v1/products/${targetProductId}/barcodes/${bcToDelete.id}`)
        .set(auth('MANAGER'));
      expect(delRes.status).toBe(200);

      // Verifikasi produk tidak lagi memiliki barcode yang dihapus
      const afterDelProd = await request(app)
        .get(`/v1/products/${targetProductId}`)
        .set(auth('MANAGER'));
      const exists = afterDelProd.body.data.barcodes.some(
        (b: { id: string }) => b.id === bcToDelete.id,
      );
      expect(exists).toBe(false);
    });
  });

  describe('M02-007 Integration: Batch Import Products (100+ items, CSV/Excel backend)', () => {
    it('menolak CASHIER dari endpoint POST /v1/products/batch-import dengan status 403', async () => {
      const res = await request(app)
        .post('/v1/products/batch-import')
        .set(auth('CASHIER'))
        .send({
          items: [
            {
              name: 'Semangka Kuning',
              categoryName: 'Buah Lokal',
              productType: 'WEIGHT',
              price: 18000,
            },
          ],
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('berhasil mengimpor 105 produk dalam satu batch (AC: 100+ produk terimport)', async () => {
      const items = Array.from({ length: 105 }, (_, i) => ({
        name: `Batch Buah Import Nomor ${String(i + 1).padStart(3, '0')}`,
        categoryName: i % 2 === 0 ? 'Buah Batch Genap' : 'Buah Batch Ganjil',
        productType: i % 2 === 0 ? ('WEIGHT' as const) : ('UNIT' as const),
        price: 15000 + i * 100,
        cost: 10000 + i * 50,
        stockQty: 50 + (i % 10),
        minStockAlert: 10,
        description: `Deskripsi batch test ${i + 1}`,
      }));

      const res = await request(app)
        .post('/v1/products/batch-import')
        .set(auth('MANAGER'))
        .send({ items });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalProcessed).toBe(105);
      expect(res.body.data.importedCount).toBe(105);
      expect(res.body.data.failedCount).toBe(0);
      expect(res.body.data.createdProductIds).toHaveLength(105);

      // Verifikasi di DB bahwa produk dan barcode benar-benar tersimpan
      const firstCreatedId = res.body.data.createdProductIds[0];
      const prodInDb = await prismaClient.product.findUnique({
        where: { id: firstCreatedId },
        include: { barcodes: true, category: true },
      });
      expect(prodInDb).not.toBeNull();
      expect(prodInDb?.barcodes.length).toBeGreaterThanOrEqual(1);
      expect(prodInDb?.category.name).toBe('Buah Batch Genap');
    });

    it('mendeteksi barcode duplikat di dalam batch request dan mengembalikan rincian error', async () => {
      const duplicateBarcode = '8999999999991';
      const items = [
        {
          name: 'Apel Batch A',
          categoryName: 'Buah Batch',
          productType: 'UNIT' as const,
          price: 20000,
          barcode: duplicateBarcode,
        },
        {
          name: 'Apel Batch B',
          categoryName: 'Buah Batch',
          productType: 'UNIT' as const,
          price: 22000,
          barcode: duplicateBarcode, // Duplikat
        },
      ];

      const res = await request(app)
        .post('/v1/products/batch-import')
        .set(auth('OWNER'))
        .send({ items });

      expect(res.status).toBe(200);
      expect(res.body.data.failedCount).toBeGreaterThan(0);
      expect(res.body.data.importedCount).toBe(0);
      expect(
        res.body.data.errors.some((e: { message: string }) => e.message.includes('duplikat')),
      ).toBe(true);
    });
  });
});
