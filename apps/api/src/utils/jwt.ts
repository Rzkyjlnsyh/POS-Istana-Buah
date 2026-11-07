import crypto from 'node:crypto';
import { ERROR_CODES, USER_ROLES, type UserRole } from '@istana-buah/shared';
import {
  SignJWT,
  errors as joseErrors,
  importPKCS8,
  importSPKI,
  jwtVerify,
  type KeyLike,
} from 'jose';
import type { AuthConfig } from '../config/auth.config';
import { AppError } from './app-error';

const JWT_ALGORITHM = 'RS256' as const;

export interface VerifiedTokenPayload {
  sub: string;
  role: UserRole;
  jti: string;
  iat: number;
  exp: number;
}

interface ImportedKeySet {
  accessPrivateKey: KeyLike;
  accessPublicKey: KeyLike;
  refreshPrivateKey: KeyLike;
  refreshPublicKey: KeyLike;
}

function isValidRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Menghasilkan hash SHA-256 deterministik untuk menyimpan refresh token secara aman di DB.
 */
export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/**
 * Layanan penandatanganan & verifikasi JWT menggunakan algoritma asimetris RS256 (`jose`).
 * Access token dan Refresh token memakai pasangan kunci terpisah agar tidak dapat dipertukarkan.
 */
export class JwtTokenService {
  private keysPromise: Promise<ImportedKeySet> | null = null;

  constructor(private readonly config: AuthConfig['jwt']) {}

  private loadKeys(): Promise<ImportedKeySet> {
    if (!this.keysPromise) {
      this.keysPromise = Promise.all([
        importPKCS8(this.config.accessPrivateKeyPem, JWT_ALGORITHM),
        importSPKI(this.config.accessPublicKeyPem, JWT_ALGORITHM),
        importPKCS8(this.config.refreshPrivateKeyPem, JWT_ALGORITHM),
        importSPKI(this.config.refreshPublicKeyPem, JWT_ALGORITHM),
      ]).then(([accessPrivateKey, accessPublicKey, refreshPrivateKey, refreshPublicKey]) => ({
        accessPrivateKey,
        accessPublicKey,
        refreshPrivateKey,
        refreshPublicKey,
      }));
    }
    return this.keysPromise;
  }

  async signAccessToken(user: { id: string; role: UserRole }): Promise<string> {
    const { accessPrivateKey } = await this.loadKeys();
    const nowSeconds = Math.floor(Date.now() / 1000);

    return new SignJWT({ role: user.role, typ: 'access' })
      .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
      .setSubject(user.id)
      .setJti(crypto.randomUUID())
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + this.config.accessExpiresSeconds)
      .sign(accessPrivateKey);
  }

  async signRefreshToken(user: { id: string; role: UserRole }): Promise<{
    token: string;
    expiresAt: Date;
  }> {
    const { refreshPrivateKey } = await this.loadKeys();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expSeconds = nowSeconds + this.config.refreshExpiresSeconds;

    const token = await new SignJWT({ role: user.role, typ: 'refresh' })
      .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
      .setSubject(user.id)
      .setJti(crypto.randomUUID())
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt(nowSeconds)
      .setExpirationTime(expSeconds)
      .sign(refreshPrivateKey);

    return {
      token,
      expiresAt: new Date(expSeconds * 1000),
    };
  }

  async verifyAccessToken(token: string): Promise<VerifiedTokenPayload> {
    const { accessPublicKey } = await this.loadKeys();
    return this.verifyWithKey(token, accessPublicKey, 'access');
  }

  async verifyRefreshToken(token: string): Promise<VerifiedTokenPayload> {
    const { refreshPublicKey } = await this.loadKeys();
    return this.verifyWithKey(token, refreshPublicKey, 'refresh');
  }

  private async verifyWithKey(
    token: string,
    publicKey: KeyLike,
    expectedType: 'access' | 'refresh',
  ): Promise<VerifiedTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, publicKey, {
        algorithms: [JWT_ALGORITHM],
        issuer: this.config.issuer,
        audience: this.config.audience,
      });

      if (
        payload.typ !== expectedType ||
        typeof payload.sub !== 'string' ||
        payload.sub.length === 0 ||
        typeof payload.jti !== 'string' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number' ||
        !isValidRole(payload.role)
      ) {
        throw new AppError(ERROR_CODES.TOKEN_INVALID, 'Klaim token autentikasi tidak valid', 401);
      }

      return {
        sub: payload.sub,
        role: payload.role,
        jti: payload.jti,
        iat: payload.iat,
        exp: payload.exp,
      };
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      if (err instanceof joseErrors.JWTExpired) {
        throw new AppError(
          ERROR_CODES.TOKEN_EXPIRED,
          'Sesi telah berakhir, silakan login kembali',
          401,
        );
      }
      throw new AppError(ERROR_CODES.TOKEN_INVALID, 'Token autentikasi tidak valid', 401);
    }
  }
}
