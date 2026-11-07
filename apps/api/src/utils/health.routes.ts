import { Router } from 'express';
import type { HealthResponse } from '@istana-buah/shared';
import type { AppConfig } from '../config/app.config';

/** GET /health (Bagian 13.5). Status database/redis ditambahkan di ENV-003. */
export function createHealthRouter(config: Pick<AppConfig, 'version'>): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: config.version,
      services: {},
      uptime: Math.floor(process.uptime()),
    };
    res.json(body);
  });

  return router;
}
