import type { NextFunction, Request, Response } from 'express';
import type { ApiError } from '@istana-buah/shared';
import { AppError } from '../utils/app-error';
import { logger } from '../lib/logger';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError('NOT_FOUND', `Route ${req.method} ${req.path} tidak ditemukan`, 404));
}

/** Error handler global: mengubah semua error menjadi error envelope (Bagian 7.1). */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ApiError = {
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  // body-parser (JSON rusak / terlalu besar)
  const httpErr = err as { type?: string; status?: number };
  if (httpErr.type === 'entity.parse.failed') {
    const body: ApiError = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Body JSON tidak valid' },
    };
    res.status(400).json(body);
    return;
  }
  if (httpErr.type === 'entity.too.large') {
    const body: ApiError = {
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Ukuran request terlalu besar' },
    };
    res.status(413).json(body);
    return;
  }

  logger.error('Unhandled error', { err });
  const body: ApiError = {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server' },
  };
  res.status(500).json(body);
}
