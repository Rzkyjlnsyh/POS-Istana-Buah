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

describe('M02-001 Integration: Category CRUD, RBAC, Cache & Race Condition', () => {
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
        { username: 'kasir', passwordHash, fullName: 'Kasir', role: 'CASHIER' },
        { username: 'manajer', passwordHash, fullName: 'Manajer', role: 'MANAGER' },
        { username: 'pemilik', passwordHash, fullName: 'Pemilik', role: 'OWNER' },
      ],
    });

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm02-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-it'),
    });

    const logins: Array<[keyof typeof tokens, string, string]> = [
      ['CASHIER', 'kasir', '198.51.100.11'],
      ['MANAGER', 'manajer', '198.51.100.12'],
      ['OWNER', 'pemilik', '198.51.100.13'],
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

  it('menolak akses tanpa token (401) dan menolak CASHIER menulis (403 RBAC) namun mengizinkan CASHIER membaca', async () => {
    const noToken = await request(app).get('/v1/categories');
    expect(noToken.status).toBe(401);

    const cashierWrite = await request(app)
      .post('/v1/categories')
      .set(auth('CASHIER'))
      .send({ name: 'Buah Tropis' });
    expect(cashierWrite.status).toBe(403);
    expect(cashierWrite.body.error.code).toBe(ERROR_CODES.FORBIDDEN);

    const cashierRead = await request(app).get('/v1/categories').set(auth('CASHIER'));
    expect(cashierRead.status).toBe(200);
    expect(cashierRead.body.meta).toMatchObject({ page: 1, limit: 20, total: 0 });
  });

  it('membuat kategori (201), menolak duplikat (409), validasi input (400), dan mencatat audit log', async () => {
    const created = await request(app)
      .post('/v1/categories')
      .set(auth('MANAGER'))
      .send({ name: '  Buah Tropis  ', description: 'Mangga & pepaya', sortOrder: 2 });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      name: 'Buah Tropis',
      description: 'Mangga & pepaya',
      sortOrder: 2,
      isActive: true,
      productCount: 0,
    });

    const duplicate = await request(app)
      .post('/v1/categories')
      .set(auth('OWNER'))
      .send({ name: 'Buah Tropis' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe(ERROR_CODES.DUPLICATE_CATEGORY);

    const invalid = await request(app)
      .post('/v1/categories')
      .set(auth('MANAGER'))
      .send({ name: 'A', sortOrder: -1 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);

    const logs = await prismaClient.auditLog.findMany({
      where: { action: 'CATEGORY_CREATED', entityId: created.body.data.id as string },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]?.userId).not.toBeNull();
  });

  it('hanya satu dari dua pembuatan paralel dengan nama sama yang berhasil (anti race condition)', async () => {
    const [a, b] = await Promise.all([
      request(app).post('/v1/categories').set(auth('MANAGER')).send({ name: 'Buah Paralel' }),
      request(app).post('/v1/categories').set(auth('OWNER')).send({ name: 'Buah Paralel' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prismaClient.category.count({ where: { name: 'Buah Paralel' } })).toBe(1);
  });

  it('mendukung filter, pencarian, pagination, ambil by id, dan 404/400 pada ID tidak valid', async () => {
    await request(app)
      .post('/v1/categories')
      .set(auth('MANAGER'))
      .send({ name: 'Buah Impor', sortOrder: 1, isActive: false });

    const all = await request(app).get('/v1/categories?limit=2&page=1').set(auth('CASHIER'));
    expect(all.status).toBe(200);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.meta.total).toBeGreaterThanOrEqual(3);
    expect(all.body.data[0].sortOrder).toBeLessThanOrEqual(all.body.data[1].sortOrder);

    const inactive = await request(app).get('/v1/categories?isActive=false').set(auth('MANAGER'));
    expect(inactive.body.data.map((c: { name: string }) => c.name)).toEqual(['Buah Impor']);

    const search = await request(app).get('/v1/categories?search=tropis').set(auth('MANAGER'));
    expect(search.body.data.map((c: { name: string }) => c.name)).toEqual(['Buah Tropis']);

    const target = search.body.data[0] as { id: string };
    const byId = await request(app).get(`/v1/categories/${target.id}`).set(auth('CASHIER'));
    expect(byId.status).toBe(200);
    expect(byId.body.data.name).toBe('Buah Tropis');

    const missing = await request(app)
      .get('/v1/categories/3f2b8a52-8b1c-4a8e-9a53-0d7f1f9c7a11')
      .set(auth('CASHIER'));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe(ERROR_CODES.CATEGORY_NOT_FOUND);

    const badId = await request(app).get('/v1/categories/bukan-uuid').set(auth('CASHIER'));
    expect(badId.status).toBe(400);

    const badQuery = await request(app).get('/v1/categories?limit=1000').set(auth('CASHIER'));
    expect(badQuery.status).toBe(400);
  });

  it('cache-aside: list kedua dilayani dari cache dan langsung usang setelah penulisan (bust on write)', async () => {
    const first = await request(app).get('/v1/categories?search=tropis').set(auth('MANAGER'));
    const id = first.body.data[0].id as string;

    // Ubah langsung di DB (melewati API) -> list ber-cache harus tetap mengembalikan nilai lama.
    await prismaClient.category.update({ where: { id }, data: { description: 'DIUBAH-LANGSUNG' } });
    const cached = await request(app).get('/v1/categories?search=tropis').set(auth('MANAGER'));
    expect(cached.body.data[0].description).toBe('Mangga & pepaya');

    // Update via API menaikkan versi cache -> data baru muncul.
    const updated = await request(app)
      .put(`/v1/categories/${id}`)
      .set(auth('MANAGER'))
      .send({ description: null, sortOrder: 5 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ description: null, sortOrder: 5 });

    const fresh = await request(app).get('/v1/categories?search=tropis').set(auth('MANAGER'));
    expect(fresh.body.data[0]).toMatchObject({ description: null, sortOrder: 5 });
  });

  it('update: 404 kategori tidak ada, 409 nama bentrok, 400 body kosong, dan rename valid', async () => {
    const list = await request(app).get('/v1/categories').set(auth('MANAGER'));
    const byName = new Map<string, string>(
      (list.body.data as Array<{ id: string; name: string }>).map((c) => [c.name, c.id]),
    );

    const notFound = await request(app)
      .put('/v1/categories/3f2b8a52-8b1c-4a8e-9a53-0d7f1f9c7a11')
      .set(auth('MANAGER'))
      .send({ name: 'Apa Saja' });
    expect(notFound.status).toBe(404);

    const clash = await request(app)
      .put(`/v1/categories/${byName.get('Buah Impor') as string}`)
      .set(auth('MANAGER'))
      .send({ name: 'Buah Tropis' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe(ERROR_CODES.DUPLICATE_CATEGORY);

    const empty = await request(app)
      .put(`/v1/categories/${byName.get('Buah Impor') as string}`)
      .set(auth('MANAGER'))
      .send({});
    expect(empty.status).toBe(400);

    const rename = await request(app)
      .put(`/v1/categories/${byName.get('Buah Impor') as string}`)
      .set(auth('OWNER'))
      .send({ name: 'Buah Import Premium', isActive: true });
    expect(rename.status).toBe(200);
    expect(rename.body.data).toMatchObject({ name: 'Buah Import Premium', isActive: true });

    const cashierUpdate = await request(app)
      .put(`/v1/categories/${byName.get('Buah Impor') as string}`)
      .set(auth('CASHIER'))
      .send({ name: 'Hack' });
    expect(cashierUpdate.status).toBe(403);
  });

  it('hapus: ditolak 409 CATEGORY_IN_USE bila masih ada produk aktif, soft delete saat kosong, dan nama dapat dipakai ulang', async () => {
    const created = await request(app)
      .post('/v1/categories')
      .set(auth('MANAGER'))
      .send({ name: 'Buah Lokal' });
    const id = created.body.data.id as string;

    const product = await prismaClient.product.create({
      data: { categoryId: id, name: 'Salak Pondoh', productType: 'UNIT', pricePerUnit: 5000 },
    });

    const withProduct = await request(app).get(`/v1/categories/${id}`).set(auth('MANAGER'));
    expect(withProduct.body.data.productCount).toBe(1);

    const blocked = await request(app).delete(`/v1/categories/${id}`).set(auth('MANAGER'));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe(ERROR_CODES.CATEGORY_IN_USE);

    const cashierDelete = await request(app).delete(`/v1/categories/${id}`).set(auth('CASHIER'));
    expect(cashierDelete.status).toBe(403);

    await prismaClient.product.update({
      where: { id: product.id },
      data: { deletedAt: new Date() },
    });

    const removed = await request(app).delete(`/v1/categories/${id}`).set(auth('MANAGER'));
    expect(removed.status).toBe(200);

    const gone = await request(app).get(`/v1/categories/${id}`).set(auth('MANAGER'));
    expect(gone.status).toBe(404);

    const secondDelete = await request(app).delete(`/v1/categories/${id}`).set(auth('MANAGER'));
    expect(secondDelete.status).toBe(404);

    const listed = await request(app).get('/v1/categories?search=lokal').set(auth('MANAGER'));
    expect(listed.body.data).toHaveLength(0);

    // Nama yang pernah dihapus dipulihkan (restore) alih-alih gagal karena unique constraint.
    const restored = await request(app)
      .post('/v1/categories')
      .set(auth('MANAGER'))
      .send({ name: 'Buah Lokal', description: 'Dipulihkan' });
    expect(restored.status).toBe(201);
    expect(restored.body.data.id).toBe(id);
    expect(restored.body.data.description).toBe('Dipulihkan');

    const actions = (
      await prismaClient.auditLog.findMany({
        where: { entityId: id },
        orderBy: { createdAt: 'asc' },
      })
    ).map((l) => l.action);
    expect(actions).toEqual(['CATEGORY_CREATED', 'CATEGORY_DELETED', 'CATEGORY_RESTORED']);
  });
});
