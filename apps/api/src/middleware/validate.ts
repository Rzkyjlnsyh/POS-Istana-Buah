import { ERROR_CODES } from '@istana-buah/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { AppError } from '../utils/app-error';

export interface ValidationIssueDetail {
  field: string;
  message: string;
}

function formatZodIssues(
  issues: readonly { path: PropertyKey[]; message: string }[],
): ValidationIssueDetail[] {
  return issues.map((issue) => ({
    field: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          'Data input tidak valid',
          400,
          formatZodIssues(result.error.issues),
        ),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(
        new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          'Parameter query tidak valid',
          400,
          formatZodIssues(result.error.issues),
        ),
      );
      return;
    }
    res.localsAssignQuery(req, result.data);
    next();
  };
}

const res = {
  localsAssignQuery<T>(req: Request, parsedQuery: T): void {
    Object.defineProperty(req, 'validatedQuery', {
      value: parsedQuery,
      writable: true,
      configurable: true,
      enumerable: false,
    });
  },
};

export function validateParams<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(
        new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          'Parameter URL tidak valid',
          400,
          formatZodIssues(result.error.issues),
        ),
      );
      return;
    }
    req.params = result.data as Record<string, string>;
    next();
  };
}
