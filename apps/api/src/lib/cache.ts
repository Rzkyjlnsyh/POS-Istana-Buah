import type Redis from 'ioredis';
import { logger } from './logger';

/**
 * Abstraksi cache-aside (Bagian 15.2). Pembacaan gagal (miss/error Redis) selalu dianggap miss
 * (fail-open) sehingga gangguan Redis tidak pernah menjatuhkan endpoint — DB tetap sumber kebenaran.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Menaikkan versi namespace secara atomik sehingga seluruh key lama otomatis usang (bust on write). */
  bumpVersion(namespace: string): Promise<number>;
  getVersion(namespace: string): Promise<number>;
}

export class RedisCacheStore implements CacheStore {
  constructor(
    private readonly client: Redis,
    private readonly keyPrefix: string,
  ) {}

  private key(raw: string): string {
    return `${this.keyPrefix}:${raw}`;
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(this.key(key));
    } catch (err) {
      logger.warn('Cache get gagal, fallback ke database', { key, err });
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(this.key(key), value, 'EX', ttlSeconds);
    } catch (err) {
      logger.warn('Cache set gagal', { key, err });
    }
  }

  async bumpVersion(namespace: string): Promise<number> {
    try {
      return await this.client.incr(this.key(`${namespace}:version`));
    } catch (err) {
      logger.warn('Cache bumpVersion gagal', { namespace, err });
      return 0;
    }
  }

  async getVersion(namespace: string): Promise<number> {
    try {
      const raw = await this.client.get(this.key(`${namespace}:version`));
      return raw === null ? 0 : Number(raw);
    } catch (err) {
      logger.warn('Cache getVersion gagal', { namespace, err });
      return 0;
    }
  }
}

/** Implementasi in-memory untuk unit test / fallback; mendukung TTL sederhana. */
export class InMemoryCacheStore implements CacheStore {
  private readonly values = new Map<string, { value: string; expiresAt: number }>();
  private readonly versions = new Map<string, number>();

  get(key: string): Promise<string | null> {
    const entry = this.values.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }

  bumpVersion(namespace: string): Promise<number> {
    const next = (this.versions.get(namespace) ?? 0) + 1;
    this.versions.set(namespace, next);
    return Promise.resolve(next);
  }

  getVersion(namespace: string): Promise<number> {
    return Promise.resolve(this.versions.get(namespace) ?? 0);
  }
}
