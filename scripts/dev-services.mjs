/**
 * Menjalankan PostgreSQL 16 (embedded-postgres) + Redis (redis-memory-server) lokal
 * untuk development tanpa memerlukan instalasi sistem atau Docker Desktop.
 * Seluruh host/port/kredensial dibaca dari `apps/api/.env` (tanpa hardcode).
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '../apps/api');
const requireFromApi = createRequire(path.join(apiDir, 'package.json'));

const dotenv = requireFromApi('dotenv');
const embeddedPgEntry = pathToFileURL(requireFromApi.resolve('embedded-postgres')).href;
const { default: EmbeddedPostgres } = await import(embeddedPgEntry);
const { RedisMemoryServer } = requireFromApi('redis-memory-server');

dotenv.config({ path: path.join(apiDir, '.env') });

const dbUrl = new URL(process.env.DATABASE_URL);
const redisUrl = new URL(process.env.REDIS_URL);

const pgPort = Number(dbUrl.port);
const pgUser = decodeURIComponent(dbUrl.username);
const pgPassword = decodeURIComponent(dbUrl.password);
const pgDatabase = dbUrl.pathname.replace(/^\//, '');
const redisPort = Number(redisUrl.port);

const dataRoot = path.resolve(__dirname, '../.agent/dev-services');

const pg = new EmbeddedPostgres({
  databaseDir: path.join(dataRoot, 'pgdata'),
  user: pgUser,
  password: pgPassword,
  port: pgPort,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

const redisServer = new RedisMemoryServer({
  instance: {
    port: redisPort,
  },
});

async function start() {
  if (!fs.existsSync(path.join(dataRoot, 'pgdata', 'PG_VERSION'))) {
    await pg.initialise();
  }
  await pg.start();
  await pg.createDatabase(pgDatabase).catch(() => {
    // Database sudah ada.
  });

  await redisServer.start();

  console.log(
    `PostgreSQL 16 aktif -> postgresql://${pgUser}:***@127.0.0.1:${pgPort}/${pgDatabase}`,
  );
  console.log(`Redis aktif         -> redis://127.0.0.1:${redisPort}`);
  console.log('Tekan Ctrl+C untuk menghentikan kedua service.');
}

async function shutdown() {
  console.log('\nMenghentikan PostgreSQL & Redis lokal...');
  await Promise.allSettled([pg.stop(), redisServer.stop()]);
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch(async (err) => {
  console.error('Gagal menjalankan dev-services:', err);
  await Promise.allSettled([pg.stop(), redisServer.stop()]);
  process.exit(1);
});
