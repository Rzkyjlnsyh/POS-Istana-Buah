import { buildDatabaseConfig } from '../../src/config/database.config';
import { buildRedisConfig } from '../../src/config/redis.config';
import { checkDatabaseHealth } from '../../src/lib/prisma';
import { checkRedisHealth } from '../../src/lib/redis';
import { buildSeedConfig } from '../../src/utils/seed-database';

describe('buildDatabaseConfig', () => {
  it('menambahkan connection_limit bila belum ada di URL', () => {
    const cfg = buildDatabaseConfig({
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      DB_POOL_LIMIT: '25',
    });
    expect(cfg.poolLimit).toBe(25);
    expect(cfg.url).toContain('connection_limit=25');
  });

  it('mempertahankan connection_limit yang sudah ada di URL', () => {
    const cfg = buildDatabaseConfig({
      DATABASE_URL: 'postgres://u:p@localhost:5432/db?connection_limit=12',
      DB_POOL_LIMIT: '25',
    });
    expect(cfg.url).toContain('connection_limit=12');
  });

  it('menolak skema URL selain postgres/postgresql', () => {
    expect(() =>
      buildDatabaseConfig({
        DATABASE_URL: 'mysql://u:p@localhost:3306/db',
        DB_POOL_LIMIT: '10',
      }),
    ).toThrow(/Konfigurasi database tidak valid/);
  });
});

describe('buildRedisConfig', () => {
  it('menerima skema redis:// dan rediss://', () => {
    const cfg = buildRedisConfig({
      REDIS_URL: 'rediss://cache.example.com:6379',
      REDIS_MAX_RETRIES: '3',
      REDIS_CONNECT_TIMEOUT_MS: '2000',
    });
    expect(cfg).toEqual({
      url: 'rediss://cache.example.com:6379',
      maxRetriesPerRequest: 3,
      connectTimeoutMs: 2000,
    });
  });

  it('melempar error bila skema URL tidak valid', () => {
    expect(() =>
      buildRedisConfig({
        REDIS_URL: 'http://localhost:6379',
        REDIS_MAX_RETRIES: '3',
        REDIS_CONNECT_TIMEOUT_MS: '2000',
      }),
    ).toThrow(/Konfigurasi Redis tidak valid/);
  });
});

describe('checkDatabaseHealth & checkRedisHealth', () => {
  it('mengembalikan down saat query database gagal', async () => {
    const status = await checkDatabaseHealth({
      $queryRaw: async () => {
        throw new Error('connection refused');
      },
    });
    expect(status).toBe('down');
  });

  it('mengembalikan ok saat query database berhasil', async () => {
    const status = await checkDatabaseHealth({
      $queryRaw: async () => [{ '?column?': 1 }],
    });
    expect(status).toBe('ok');
  });

  it('memanggil connect() bila status Redis masih wait lalu mengembalikan ok saat PONG', async () => {
    let connected = false;
    const status = await checkRedisHealth({
      status: 'wait',
      connect: async () => {
        connected = true;
      },
      ping: async () => 'PONG',
    });
    expect(connected).toBe(true);
    expect(status).toBe('ok');
  });

  it('mengembalikan down saat respons ping bukan PONG atau terjadi error', async () => {
    const wrongReply = await checkRedisHealth({
      status: 'ready',
      connect: async () => undefined,
      ping: async () => 'LOADING',
    });
    expect(wrongReply).toBe('down');

    const thrown = await checkRedisHealth({
      status: 'ready',
      connect: async () => undefined,
      ping: async () => {
        throw new Error('timeout');
      },
    });
    expect(thrown).toBe('down');
  });
});

describe('buildSeedConfig', () => {
  it('memblokir eksekusi di production tanpa ALLOW_PRODUCTION_SEED=true (OWASP A05)', () => {
    expect(() =>
      buildSeedConfig({
        ...process.env,
        NODE_ENV: 'production',
      }),
    ).toThrow(/Seed diblokir pada NODE_ENV=production/);
  });

  it('mengizinkan production bila ALLOW_PRODUCTION_SEED=true dan password kuat', () => {
    const cfg = buildSeedConfig({
      ...process.env,
      NODE_ENV: 'production',
      ALLOW_PRODUCTION_SEED: 'true',
    });
    expect(cfg.NODE_ENV).toBe('production');
  });

  it('menolak password lemah atau BCRYPT_ROUNDS < 12', () => {
    expect(() =>
      buildSeedConfig({
        ...process.env,
        SEED_OWNER_PASSWORD: 'weak',
      }),
    ).toThrow(/Konfigurasi seed tidak valid/);

    expect(() =>
      buildSeedConfig({
        ...process.env,
        BCRYPT_ROUNDS: '8',
      }),
    ).toThrow(/Konfigurasi seed tidak valid/);
  });
});
