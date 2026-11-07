import 'dotenv/config';
import { z } from 'zod';

/**
 * Konfigurasi koneksi PostgreSQL (Bagian 13.1 & Bagian 15.5).
 * Menambahkan `connection_limit` pada URL Prisma apabila belum dispesifikasikan.
 */
const databaseEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL wajib diisi')
    .refine(
      (url) => url.startsWith('postgresql://') || url.startsWith('postgres://'),
      'DATABASE_URL harus menggunakan skema postgresql:// atau postgres://',
    ),
  DB_POOL_LIMIT: z.coerce.number().int().min(1).max(200),
});

export interface DatabaseConfig {
  url: string;
  poolLimit: number;
}

export function buildDatabaseConfig(env: NodeJS.ProcessEnv): DatabaseConfig {
  const parsed = databaseEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi database tidak valid: ${issues}`);
  }

  const parsedUrl = new URL(parsed.data.DATABASE_URL);
  if (!parsedUrl.searchParams.has('connection_limit')) {
    parsedUrl.searchParams.set('connection_limit', String(parsed.data.DB_POOL_LIMIT));
  }

  return {
    url: parsedUrl.toString(),
    poolLimit: parsed.data.DB_POOL_LIMIT,
  };
}

export const databaseConfig = buildDatabaseConfig(process.env);
