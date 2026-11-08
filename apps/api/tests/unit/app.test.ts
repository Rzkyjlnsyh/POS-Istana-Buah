import request from 'supertest';
import express from 'express';
import { createApp } from '../../src/app';
import { appConfig, buildConfig } from '../../src/config/app.config';
import { disconnectDatabase } from '../../src/lib/prisma';
import { redis } from '../../src/lib/redis';
import { errorHandler } from '../../src/middleware/errorHandler';
import { AppError } from '../../src/utils/app-error';

afterAll(async () => {
  redis.disconnect();
  await disconnectDatabase();
});

describe('API scaffold & health check', () => {
  const healthyDeps = {
    checkDatabase: async () => 'ok' as const,
    checkRedis: async () => 'ok' as const,
  };

  const app = createApp(appConfig, { health: healthyDeps });

  it('GET /health -> 200 dengan status database & redis ok (spesifikasi 13.5)', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      version: '0.0.0-test',
      services: { database: 'ok', redis: 'ok' },
    });
    expect(typeof res.body.uptime).toBe('number');
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('GET /health -> 503 degraded bila database down', async () => {
    const degradedApp = createApp(appConfig, {
      health: {
        checkDatabase: async () => 'down',
        checkRedis: async () => 'ok',
      },
    });
    const res = await request(degradedApp).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'degraded',
      services: { database: 'down', redis: 'ok' },
    });
  });

  it('GET /health -> 503 degraded bila redis down', async () => {
    const degradedApp = createApp(appConfig, {
      health: {
        checkDatabase: async () => 'ok',
        checkRedis: async () => 'down',
      },
    });
    const res = await request(degradedApp).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'degraded',
      services: { database: 'ok', redis: 'down' },
    });
  });

  it('GET /health dengan default dependencies mengembalikan 503 bila endpoint DB/Redis tidak aktif', async () => {
    const defaultApp = createApp(appConfig);
    const res = await request(defaultApp).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      status: 'degraded',
      services: { database: 'down', redis: 'down' },
    });
  });

  it('mengirim security header (helmet) dan menyembunyikan x-powered-by', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('route tidak dikenal -> 404 error envelope NOT_FOUND', async () => {
    const res = await request(app).get('/tidak-ada');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route GET /tidak-ada tidak ditemukan' },
    });
  });

  it('body JSON rusak -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('body melebihi batas -> 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app)
      .post('/health')
      .send({ blob: 'x'.repeat(1_100_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('errorHandler', () => {
  function appThrowing(err: unknown) {
    const a = express();
    a.get('/boom', () => {
      throw err;
    });
    a.use(errorHandler);
    return a;
  }

  it('AppError -> status & kode mesin dipertahankan beserta details', async () => {
    const res = await request(
      appThrowing(
        new AppError('INSUFFICIENT_STOCK', 'Stok tidak mencukupi', 422, { available: 1 }),
      ),
    ).get('/boom');
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      code: 'INSUFFICIENT_STOCK',
      message: 'Stok tidak mencukupi',
      details: { available: 1 },
    });
  });

  it('error tak dikenal -> 500 tanpa membocorkan pesan internal', async () => {
    const res = await request(appThrowing(new Error('rahasia internal'))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('rahasia internal');
  });
});

describe('buildConfig', () => {
  it('melempar error jika environment tidak lengkap', () => {
    expect(() => buildConfig({})).toThrow(/Konfigurasi environment tidak valid/);
  });

  it('memecah CORS_ORIGIN koma-separated', () => {
    const cfg = buildConfig({
      ...process.env,
      CORS_ORIGIN: 'http://a.test, http://b.test',
    });
    expect(cfg.corsOrigins).toEqual(['http://a.test', 'http://b.test']);
  });
});
