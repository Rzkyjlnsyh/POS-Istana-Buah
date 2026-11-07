/**
 * Worker ESM terisolasi untuk menyalakan PostgreSQL 16 + Redis sementara saat integration test.
 * Berkomunikasi via stdout (`READY {...}`) dan berhenti bersih saat stdin ditutup.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '../apps/api');
const requireFromApi = createRequire(path.join(apiDir, 'package.json'));

const embeddedPgEntry = pathToFileURL(requireFromApi.resolve('embedded-postgres')).href;
const { default: EmbeddedPostgres } = await import(embeddedPgEntry);
const { RedisMemoryServer } = requireFromApi('redis-memory-server');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const { port } = addr;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('Gagal memperoleh port kosong')));
      }
    });
    srv.on('error', reject);
  });
}

const pgDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'istanabuah-pg16-'));
const pgPort = await getFreePort();
const pgUser = 'postgres';
const pgPass = 'IntegrationPass123';
const pgDb = 'istanabuah_integration';

const pg = new EmbeddedPostgres({
  databaseDir: pgDataDir,
  user: pgUser,
  password: pgPass,
  port: pgPort,
  persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

const redisServer = new RedisMemoryServer();
let stopping = false;

async function cleanup() {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled([redisServer.stop(), pg.stop()]);
  try {
    fs.rmSync(pgDataDir, { recursive: true, force: true });
  } catch {
    // Abaikan bila sudah terhapus oleh embedded-postgres.
  }
  process.exit(0);
}

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(pgDb);

  const redisHost = await redisServer.getHost();
  const redisPort = await redisServer.getPort();

  const payload = {
    databaseUrl: `postgresql://${pgUser}:${pgPass}@127.0.0.1:${pgPort}/${pgDb}?schema=public`,
    redisUrl: `redis://${redisHost}:${redisPort}`,
  };

  process.stdout.write(`READY ${JSON.stringify(payload)}\n`);

  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    if (String(chunk).includes('STOP')) {
      void cleanup();
    }
  });
  process.stdin.on('end', () => {
    void cleanup();
  });
  process.on('SIGTERM', () => {
    void cleanup();
  });
  process.on('SIGINT', () => {
    void cleanup();
  });
} catch (err) {
  console.error('Gagal menyalakan ephemeral services:', err);
  await cleanup();
}
