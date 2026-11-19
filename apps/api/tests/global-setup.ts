import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

declare global {
  var __ISTANA_BUAH_STOP_EPHEMERAL__: (() => Promise<void>) | undefined;
}

/**
 * Menyalakan satu instance PostgreSQL 16 + Redis sementara untuk seluruh sesi Jest lokal
 * apabila `TEST_DATABASE_URL` & `TEST_REDIS_URL` belum disediakan oleh CI.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.TEST_DATABASE_URL && process.env.TEST_REDIS_URL) {
    return;
  }

  const repoRoot = path.resolve(__dirname, '../../..');
  const workerScript = path.join(repoRoot, 'scripts/ephemeral-services-worker.mjs');

  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [workerScript], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderrLog = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderrLog += chunk.toString('utf8');
  });

  const endpoints = await new Promise<{ databaseUrl: string; redisUrl: string }>(
    (resolve, reject) => {
      const rl = readline.createInterface({ input: child.stdout });

      rl.on('line', (line) => {
        if (line.startsWith('READY ')) {
          rl.close();
          const parsed = JSON.parse(line.slice('READY '.length)) as {
            databaseUrl: string;
            redisUrl: string;
          };
          resolve(parsed);
        }
      });

      child.once('exit', (code) => {
        reject(
          new Error(
            `Global ephemeral services worker berhenti lebih awal (code=${String(code)}): ${stderrLog}`,
          ),
        );
      });
    },
  );

  process.env.TEST_DATABASE_URL = endpoints.databaseUrl;
  process.env.TEST_REDIS_URL = endpoints.redisUrl;

  globalThis.__ISTANA_BUAH_STOP_EPHEMERAL__ = async (): Promise<void> => {
    if (child.exitCode !== null) {
      return;
    }
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.stdin.write('STOP\n');
      child.stdin.end();
    });
  };
}
