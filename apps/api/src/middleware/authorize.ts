import { ERROR_CODES, type UserRole } from '@istana-buah/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '../lib/logger';
import { AppError } from '../utils/app-error';

/**
 * Middleware otorisasi Role-Based Access Control / RBAC (M01-002, OWASP A01, TC-SEC-003).
 * Fail-closed: menolak 401 jika belum diautentikasi, dan 403 FORBIDDEN jika role tidak diizinkan.
 */
export function authorize(...allowedRoles: UserRole[]): RequestHandler {
  if (allowedRoles.length === 0) {
    throw new Error('Middleware authorize membutuhkan minimal satu UserRole yang diizinkan');
  }

  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser) {
      next(new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401));
      return;
    }

    if (!allowedRoles.includes(req.authUser.role)) {
      logger.warn('Akses RBAC ditolak', {
        userId: req.authUser.id,
        currentRole: req.authUser.role,
        requiredRoles: allowedRoles,
        method: req.method,
        path: req.originalUrl,
      });

      next(
        new AppError(
          ERROR_CODES.FORBIDDEN,
          'Anda tidak memiliki hak akses untuk menjalankan operasi ini',
          403,
          {
            requiredRoles: allowedRoles,
            currentRole: req.authUser.role,
          },
        ),
      );
      return;
    }

    next();
  };
}
