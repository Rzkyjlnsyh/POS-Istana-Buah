/**
 * CLI Seed Data Awal (ENV-003, Bagian 5.4 & Bagian 13.4).
 * Dapat dijalankan dari root (`pnpm db:seed`) maupun dari `apps/api`.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { buildDatabaseConfig } from '../apps/api/src/config/database.config';
import { createPrismaClient, disconnectDatabase } from '../apps/api/src/lib/prisma';
import { buildSeedConfig, seedDatabase } from '../apps/api/src/utils/seed-database';

const candidateEnvPaths = [
  path.resolve(process.cwd(), 'apps/api/.env'),
  path.resolve(process.cwd(), '.env'),
];

for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

async function main(): Promise<void> {
  const dbCfg = buildDatabaseConfig(process.env);
  const seedCfg = buildSeedConfig(process.env);
  const client = createPrismaClient(dbCfg.url);

  try {
    const result = await seedDatabase(client, seedCfg);
    console.log(
      `Seed selesai: ${result.categoriesCount} kategori, ${result.usersCount} user, ${result.configsCount} konfigurasi.`,
    );
  } finally {
    await disconnectDatabase(client);
  }
}

main().catch((err: unknown) => {
  console.error('Seed gagal:', err);
  process.exit(1);
});
