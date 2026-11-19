import 'dotenv/config';
import { z } from 'zod';

/**
 * Menguraikan ekspresi durasi (mis. `15m`, `7d`, `30s`, `2h`) ke satuan detik.
 */
export function parseDurationToSeconds(raw: string): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(raw.trim());
  if (!match) {
    throw new Error(`Format durasi tidak valid: "${raw}" (gunakan mis. 30s, 15m, 2h, 7d)`);
  }

  const amount = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  if (amount <= 0) {
    throw new Error(`Durasi harus lebih besar dari 0: "${raw}"`);
  }

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  const multiplier = multipliers[unit];
  if (!multiplier) {
    throw new Error(`Satuan durasi tidak dikenali pada "${raw}"`);
  }

  return amount * multiplier;
}

/**
 * Menormalkan kunci kriptografi PEM yang disimpan langsung, dengan `\n`, atau Base64.
 */
export function decodePemKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('-----BEGIN ')) {
    return trimmed.replace(/\\n/g, '\n');
  }
  const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim();
  if (!decoded.includes('-----BEGIN ')) {
    throw new Error('Kunci JWT harus berupa format PEM (PKCS#8/SPKI) atau Base64 dari PEM');
  }
  return decoded;
}

const authEnvSchema = z.object({
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).max(20),
  ACCOUNT_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440),
  JWT_ISSUER: z.string().trim().min(1),
  JWT_AUDIENCE: z.string().trim().min(1),
  JWT_ACCESS_EXPIRES: z.string().trim().min(2),
  JWT_REFRESH_EXPIRES: z.string().trim().min(2),
  JWT_ACCESS_PRIVATE_KEY: z.string().trim().min(1),
  JWT_ACCESS_PUBLIC_KEY: z.string().trim().min(1),
  JWT_REFRESH_PRIVATE_KEY: z.string().trim().min(1),
  JWT_REFRESH_PUBLIC_KEY: z.string().trim().min(1),
});

export interface AuthConfig {
  bcryptRounds: number;
  maxLoginAttempts: number;
  lockoutMinutes: number;
  jwt: {
    issuer: string;
    audience: string;
    accessExpiresIn: string;
    accessExpiresSeconds: number;
    refreshExpiresIn: string;
    refreshExpiresSeconds: number;
    accessPrivateKeyPem: string;
    accessPublicKeyPem: string;
    refreshPrivateKeyPem: string;
    refreshPublicKeyPem: string;
  };
}

export function buildAuthConfig(env: NodeJS.ProcessEnv): AuthConfig {
  const parsed = authEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Konfigurasi autentikasi tidak valid: ${issues}`);
  }

  const e = parsed.data;
  return {
    bcryptRounds: e.BCRYPT_ROUNDS,
    maxLoginAttempts: e.MAX_LOGIN_ATTEMPTS,
    lockoutMinutes: e.ACCOUNT_LOCKOUT_MINUTES,
    jwt: {
      issuer: e.JWT_ISSUER,
      audience: e.JWT_AUDIENCE,
      accessExpiresIn: e.JWT_ACCESS_EXPIRES,
      accessExpiresSeconds: parseDurationToSeconds(e.JWT_ACCESS_EXPIRES),
      refreshExpiresIn: e.JWT_REFRESH_EXPIRES,
      refreshExpiresSeconds: parseDurationToSeconds(e.JWT_REFRESH_EXPIRES),
      accessPrivateKeyPem: decodePemKey(e.JWT_ACCESS_PRIVATE_KEY),
      accessPublicKeyPem: decodePemKey(e.JWT_ACCESS_PUBLIC_KEY),
      refreshPrivateKeyPem: decodePemKey(e.JWT_REFRESH_PRIVATE_KEY),
      refreshPublicKeyPem: decodePemKey(e.JWT_REFRESH_PUBLIC_KEY),
    },
  };
}

export const authConfig = buildAuthConfig(process.env);
