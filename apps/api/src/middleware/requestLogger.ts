import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '../lib/logger';

/**
 * Middleware pencatat request HTTP terstruktur tanpa membocorkan header/body sensitif (Bagian 5.4 & 16.2).
 */
export const requestLogger: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
    logger.info('http_request', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Number(elapsedMs.toFixed(2)),
      userId: req.authUser?.id ?? null,
    });
  });

  next();
};
