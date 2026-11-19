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

describe('M10-001 Integration: Employee Management API (/v1/users)', () => {
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
    await prismaClient.$transaction([
      prismaClient.user.create({
        data: { username: 'kasir_emp', passwordHash, fullName: 'Kasir Emp', role: 'CASHIER' },
      }),
      prismaClient.user.create({
        data: { username: 'mgr_emp', passwordHash, fullName: 'Manajer Emp', role: 'MANAGER' },
      }),
      prismaClient.user.create({
        data: { username: 'owner_emp', passwordHash, fullName: 'Owner Emp', role: 'OWNER' },
      }),
    ]);

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm10-emp-it'),
      cacheStore: new RedisCacheStore(redisClient, 'cache-emp-it'),
    });

    const loginRole = async (username: string): Promise<string> => {
      const res = await request(app).post('/v1/auth/login').send({ username, password: PASSWORD });
      return res.body.data.accessToken as string;
    };

    tokens.CASHIER = await loginRole('kasir_emp');
    tokens.MANAGER = await loginRole('mgr_emp');
    tokens.OWNER = await loginRole('owner_emp');
  });

  afterAll(async () => {
    if (redisClient) await disconnectRedis(redisClient);
    if (prismaClient) await disconnectDatabase(prismaClient);
    if (services) {
      await services.stop();
    }
  });

  it('hanya mengizinkan OWNER (blokir CASHIER & MANAGER 403), menjalankan CRUD pegawai, cek shift pegawai & pencabutan token otomatis', async () => {
    // 1. RBAC: unauth -> 401; CASHIER -> 403; MANAGER -> 403
    expect((await request(app).get('/v1/users')).status).toBe(401);
    expect((await request(app).get('/v1/users').set(auth('CASHIER'))).status).toBe(403);
    expect((await request(app).get('/v1/users').set(auth('MANAGER'))).status).toBe(403);

    // 2. OWNER membuat akun kasir baru
    const createRes = await request(app).post('/v1/users').set(auth('OWNER')).send({
      username: 'sari_kasir',
      fullName: 'Sari Wulandari',
      password: 'KasirPassword123',
      role: 'CASHIER',
      phoneNumber: '08123450001',
    });
    expect(createRes.status).toBe(201);
    expect(createRes.body.data.username).toBe('sari_kasir');
    expect(createRes.body.data.passwordHash).toBeUndefined();
    const newUserId = createRes.body.data.id as string;

    // Duplikasi username ditolak 409
    const dupRes = await request(app).post('/v1/users').set(auth('OWNER')).send({
      username: 'SARI_KASIR',
      fullName: 'Sari Duplikat',
      password: 'KasirPassword123',
      role: 'CASHIER',
    });
    expect(dupRes.status).toBe(409);
    expect(dupRes.body.error.code).toBe(ERROR_CODES.DUPLICATE_USERNAME);

    // Kasir baru dapat login & membuka shift
    const sariLogin = await request(app)
      .post('/v1/auth/login')
      .send({ username: 'sari_kasir', password: 'KasirPassword123' });
    expect(sariLogin.status).toBe(200);
    const sariToken = sariLogin.body.data.accessToken as string;
    const sariRefresh = sariLogin.body.data.refreshToken as string;

    const openShiftRes = await request(app)
      .post('/v1/shifts/open')
      .set({ Authorization: `Bearer ${sariToken}` })
      .send({ openingCash: 250000, notes: 'Shift Sari' });
    expect(openShiftRes.status).toBe(201);
    const openShiftId = openShiftRes.body.data.id as string;

    // Cek riwayat shift pegawai melalui GET /v1/users/:id/shifts
    const empShiftsRes = await request(app).get(`/v1/users/${newUserId}/shifts`).set(auth('OWNER'));
    expect(empShiftsRes.status).toBe(200);
    expect(empShiftsRes.body.data).toHaveLength(1);
    expect(empShiftsRes.body.data[0].id).toBe(openShiftId);

    // 3. Hapus pegawai gagal 409 selama shift OPEN
    const delConflict = await request(app).delete(`/v1/users/${newUserId}`).set(auth('OWNER'));
    expect(delConflict.status).toBe(409);

    // Tutup shift dulu
    await request(app)
      .put(`/v1/shifts/${openShiftId}/close`)
      .set({ Authorization: `Bearer ${sariToken}` })
      .send({ closingCash: 250000 });

    // 4. OWNER menonaktifkan pegawai -> refresh token lama ikut dicabut
    const updateRes = await request(app)
      .put(`/v1/users/${newUserId}`)
      .set(auth('OWNER'))
      .send({ fullName: 'Sari Wulandari Senior', isActive: false });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.isActive).toBe(false);

    const refreshAfterDeactivate = await request(app)
      .post('/v1/auth/refresh')
      .send({ refreshToken: sariRefresh });
    expect(refreshAfterDeactivate.status).toBe(401);

    // 5. Filter list & hapus pegawai
    const listInactive = await request(app)
      .get('/v1/users?isActive=false&search=Wulandari')
      .set(auth('OWNER'));
    expect(listInactive.status).toBe(200);
    expect(listInactive.body.data).toHaveLength(1);

    const delOk = await request(app).delete(`/v1/users/${newUserId}`).set(auth('OWNER'));
    expect(delOk.status).toBe(200);
    expect((await request(app).get(`/v1/users/${newUserId}`).set(auth('OWNER'))).status).toBe(404);
  });
});
