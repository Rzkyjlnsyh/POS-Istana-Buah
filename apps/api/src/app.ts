import compression from 'compression';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/app.config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { createHealthRouter, type HealthCheckDependencies } from './utils/health.routes';

export interface AppDependencies {
  health?: HealthCheckDependencies;
}

/** Membangun Express app (tanpa listen) agar mudah diuji dengan Supertest. */
export function createApp(config: AppConfig, deps: AppDependencies = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: config.jsonBodyLimit }));

  app.use(createHealthRouter(config, deps.health));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
