import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import request from 'supertest';
import { createApp } from '../../src/app';
import { appConfig } from '../../src/config/app.config';
import { buildDatabaseConfig } from '../../src/config/database.config';
import { buildRedisConfig } from '../../src/config/redis.config';
import { checkDatabaseHealth, createPrismaClient, disconnectDatabase } from '../../src/lib/prisma';
import { checkRedisHealth, createRedisClient, disconnectRedis } from '../../src/lib/redis';
import { buildSeedConfig, seedDatabase } from '../../src/utils/seed-database';
import {
  startEphemeralServices,
  type EphemeralServicesHandle,
} from '../helpers/ephemeral-services';

jest.setTimeout(180_000);

const EXPECTED_TABLES = [
  'app_configs',
  'audit_logs',
  'barcodes',
  'categories',
  'price_histories',
  'products',
  'purchase_order_items',
  'purchase_orders',
  'refresh_tokens',
  'shifts',
  'stock_movements',
  'stock_opname_items',
  'stock_opnames',
  'suppliers',
  'transaction_items',
  'transactions',
  'users',
  'waste_records',
];

describe('ENV-003 Integration: PostgreSQL 16 + Prisma Migration + Seed + Redis', () => {
  let services: EphemeralServicesHandle | undefined;
  let prismaClient: PrismaClient | undefined;
  let redisClient: Redis | undefined;

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

  it('menjalankan PostgreSQL 16 dengan ekstensi pg_trgm aktif', async () => {
    expect(prismaClient).toBeDefined();
    const versionRows = await prismaClient!.$queryRaw<Array<{ server_version: string }>>`
      SHOW server_version
    `;
    expect(versionRows[0]?.server_version).toMatch(/^16\./);

    const extRows = await prismaClient!.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `;
    expect(extRows).toEqual([{ extname: 'pg_trgm' }]);
  });

  it('membuat seluruh 18 tabel domain beserta indeks performa Bagian 6.4 & 15.1', async () => {
    const tableRows = await prismaClient!.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name ASC
    `;
    expect(tableRows.map((r) => r.table_name)).toEqual(EXPECTED_TABLES);

    const indexRows = await prismaClient!.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'idx_products_name_trgm',
          'idx_products_active_name',
          'idx_transactions_summary',
          'idx_transaction_items_product_date',
          'idx_audit_logs_entity'
        )
      ORDER BY indexname ASC
    `;
    expect(indexRows.map((r) => r.indexname)).toEqual([
      'idx_audit_logs_entity',
      'idx_products_active_name',
      'idx_products_name_trgm',
      'idx_transaction_items_product_date',
      'idx_transactions_summary',
    ]);
  });

  it('menjalankan seed kategori, user admin (bcrypt), dan app_configs secara idempotent', async () => {
    const seedCfg = buildSeedConfig(process.env);
    const firstRun = await seedDatabase(prismaClient!, seedCfg);
    const secondRun = await seedDatabase(prismaClient!, seedCfg);

    expect(firstRun).toEqual({ categoriesCount: 5, usersCount: 3, configsCount: 5 });
    expect(secondRun).toEqual({ categoriesCount: 5, usersCount: 3, configsCount: 5 });

    const categoriesCount = await prismaClient!.category.count();
    expect(categoriesCount).toBe(5);

    const owner = await prismaClient!.user.findUniqueOrThrow({
      where: { username: seedCfg.SEED_OWNER_USERNAME },
    });
    expect(owner.role).toBe('OWNER');
    expect(owner.passwordHash).not.toBe(seedCfg.SEED_OWNER_PASSWORD);
    expect(await bcrypt.compare(seedCfg.SEED_OWNER_PASSWORD, owner.passwordHash)).toBe(true);

    const storeConfig = await prismaClient!.appConfig.findUniqueOrThrow({
      where: { key: 'store_name' },
    });
    expect(storeConfig.value).toBe(seedCfg.APP_NAME);
  });

  it('menolak penghapusan maupun pengubahan baris audit_logs (NFR-SEC-10)', async () => {
    const logEntry = await prismaClient!.auditLog.create({
      data: {
        action: 'SYSTEM_BOOT',
        entity: 'System',
        newValues: { ok: true },
      },
    });

    await expect(prismaClient!.auditLog.delete({ where: { id: logEntry.id } })).rejects.toThrow(
      /AUDIT_LOG_IMMUTABLE/,
    );

    await expect(
      prismaClient!.auditLog.update({
        where: { id: logEntry.id },
        data: { action: 'TAMPERED' },
      }),
    ).rejects.toThrow(/AUDIT_LOG_IMMUTABLE/);
  });

  it('menghubungkan Redis untuk baca/tulis dan melaporkan GET /health 200 ok', async () => {
    expect(redisClient).toBeDefined();
    await redisClient!.set('cache:test:env003', 'terhubung', 'EX', 30);
    const cached = await redisClient!.get('cache:test:env003');
    expect(cached).toBe('terhubung');

    const liveApp = createApp(appConfig, {
      health: {
        checkDatabase: () => checkDatabaseHealth(prismaClient!),
        checkRedis: () => checkRedisHealth(redisClient!),
      },
    });

    const res = await request(liveApp).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      services: {
        database: 'ok',
        redis: 'ok',
      },
    });
  });
});
