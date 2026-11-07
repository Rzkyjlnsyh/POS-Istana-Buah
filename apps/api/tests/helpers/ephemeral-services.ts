import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import readline from 'node:readline';

export interface EphemeralServicesHandle {
  databaseUrl: string;
  redisUrl: string;
  stop: () => Promise<void>;
}

/**
 * Menyalakan PostgreSQL 16 + Redis sementara melalui worker ESM terisolasi
 * serta menjalankan `prisma migrate deploy` pada database tersebut.
 */
export async function startEphemeralServices(): Promise<EphemeralServicesHandle> {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const apiRoot = path.resolve(__dirname, '../..');
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
            `Ephemeral services worker berhenti lebih awal (code=${String(code)}): ${stderrLog}`,
          ),
        );
      });
    },
  );

  const stopWorker = async (): Promise<void> => {
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.stdin.write('STOP\n');
      child.stdin.end();
    });
  };

  try {
    const prismaCli = require.resolve('prisma/build/index.js');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: endpoints.databaseUrl },
      stdio: 'pipe',
    });
  } catch (err) {
    await stopWorker();
    throw err;
  }

  return {
    databaseUrl: endpoints.databaseUrl,
    redisUrl: endpoints.redisUrl,
    stop: stopWorker,
  };
}
