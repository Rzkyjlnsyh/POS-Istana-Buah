import { Router } from 'express';
import type { HealthResponse, ServiceStatus } from '@istana-buah/shared';
import type { AppConfig } from '../config/app.config';
import { checkDatabaseHealth } from '../lib/prisma';
import { checkRedisHealth } from '../lib/redis';

export interface HealthCheckDependencies {
  checkDatabase: () => Promise<ServiceStatus>;
  checkRedis: () => Promise<ServiceStatus>;
}

const defaultHealthDependencies: HealthCheckDependencies = {
  checkDatabase: () => checkDatabaseHealth(),
  checkRedis: () => checkRedisHealth(),
};

/**
 * GET /health (Bagian 13.5).
 * Mengembalikan 200 saat seluruh service `ok`, atau 503 `degraded` bila salah satu gagal.
 */
export function createHealthRouter(
  config: Pick<AppConfig, 'version'>,
  deps: HealthCheckDependencies = defaultHealthDependencies,
): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const [database, redisStatus] = await Promise.all([deps.checkDatabase(), deps.checkRedis()]);
    const allHealthy = database === 'ok' && redisStatus === 'ok';

    const body: HealthResponse = {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: config.version,
      services: {
        database,
        redis: redisStatus,
      },
      uptime: Math.floor(process.uptime()),
    };

    res.status(allHealthy ? 200 : 503).json(body);
  });

  return router;
}
