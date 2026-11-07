import type { PrismaClient } from '@prisma/client';
import compression from 'compression';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config/app.config';
import { authConfig, type AuthConfig } from './config/auth.config';
import { cacheConfig, type CacheConfig } from './config/cache.config';
import { RedisCacheStore, type CacheStore } from './lib/cache';
import { prisma } from './lib/prisma';
import { redis } from './lib/redis';
import { createAuthenticateMiddleware } from './middleware/authenticate';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import {
  createRateLimiter,
  RedisRateLimitStore,
  type RateLimitStore,
} from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createCategoryRouter } from './modules/categories/category.routes';
import { CategoryService } from './modules/categories/category.service';
import { createProductRouter } from './modules/products/product.routes';
import { ProductService } from './modules/products/product.service';
import { AuthService } from './modules/auth/auth.service';
import { createHealthRouter, type HealthCheckDependencies } from './utils/health.routes';
import { JwtTokenService } from './utils/jwt';

export interface AppDependencies {
  health?: HealthCheckDependencies;
  prismaClient?: PrismaClient;
  rateLimitStore?: RateLimitStore;
  authCfg?: AuthConfig;
  cacheStore?: CacheStore;
  cacheCfg?: CacheConfig;
}

/** Membangun Express app (tanpa listen) agar mudah diuji dengan Supertest. */
export function createApp(config: AppConfig, deps: AppDependencies = {}): Express {
  const app = express();

  const db = deps.prismaClient ?? prisma;
  const effectiveAuthCfg = deps.authCfg ?? authConfig;
  const effectiveCacheCfg = deps.cacheCfg ?? cacheConfig;
  const rateStore = deps.rateLimitStore ?? new RedisRateLimitStore(redis);
  const cacheStore = deps.cacheStore ?? new RedisCacheStore(redis, effectiveCacheCfg.keyPrefix);

  const jwtService = new JwtTokenService(effectiveAuthCfg.jwt);
  const authService = new AuthService(db, jwtService, effectiveAuthCfg);
  const authenticate = createAuthenticateMiddleware({ jwtService, prismaClient: db });
  const categoryService = new CategoryService(db, cacheStore, effectiveCacheCfg);
  const productService = new ProductService(db, cacheStore, effectiveCacheCfg);

  const globalRateLimiter = createRateLimiter({
    tier: 'global',
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    store: rateStore,
  });

  const authRateLimiter = createRateLimiter({
    tier: 'auth',
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMax,
    store: rateStore,
  });

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(requestLogger);
  app.use(express.json({ limit: config.jsonBodyLimit }));

  app.use(createHealthRouter(config, deps.health));

  const v1Router = Router();
  v1Router.use(globalRateLimiter);
  v1Router.use(
    '/auth',
    createAuthRouter({
      authService,
      authRateLimiter,
      authenticate,
    }),
  );

  v1Router.use('/categories', createCategoryRouter({ categoryService, authenticate }));
  v1Router.use('/products', createProductRouter({ productService, authenticate }));

  app.use('/v1', v1Router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
