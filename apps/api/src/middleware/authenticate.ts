import { ERROR_CODES, type UserRole } from '@istana-buah/shared';
import type { PrismaClient } from '@prisma/client';
import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';
import type { JwtTokenService } from '../utils/jwt';

export interface ActiveUserLookupResult {
  id: string;
  role: UserRole;
  isActive: boolean;
  deletedAt: Date | null;
}

export interface AuthenticateMiddlewareOptions {
  jwtService: JwtTokenService;
  prismaClient?: PrismaClient;
  lookupUser?: (userId: string) => Promise<ActiveUserLookupResult | null>;
}

/**
 * Middleware autentikasi Bearer JWT RS256 (M01-002, Bagian 5.4 & OWASP A01/A07).
 * Memverifikasi tanda tangan RS256 + masa berlaku token, serta memastikan akun masih aktif di DB.
 */
export function createAuthenticateMiddleware(
  options: AuthenticateMiddlewareOptions,
): RequestHandler {
  const resolveUser =
    options.lookupUser ??
    (options.prismaClient
      ? async (userId: string): Promise<ActiveUserLookupResult | null> => {
          const row = await options.prismaClient!.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              role: true,
              isActive: true,
              deletedAt: true,
            },
          });
          if (!row) {
            return null;
          }
          return {
            id: row.id,
            role: row.role as UserRole,
            isActive: row.isActive,
            deletedAt: row.deletedAt,
          };
        }
      : undefined);

  return asyncHandler(async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Header Authorization tidak ditemukan', 401);
    }

    const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
    if (!match || !match[1]) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        'Format header Authorization harus "Bearer <token>"',
        401,
      );
    }

    const verified = await options.jwtService.verifyAccessToken(match[1]);

    if (resolveUser) {
      const liveUser = await resolveUser(verified.sub);
      if (!liveUser || liveUser.deletedAt !== null) {
        throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Akun pengguna tidak ditemukan', 401);
      }
      if (!liveUser.isActive) {
        throw new AppError(ERROR_CODES.ACCOUNT_INACTIVE, 'Akun pengguna telah dinonaktifkan', 403);
      }

      req.authUser = {
        id: liveUser.id,
        role: liveUser.role,
        tokenJti: verified.jti,
      };
      next();
      return;
    }

    req.authUser = {
      id: verified.sub,
      role: verified.role,
      tokenJti: verified.jti,
    };
    next();
  });
}
