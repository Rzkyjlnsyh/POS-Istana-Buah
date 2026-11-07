import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Pembungkus handler async Express 4 agar seluruh exception diteruskan ke global errorHandler.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
