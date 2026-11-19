import crypto from 'node:crypto';
import { ERROR_CODES } from '@istana-buah/shared';
import express from 'express';
import type Redis from 'ioredis';
import request from 'supertest';
import { z } from 'zod';
import {
  authConfig,
  buildAuthConfig,
  decodePemKey,
  parseDurationToSeconds,
} from '../../src/config/auth.config';
import { errorHandler } from '../../src/middleware/errorHandler';
import {
  createRateLimiter,
  defaultClientIpKey,
  InMemoryRateLimitStore,
  RedisRateLimitStore,
} from '../../src/middleware/rateLimiter';
import { validateBody, validateParams, validateQuery } from '../../src/middleware/validate';
import { sanitizeAuditPayload } from '../../src/utils/audit-logger';
import { hashToken, JwtTokenService } from '../../src/utils/jwt';

describe('auth.config helpers', () => {
  it('parseDurationToSeconds mengonversi s, m, h, d secara akurat dan menolak format buruk', () => {
    expect(parseDurationToSeconds('30s')).toBe(30);
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('2h')).toBe(7200);
    expect(parseDurationToSeconds('7d')).toBe(604800);
    expect(() => parseDurationToSeconds('0m')).toThrow(/lebih besar dari 0/);
    expect(() => parseDurationToSeconds('10w')).toThrow(/Format durasi tidak valid/);
  });

  it('decodePemKey mendukung PEM langsung maupun Base64 dan menolak string acak', () => {
    const rawPem = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkq\n-----END PUBLIC KEY-----';
    expect(decodePemKey(rawPem)).toBe(rawPem);
    expect(decodePemKey(rawPem.replace(/\n/g, '\\n'))).toBe(rawPem);

    const b64 = Buffer.from(rawPem, 'utf8').toString('base64');
    expect(decodePemKey(b64)).toBe(rawPem);

    expect(() => decodePemKey('bukan-kunci-pem')).toThrow(/format PEM/);
  });

  it('buildAuthConfig melempar error bila variabel wajib kosong', () => {
    expect(() => buildAuthConfig({})).toThrow(/Konfigurasi autentikasi tidak valid/);
  });
});

