import Redis from 'ioredis';
import type { ServiceStatus } from '@istana-buah/shared';
import { redisConfig, type RedisConfig } from '../config/redis.config';
import { logger } from './logger';

/**
 * Redis client singleton (Bagian 5.4 & Bagian 15.5).
 * Menggunakan `lazyConnect: true` agar inisialisasi modul tidak memblokir startup/unit test.
 */
export function createRedisClient(cfg: RedisConfig = redisConfig): Redis {
  const client = new Redis(cfg.url, {
    maxRetriesPerRequest: cfg.maxRetriesPerRequest,
    connectTimeout: cfg.connectTimeoutMs,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  client.on('error', (err: Error) => {
    logger.error('Redis client error', { message: err.message });
  });

  return client;
}

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis: Redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

export interface RedisHealthCheckable {
  status: string;
  connect: () => Promise<unknown>;
  ping: () => Promise<string>;
}

export async function checkRedisHealth(
  client: RedisHealthCheckable = redis,
): Promise<ServiceStatus> {
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const pong = await client.ping();
    return pong === 'PONG' ? 'ok' : 'down';
  } catch (err) {
    logger.error('Redis health check failed', { err });
    return 'down';
  }
}

export async function disconnectRedis(client: Redis = redis): Promise<void> {
  if (client.status !== 'end' && client.status !== 'wait') {
    await client.quit();
  }
}
