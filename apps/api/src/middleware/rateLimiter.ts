import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, RequestHandler } from 'express';
import type Redis from 'ioredis';
import { logger } from '../lib/logger';
import { AppError } from '../utils/app-error';
import { asyncHandler } from '../utils/async-handler';

export interface RateLimitHit {
  totalHits: number;
  resetTimeMs: number;
}

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<RateLimitHit>;
}

/**
 * Skrip Lua atomik di Redis agar `INCR` dan `PEXPIRE` dieksekusi tanpa race condition.
 */
const ATOMIC_RATE_LIMIT_LUA = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; resetTimeMs: number }>();

  async increment(key: string, windowMs: number): Promise<RateLimitHit> {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetTimeMs <= now) {
      const fresh = { count: 1, resetTimeMs: now + windowMs };
      this.buckets.set(key, fresh);
      return { totalHits: fresh.count, resetTimeMs: fresh.resetTimeMs };
    }

    existing.count += 1;
    return { totalHits: existing.count, resetTimeMs: existing.resetTimeMs };
  }
}

export class RedisRateLimitStore implements RateLimitStore {
  private readonly fallback = new InMemoryRateLimitStore();

  constructor(
    private readonly client: Redis,
    private readonly keyPrefix: string = 'rl',
  ) {}

  async increment(key: string, windowMs: number): Promise<RateLimitHit> {
    const namespacedKey = `${this.keyPrefix}:${key}`;
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      const rawResult = (await this.client.eval(
        ATOMIC_RATE_LIMIT_LUA,
        1,
        namespacedKey,
        String(windowMs),
      )) as [number, number];

      const totalHits = Number(rawResult[0]);
      const ttlMs = Math.max(1, Number(rawResult[1]));
      return {
        totalHits,
        resetTimeMs: Date.now() + ttlMs,
      };
    } catch (err) {
      logger.warn('Redis rate limiter tidak terjangkau, beralih ke fallback in-memory', {
        error: err instanceof Error ? err.message : String(err),
      });
      return this.fallback.increment(namespacedKey, windowMs);
    }
  }
}

export interface RateLimiterOptions {
  tier: string;
  windowMs: number;
  max: number;
  store: RateLimitStore;
  keyGenerator?: (req: Request) => string;
}

export function defaultClientIpKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    const firstIp = forwarded.split(',')[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const resolveKey = options.keyGenerator ?? defaultClientIpKey;

  return asyncHandler(async (req, res, next) => {
    const bucketKey = `${options.tier}:${resolveKey(req)}`;
    const { totalHits, resetTimeMs } = await options.store.increment(bucketKey, options.windowMs);

    const remaining = Math.max(0, options.max - totalHits);
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimeMs - Date.now()) / 1000));

    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(retryAfterSeconds));

    if (totalHits > options.max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      throw new AppError(
        ERROR_CODES.RATE_LIMITED,
        'Terlalu banyak permintaan, silakan coba lagi beberapa saat',
        429,
        { retryAfterSeconds },
      );
    }

    next();
  });
}
