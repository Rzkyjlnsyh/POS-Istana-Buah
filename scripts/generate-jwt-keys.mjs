/**
 * Generator pasangan kunci RSA-2048 (PKCS#8 & SPKI dalam Base64) untuk JWT RS256.
 * Penggunaan:
 *   node scripts/generate-jwt-keys.mjs              -> cetak variabel ke stdout
 *   node scripts/generate-jwt-keys.mjs --update-env -> tambahkan ke apps/api/.env lokal bila belum ada
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function createBase64RsaPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  return {
    privateKeyBase64: Buffer.from(privateKey, 'utf8').toString('base64'),
    publicKeyBase64: Buffer.from(publicKey, 'utf8').toString('base64'),
  };
}

const accessPair = createBase64RsaPair();
const refreshPair = createBase64RsaPair();

const lines = [
  'JWT_ISSUER=istana-buah-api',
  'JWT_AUDIENCE=istana-buah-client',
  'JWT_ACCESS_EXPIRES=15m',
  'JWT_REFRESH_EXPIRES=7d',
  `JWT_ACCESS_PRIVATE_KEY=${accessPair.privateKeyBase64}`,
  `JWT_ACCESS_PUBLIC_KEY=${accessPair.publicKeyBase64}`,
  `JWT_REFRESH_PRIVATE_KEY=${refreshPair.privateKeyBase64}`,
  `JWT_REFRESH_PUBLIC_KEY=${refreshPair.publicKeyBase64}`,
  'MAX_LOGIN_ATTEMPTS=5',
  'ACCOUNT_LOCKOUT_MINUTES=15',
];

if (process.argv.includes('--update-env')) {
  const envFile = path.resolve(process.cwd(), 'apps/api/.env');
  const existing = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const missingLines = lines.filter((line) => {
    const key = line.split('=')[0];
    return !new RegExp(`^${key}=`, 'm').test(existing);
  });

  if (missingLines.length > 0) {
    const separator = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
    fs.writeFileSync(
      envFile,
      `${existing}${separator}\n# Generated RS256 JWT Configuration\n${missingLines.join('\n')}\n`,
      'utf8',
    );
    console.log(
      `Berhasil menambahkan ${String(missingLines.length)} variabel JWT ke apps/api/.env`,
    );
  } else {
    console.log('Variabel JWT sudah lengkap di apps/api/.env');
  }
} else {
  console.log(lines.join('\n'));
}
