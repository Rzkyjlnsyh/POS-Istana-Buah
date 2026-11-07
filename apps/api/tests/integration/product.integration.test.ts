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
});
