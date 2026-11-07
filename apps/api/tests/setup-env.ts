/**
 * Environment untuk test (dimuat sebelum modul app). Nilai khusus test, bukan secret.
 * Dev environment memakai apps/api/.env.
 */
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '3000',
  CORS_ORIGIN: 'http://localhost:5173',
  APP_NAME: 'Istana Buah Test',
  APP_VERSION: '0.0.0-test',
  DEFAULT_TIMEZONE: 'Asia/Jakarta',
  JSON_BODY_LIMIT: '1kb',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX_REQUESTS: '100',
  AUTH_RATE_LIMIT_MAX: '20',
  LOG_LEVEL: 'error',
});
