import 'dotenv/config';
import { z } from 'zod';

/**
 * Konfigurasi caching Redis (Bagian 15.2). Seluruh nilai dari environment tanpa hardcode.
 */
const cacheEnvSchema = z.object({
  CACHE_KEY_PREFIX: z.string().min(1, 'CACHE_KEY_PREFIX wajib diisi'),
  CACHE_CATEGORY_TTL_SECONDS: z.coerce.number().int().positive(),
  CACHE_PRODUCT_TTL_SECONDS: z.coerce.number().int().positive().default(300),
});

export interface CacheConfig {
  keyPrefix: string;
  categoryTtlSeconds: number;
  productTtlSeconds: number;
}

export function buildCacheConfig(env: NodeJS.ProcessEnv): CacheConfig {
  const parsed = cacheEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi cache tidak valid: ${issues}`);
  }

  return {
    keyPrefix: parsed.data.CACHE_KEY_PREFIX,
    categoryTtlSeconds: parsed.data.CACHE_CATEGORY_TTL_SECONDS,
    productTtlSeconds: parsed.data.CACHE_PRODUCT_TTL_SECONDS,
  };
}

export const cacheConfig = buildCacheConfig(process.env);
