import 'dotenv/config';
import { z } from 'zod';

/**
 * Konfigurasi koneksi Redis (Bagian 13.1 & Bagian 15.5).
 * Seluruh parameter diambil dari environment tanpa nilai literal hardcode.
 */
const redisEnvSchema = z.object({
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL wajib diisi')
    .refine(
      (url) => url.startsWith('redis://') || url.startsWith('rediss://'),
      'REDIS_URL harus menggunakan skema redis:// atau rediss://',
    ),
  REDIS_MAX_RETRIES: z.coerce.number().int().min(0).max(20),
  REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive(),
});

export interface RedisConfig {
  url: string;
  maxRetriesPerRequest: number;
  connectTimeoutMs: number;
}

export function buildRedisConfig(env: NodeJS.ProcessEnv): RedisConfig {
  const parsed = redisEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi Redis tidak valid: ${issues}`);
  }

  return {
    url: parsed.data.REDIS_URL,
    maxRetriesPerRequest: parsed.data.REDIS_MAX_RETRIES,
    connectTimeoutMs: parsed.data.REDIS_CONNECT_TIMEOUT_MS,
  };
}

export const redisConfig = buildRedisConfig(process.env);
