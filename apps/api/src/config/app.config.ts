import 'dotenv/config';
import { z } from 'zod';

/**
 * Konfigurasi aplikasi — semua nilai dari environment (tanpa hardcode).
 * Divalidasi dengan Zod saat startup agar salah konfigurasi gagal cepat.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive(),
  CORS_ORIGIN: z.string().min(1),
  APP_NAME: z.string().min(1),
  APP_VERSION: z.string().min(1),
  DEFAULT_TIMEZONE: z.string().min(1),
  JSON_BODY_LIMIT: z.string().min(1),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive(),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive(),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']),
});

export type AppConfig = ReturnType<typeof buildConfig>;

export function buildConfig(env: NodeJS.ProcessEnv) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi environment tidak valid: ${issues}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    port: e.PORT,
    corsOrigins: e.CORS_ORIGIN.split(',').map((o) => o.trim()),
    appName: e.APP_NAME,
    version: e.APP_VERSION,
    timezone: e.DEFAULT_TIMEZONE,
    jsonBodyLimit: e.JSON_BODY_LIMIT,
    rateLimit: {
      windowMs: e.RATE_LIMIT_WINDOW_MS,
      max: e.RATE_LIMIT_MAX_REQUESTS,
      authMax: e.AUTH_RATE_LIMIT_MAX,
    },
    logLevel: e.LOG_LEVEL,
  } as const;
}

export const appConfig = buildConfig(process.env);