describe('JwtTokenService (RS256 via jose)', () => {
  const jwtService = new JwtTokenService(authConfig.jwt);

  it('menandatangani dan memverifikasi access token & refresh token RS256', async () => {
    const user = { id: crypto.randomUUID(), role: 'MANAGER' as const };

    const accessToken = await jwtService.signAccessToken(user);
    const verifiedAccess = await jwtService.verifyAccessToken(accessToken);
    expect(verifiedAccess.sub).toBe(user.id);
    expect(verifiedAccess.role).toBe('MANAGER');

    const { token: refreshToken, expiresAt } = await jwtService.signRefreshToken(user);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const verifiedRefresh = await jwtService.verifyRefreshToken(refreshToken);
    expect(verifiedRefresh.sub).toBe(user.id);
    expect(verifiedRefresh.role).toBe('MANAGER');

    // Refresh token tidak boleh diterima sebagai access token dan sebaliknya
    await expect(jwtService.verifyAccessToken(refreshToken)).rejects.toMatchObject({
      code: ERROR_CODES.TOKEN_INVALID,
      statusCode: 401,
    });
    await expect(jwtService.verifyRefreshToken(accessToken)).rejects.toMatchObject({
      code: ERROR_CODES.TOKEN_INVALID,
      statusCode: 401,
    });
  });

  it('mengembalikan TOKEN_EXPIRED bila token sudah lewat masa berlaku', async () => {
    const expiredService = new JwtTokenService({
      ...authConfig.jwt,
      accessExpiresSeconds: -5,
    });
    const token = await expiredService.signAccessToken({
      id: crypto.randomUUID(),
      role: 'CASHIER',
    });

    await expect(jwtService.verifyAccessToken(token)).rejects.toMatchObject({
      code: ERROR_CODES.TOKEN_EXPIRED,
      statusCode: 401,
    });
  });

  it('hashToken menghasilkan SHA-256 hex 64 karakter deterministik', () => {
    const h1 = hashToken('contoh-token-1');
    const h2 = hashToken('contoh-token-1');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});

describe('sanitizeAuditPayload', () => {
  it('menyembunyikan field sensitif password & token secara rekursif', () => {
    const now = new Date('2026-11-08T00:00:00.000Z');
    const sanitized = sanitizeAuditPayload({
      username: 'kasir01',
      password: 'rahasia',
      nested: {
        refreshToken: 'tok-123',
        at: now,
      },
      items: [{ passwordHash: '$2b$12$...' }, 'aman'],
    });

    expect(sanitized).toEqual({
      username: 'kasir01',
      password: '[REDACTED]',
      nested: {
        refreshToken: '[REDACTED]',
        at: '2026-11-08T00:00:00.000Z',
      },
      items: [{ passwordHash: '[REDACTED]' }, 'aman'],
    });
    expect(sanitizeAuditPayload(undefined)).toBeUndefined();
  });
});

describe('validate middleware & rateLimiter fallback', () => {
  it('validateBody, validateQuery, dan validateParams mengembalikan 400 VALIDATION_ERROR saat gagal', async () => {
    const app = express();
    app.use(express.json());
    app.post(
      '/items/:id',
      validateParams(z.object({ id: z.string().uuid() })),
      validateQuery(z.object({ limit: z.coerce.number().int().positive() })),
      validateBody(z.object({ name: z.string().min(3) })),
      (req, res) => {
        res.json({
          success: true,
          id: req.params.id,
          query: req.validatedQuery,
          body: req.body,
        });
      },
    );
    app.use(errorHandler);

    const badParams = await request(app).post('/items/bukan-uuid?limit=5').send({ name: 'Apel' });
    expect(badParams.status).toBe(400);
    expect(badParams.body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR);

    const validId = crypto.randomUUID();
    const badQuery = await request(app).post(`/items/${validId}?limit=0`).send({ name: 'Apel' });
    expect(badQuery.status).toBe(400);

    const badBody = await request(app).post(`/items/${validId}?limit=5`).send({ name: 'A' });
    expect(badBody.status).toBe(400);

    const okRes = await request(app).post(`/items/${validId}?limit=5`).send({ name: 'Apel Fuji' });
    expect(okRes.status).toBe(200);
    expect(okRes.body.query).toEqual({ limit: 5 });
  });

  it('RedisRateLimitStore beralih ke fallback in-memory bila Redis melempar error', async () => {
    const brokenRedis = {
      status: 'ready',
      eval: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as Redis;

    const store = new RedisRateLimitStore(brokenRedis, 'test-rl');
    const app = express();
    app.get(
      '/ping',
      createRateLimiter({
        tier: 'unit',
        windowMs: 60_000,
        max: 2,
        store,
      }),
      (req, res) => {
        res.json({ ip: defaultClientIpKey(req) });
      },
    );
    app.use(errorHandler);

    const r1 = await request(app).get('/ping').set('X-Forwarded-For', '203.0.113.10, 10.0.0.1');
    expect(r1.status).toBe(200);
    expect(r1.body.ip).toBe('203.0.113.10');

    const r2 = await request(app).get('/ping').set('X-Forwarded-For', '203.0.113.10');
    expect(r2.status).toBe(200);

    const r3 = await request(app).get('/ping').set('X-Forwarded-For', '203.0.113.10');
    expect(r3.status).toBe(429);
    expect(r3.body.error.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(r3.headers['retry-after']).toBeDefined();

    const memStore = new InMemoryRateLimitStore();
    const hit = await memStore.increment('k', 1000);
    expect(hit.totalHits).toBe(1);
  });
});
