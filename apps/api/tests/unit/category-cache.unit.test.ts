import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { buildCacheConfig } from '../../src/config/cache.config';
import { InMemoryCacheStore, RedisCacheStore } from '../../src/lib/cache';
import { CategoryService } from '../../src/modules/categories/category.service';

describe('M02-001 Unit: cache config & CacheStore', () => {
  it('buildCacheConfig memvalidasi env wajib dan melempar error bila kosong', () => {
    expect(() => buildCacheConfig({})).toThrow(/Konfigurasi cache tidak valid/);
    expect(buildCacheConfig({ CACHE_KEY_PREFIX: 'ib', CACHE_CATEGORY_TTL_SECONDS: '120' })).toEqual(
      { keyPrefix: 'ib', categoryTtlSeconds: 120, productTtlSeconds: 300 },
    );
  });

  it('InMemoryCacheStore mendukung TTL, versi namespace, dan kedaluwarsa', async () => {
    const store = new InMemoryCacheStore();
    await store.set('k', 'v', 60);
    expect(await store.get('k')).toBe('v');
    expect(await store.get('tidak-ada')).toBeNull();

    await store.set('expired', 'x', -1);
    expect(await store.get('expired')).toBeNull();

    expect(await store.getVersion('ns')).toBe(0);
    expect(await store.bumpVersion('ns')).toBe(1);
    expect(await store.getVersion('ns')).toBe(1);
  });

  it('RedisCacheStore fail-open: error Redis dianggap cache miss dan tidak melempar', async () => {
    const broken = {
      get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      incr: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as Redis;
    const store = new RedisCacheStore(broken, 'p');

    expect(await store.get('k')).toBeNull();
    await expect(store.set('k', 'v', 10)).resolves.toBeUndefined();
    expect(await store.bumpVersion('ns')).toBe(0);
    expect(await store.getVersion('ns')).toBe(0);
  });

  it('RedisCacheStore memakai prefix key, TTL EX, dan INCR atomik', async () => {
    const client = {
      get: jest.fn().mockResolvedValueOnce('nilai').mockResolvedValueOnce('7'),
      set: jest.fn().mockResolvedValue('OK'),
      incr: jest.fn().mockResolvedValue(8),
    } as unknown as Redis;
    const store = new RedisCacheStore(client, 'pre');

    expect(await store.get('a')).toBe('nilai');
    expect(client.get).toHaveBeenCalledWith('pre:a');
    await store.set('a', 'b', 30);
    expect(client.set).toHaveBeenCalledWith('pre:a', 'b', 'EX', 30);
    expect(await store.getVersion('ns')).toBe(7);
    expect(await store.bumpVersion('ns')).toBe(8);
    expect(client.incr).toHaveBeenCalledWith('pre:ns:version');
  });
});

describe('M02-001 Unit: CategoryService edge cases', () => {
  const cfg = { keyPrefix: 'x', categoryTtlSeconds: 60, productTtlSeconds: 300 };
  const actor = { userId: 'u1', ipAddress: null, userAgent: null };

  it('list mengabaikan cache korup dan memuat ulang dari database', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([0, []]),
      category: { count: jest.fn(), findMany: jest.fn() },
    } as unknown as PrismaClient;
    const service = new CategoryService(prisma, cache, cfg);

    await cache.set('categories:v0:p1:l20:a-:s', '{bukan-json', 60);
    const result = await service.list({
      page: 1,
      limit: 20,
      search: undefined,
      isActive: undefined,
    });
    expect(result).toEqual({ items: [], meta: { page: 1, limit: 20, total: 0 } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('create/update memetakan P2002 (race unique constraint) menjadi 409 DUPLICATE_CATEGORY', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(p2002),
    } as unknown as PrismaClient;
    const service = new CategoryService(prisma, new InMemoryCacheStore(), cfg);

    await expect(service.create({ name: 'Dup' }, actor)).rejects.toMatchObject({
      code: ERROR_CODES.DUPLICATE_CATEGORY,
      statusCode: 409,
    });
    await expect(service.update('id', { name: 'Dup' }, actor)).rejects.toMatchObject({
      code: ERROR_CODES.DUPLICATE_CATEGORY,
      statusCode: 409,
    });
  });

  it('error non-unique diteruskan apa adanya', async () => {
    const boom = new Error('db down');
    const prisma = { $transaction: jest.fn().mockRejectedValue(boom) } as unknown as PrismaClient;
    const service = new CategoryService(prisma, new InMemoryCacheStore(), cfg);
    await expect(service.create({ name: 'X1' }, actor)).rejects.toBe(boom);
    await expect(service.update('id', { name: 'X1' }, actor)).rejects.toBe(boom);
  });
});
