/**
 * Environment untuk test (dimuat sebelum modul app). Nilai khusus test, bukan secret.
 * Pasangan kunci RSA-2048 digenerate secara dinamis di memori agar tidak ada private key statis di repo.
 */
import crypto from 'node:crypto';

function createEphemeralBase64KeyPair(): { privateKey: string; publicKey: string } {
  const pair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return {
    privateKey: Buffer.from(pair.privateKey, 'utf8').toString('base64'),
    publicKey: Buffer.from(pair.publicKey, 'utf8').toString('base64'),
  };
}

const accessKeys = createEphemeralBase64KeyPair();
const refreshKeys = createEphemeralBase64KeyPair();

Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '3000',
  CORS_ORIGIN: 'http://localhost:5173',
  APP_NAME: 'Istana Buah Test',
  APP_VERSION: '0.0.0-test',
  DEFAULT_TIMEZONE: 'Asia/Jakarta',
  JSON_BODY_LIMIT: '1kb',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:54339/istanabuah_unit?schema=public',
  DB_POOL_LIMIT: '10',
  REDIS_URL: 'redis://127.0.0.1:63809',
  REDIS_MAX_RETRIES: '1',
  REDIS_CONNECT_TIMEOUT_MS: '1000',
  BCRYPT_ROUNDS: '12',
  MAX_LOGIN_ATTEMPTS: '5',
  ACCOUNT_LOCKOUT_MINUTES: '15',
  JWT_ISSUER: 'istana-buah-test-api',
  JWT_AUDIENCE: 'istana-buah-test-client',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '7d',
  JWT_ACCESS_PRIVATE_KEY: accessKeys.privateKey,
  JWT_ACCESS_PUBLIC_KEY: accessKeys.publicKey,
  JWT_REFRESH_PRIVATE_KEY: refreshKeys.privateKey,
  JWT_REFRESH_PUBLIC_KEY: refreshKeys.publicKey,
  TAX_PERCENTAGE: '0',
  LOW_STOCK_DEFAULT_THRESHOLD: '5',
  RECEIPT_FOOTER: 'Terima kasih',
  SEED_OWNER_USERNAME: 'owner_test',
  SEED_OWNER_PASSWORD: 'TestOwnerPassword123',
  SEED_OWNER_FULLNAME: 'Owner Test',
  SEED_MANAGER_USERNAME: 'manager_test',
  SEED_MANAGER_PASSWORD: 'TestManagerPassword123',
  SEED_MANAGER_FULLNAME: 'Manager Test',
  SEED_CASHIER_USERNAME: 'cashier_test',
  SEED_CASHIER_PASSWORD: 'TestCashierPassword123',
  SEED_CASHIER_FULLNAME: 'Cashier Test',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX_REQUESTS: '100',
  AUTH_RATE_LIMIT_MAX: '20',
  LOG_LEVEL: 'error',
});
