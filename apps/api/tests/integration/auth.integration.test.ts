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
import { RedisRateLimitStore } from '../../src/middleware/rateLimiter';
import { hashToken } from '../../src/utils/jwt';
import {
  startEphemeralServices,
  type EphemeralServicesHandle,
} from '../helpers/ephemeral-services';

jest.setTimeout(180_000);

describe('M01-001 Integration: Auth Service, Lockout, Token Rotation & Rate Limit', () => {
  let services: EphemeralServicesHandle | undefined;
  let prismaClient: PrismaClient | undefined;
  let redisClient: Redis | undefined;
  let app: Express;

  const VALID_PASSWORD = 'ValidPass123!';

  beforeAll(async () => {
    services = await startEphemeralServices();

    const dbCfg = buildDatabaseConfig({ DATABASE_URL: services.databaseUrl, DB_POOL_LIMIT: '5' });
    prismaClient = createPrismaClient(dbCfg.url);

    const rCfg = buildRedisConfig({
      REDIS_URL: services.redisUrl,
      REDIS_MAX_RETRIES: '2',
      REDIS_CONNECT_TIMEOUT_MS: '5000',
    });
    redisClient = createRedisClient(rCfg);

    const passwordHash = await bcrypt.hash(VALID_PASSWORD, authConfig.bcryptRounds);
    await prismaClient.user.createMany({
      data: [
        {
          username: 'kasir01',
          passwordHash,
          fullName: 'Budi Santoso',
          role: 'CASHIER',
          isActive: true,
        },
        {
          username: 'kasir_nonaktif',
          passwordHash,
          fullName: 'Kasir Nonaktif',
          role: 'CASHIER',
          isActive: false,
        },
      ],
    });

    app = createApp(appConfig, {
      prismaClient,
      rateLimitStore: new RedisRateLimitStore(redisClient, 'm01-it'),
    });
  });

  afterAll(async () => {
    if (redisClient) {
      await disconnectRedis(redisClient);
    }
    if (prismaClient) {
      await disconnectDatabase(prismaClient);
    }
    if (services) {
      await services.stop();
    }
  });

  it('TC-AUTH-001: Login sukses mengembalikan 200 OK, accessToken, refreshToken, dan role CASHIER', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.1')
      .set('User-Agent', 'POS-Tablet/1.0')
      .send({ username: 'kasir01', password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.accessToken).toBe('string');
    expect(typeof res.body.data.refreshToken).toBe('string');
    expect(res.body.data.user).toMatchObject({
      username: 'kasir01',
      fullName: 'Budi Santoso',
      role: 'CASHIER',
    });

    // Pastikan refresh token disimpan dalam bentuk SHA-256 hash, bukan plaintext
    const tokenHash = hashToken(res.body.data.refreshToken);
    const storedToken = await prismaClient!.refreshToken.findUnique({ where: { tokenHash } });
    expect(storedToken).not.toBeNull();
    expect(storedToken?.deviceInfo).toBe('POS-Tablet/1.0');

    // Pastikan AuditLog tercatat
    const logs = await prismaClient!.auditLog.findMany({
      where: { action: 'AUTH_LOGIN_SUCCESS', entityId: res.body.data.user.id },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it('TC-AUTH-002: Login gagal kredensial salah -> 401 INVALID_CREDENTIALS dan loginAttempts +1', async () => {
    const before = await prismaClient!.user.findUniqueOrThrow({ where: { username: 'kasir01' } });
    expect(before.loginAttempts).toBe(0);

    const res = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.2')
      .send({ username: 'kasir01', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);

    const after = await prismaClient!.user.findUniqueOrThrow({ where: { username: 'kasir01' } });
    expect(after.loginAttempts).toBe(1);
    expect(after.lockedUntil).toBeNull();

    // Username tidak ada -> tetap 401 INVALID_CREDENTIALS (tanpa bocor informasi user)
    const missingRes = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.2')
      .send({ username: 'user_tidak_ada', password: 'wrongpassword' });
    expect(missingRes.status).toBe(401);
    expect(missingRes.body.error.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);
  });

  it('TC-AUTH-003: Account lockout setelah 5 gagal -> 401 ACCOUNT_LOCKED dan lockedUntil diset', async () => {
    await prismaClient!.user.update({
      where: { username: 'kasir01' },
      data: { loginAttempts: 4, lockedUntil: null },
    });

    const fifthFail = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.3')
      .send({ username: 'kasir01', password: 'wrongpassword' });

    expect(fifthFail.status).toBe(401);
    expect(fifthFail.body.error.code).toBe(ERROR_CODES.ACCOUNT_LOCKED);

    const lockedUser = await prismaClient!.user.findUniqueOrThrow({
      where: { username: 'kasir01' },
    });
    expect(lockedUser.loginAttempts).toBe(5);
    expect(lockedUser.lockedUntil).not.toBeNull();
    expect(lockedUser.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // Percobaan login dengan password BENAR saat masih terkunci tetap ditolak ACCOUNT_LOCKED
    const blockedWhileLocked = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.3')
      .send({ username: 'kasir01', password: VALID_PASSWORD });
    expect(blockedWhileLocked.status).toBe(401);
    expect(blockedWhileLocked.body.error.code).toBe(ERROR_CODES.ACCOUNT_LOCKED);

    // Simulasikan durasi lockout telah lewat -> login valid mereset loginAttempts & lockedUntil
    await prismaClient!.user.update({
      where: { username: 'kasir01' },
      data: { lockedUntil: new Date(Date.now() - 60_000) },
    });

    const unlockedLogin = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.3')
      .send({ username: 'kasir01', password: VALID_PASSWORD });
    expect(unlockedLogin.status).toBe(200);

    const resetUser = await prismaClient!.user.findUniqueOrThrow({
      where: { username: 'kasir01' },
    });
    expect(resetUser.loginAttempts).toBe(0);
    expect(resetUser.lockedUntil).toBeNull();
  });

  it('menolak akun nonaktif dengan 403 ACCOUNT_INACTIVE', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.4')
      .send({ username: 'kasir_nonaktif', password: VALID_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ERROR_CODES.ACCOUNT_INACTIVE);
  });

  it('mendukung refresh token rotation atomik, deteksi reuse, dan proteksi race condition', async () => {
    const loginRes = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.5')
      .send({ username: 'kasir01', password: VALID_PASSWORD });
    expect(loginRes.status).toBe(200);

    const initialRefresh = loginRes.body.data.refreshToken as string;

    // Simulasikan 2 request refresh konkuren dengan token yang sama (race condition test)
    const [raceA, raceB] = await Promise.all([
      request(app)
        .post('/v1/auth/refresh')
        .set('X-Forwarded-For', '198.51.100.5')
        .send({ refreshToken: initialRefresh }),
      request(app)
        .post('/v1/auth/refresh')
        .set('X-Forwarded-For', '198.51.100.5')
        .send({ refreshToken: initialRefresh }),
    ]);

    const statuses = [raceA.status, raceB.status].sort();
    expect(statuses).toEqual([200, 401]);

    const winner = raceA.status === 200 ? raceA : raceB;
    const rotatedRefresh = winner.body.data.refreshToken as string;
    expect(rotatedRefresh).not.toBe(initialRefresh);

    // Reuse token lama yang sudah di-revoke -> harus memicu pencabutan seluruh sesi user!
    const replayAttempt = await request(app)
      .post('/v1/auth/refresh')
      .set('X-Forwarded-For', '198.51.100.5')
      .send({ refreshToken: initialRefresh });
    expect(replayAttempt.status).toBe(401);
    expect(replayAttempt.body.error.code).toBe(ERROR_CODES.REFRESH_TOKEN_REVOKED);

    // Token hasil rotasi tadi ikut dicabut demi keamanan anti-theft
    const afterTheftRes = await request(app)
      .post('/v1/auth/refresh')
      .set('X-Forwarded-For', '198.51.100.5')
      .send({ refreshToken: rotatedRefresh });
    expect(afterTheftRes.status).toBe(401);
    expect(afterTheftRes.body.error.code).toBe(ERROR_CODES.REFRESH_TOKEN_REVOKED);
  });

  it('mendukung GET /v1/auth/me, logout (revoke token), dan change-password', async () => {
    const loginRes = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.6')
      .send({ username: 'kasir01', password: VALID_PASSWORD });

    const { accessToken, refreshToken } = loginRes.body.data as {
      accessToken: string;
      refreshToken: string;
    };

    // Tanpa header Authorization -> 401
    const unauthMe = await request(app).get('/v1/auth/me').set('X-Forwarded-For', '198.51.100.6');
    expect(unauthMe.status).toBe(401);

    const meRes = await request(app)
      .get('/v1/auth/me')
      .set('X-Forwarded-For', '198.51.100.6')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.username).toBe('kasir01');

    // Logout mencabut refresh token
    const logoutRes = await request(app)
      .post('/v1/auth/logout')
      .set('X-Forwarded-For', '198.51.100.6')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    const refreshAfterLogout = await request(app)
      .post('/v1/auth/refresh')
      .set('X-Forwarded-For', '198.51.100.6')
      .send({ refreshToken });
    expect(refreshAfterLogout.status).toBe(401);

    // Change password: salah password lama -> 400 INVALID_CURRENT_PASSWORD
    const wrongOldPw = await request(app)
      .put('/v1/auth/change-password')
      .set('X-Forwarded-For', '198.51.100.6')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: 'SalahPassword123',
        newPassword: 'UpdatedPass456!',
        confirmPassword: 'UpdatedPass456!',
      });
    expect(wrongOldPw.status).toBe(400);
    expect(wrongOldPw.body.error.code).toBe(ERROR_CODES.INVALID_CURRENT_PASSWORD);

    // Change password sukses
    const changePwRes = await request(app)
      .put('/v1/auth/change-password')
      .set('X-Forwarded-For', '198.51.100.6')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: VALID_PASSWORD,
        newPassword: 'UpdatedPass456!',
        confirmPassword: 'UpdatedPass456!',
      });
    expect(changePwRes.status).toBe(200);

    // Login dengan password baru berhasil
    const relogin = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.6')
      .send({ username: 'kasir01', password: 'UpdatedPass456!' });
    expect(relogin.status).toBe(200);

    // M01-002: bila akun dinonaktifkan di DB saat access token masih aktif, request langsung ditolak 403
    const activeToken = relogin.body.data.accessToken as string;
    await prismaClient!.user.update({
      where: { username: 'kasir01' },
      data: { isActive: false },
    });

    const rejectedMidSession = await request(app)
      .get('/v1/auth/me')
      .set('X-Forwarded-For', '198.51.100.6')
      .set('Authorization', `Bearer ${activeToken}`);
    expect(rejectedMidSession.status).toBe(403);
    expect(rejectedMidSession.body.error.code).toBe(ERROR_CODES.ACCOUNT_INACTIVE);

    await prismaClient!.user.update({
      where: { username: 'kasir01' },
      data: { isActive: true },
    });
  });

  it('TC-SEC-001: kebal terhadap payload SQL Injection pada endpoint login', async () => {
    const sqliRes = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.7')
      .send({
        username: "kasir01' OR '1'='1' --",
        password: "' OR 1=1 --",
      });

    expect(sqliRes.status).toBe(401);
    expect(sqliRes.body.error.code).toBe(ERROR_CODES.INVALID_CREDENTIALS);

    const userCount = await prismaClient!.user.count();
    expect(userCount).toBe(2);
  });

  it('TC-SEC-002: membatasi endpoint auth maksimal 20 request/menit per IP via Redis (429)', async () => {
    const clientIp = '198.51.100.99';

    for (let i = 1; i <= 20; i += 1) {
      const res = await request(app)
        .post('/v1/auth/refresh')
        .set('X-Forwarded-For', clientIp)
        .send({ refreshToken: 'token-uji-ratelimit' });

      expect(res.status).toBe(401);
      expect(res.headers['ratelimit-limit']).toBe('20');
    }

    const res21 = await request(app)
      .post('/v1/auth/refresh')
      .set('X-Forwarded-For', clientIp)
      .send({ refreshToken: 'token-uji-ratelimit' });

    expect(res21.status).toBe(429);
    expect(res21.body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(res21.headers['ratelimit-remaining']).toBe('0');
    expect(res21.headers['retry-after']).toBeDefined();
  });
});
