import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  PRODUCT_TYPES,
  USER_ROLES,
  paginationQuerySchema,
} from '../src';

describe('shared constants', () => {
  it('mendefinisikan role sesuai spesifikasi', () => {
    expect(USER_ROLES).toEqual(['OWNER', 'MANAGER', 'CASHIER']);
  });

  it('mendefinisikan tipe produk WEIGHT dan UNIT', () => {
    expect(PRODUCT_TYPES).toEqual(['WEIGHT', 'UNIT']);
  });
});

describe('paginationQuerySchema', () => {
  it('memakai default saat query kosong', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: DEFAULT_PAGE_LIMIT });
  });

  it('meng-coerce string dari query string', () => {
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('menolak limit di atas batas maksimum', () => {
    expect(paginationQuerySchema.safeParse({ limit: MAX_PAGE_LIMIT + 1 }).success).toBe(false);
  });

  it('menolak page < 1', () => {
    expect(paginationQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });
});
