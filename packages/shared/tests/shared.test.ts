import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  ERROR_CODES,
  MAX_PAGE_LIMIT,
  PRODUCT_TYPES,
  USER_ROLES,
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  paginationQuerySchema,
  refreshTokenSchema,
} from '../src';

describe('shared constants', () => {
  it('mendefinisikan role sesuai spesifikasi', () => {
    expect(USER_ROLES).toEqual(['OWNER', 'MANAGER', 'CASHIER']);
  });

  it('mendefinisikan tipe produk WEIGHT dan UNIT', () => {
    expect(PRODUCT_TYPES).toEqual(['WEIGHT', 'UNIT']);
  });

  it('mendefinisikan kode error mesin utama sesuai spesifikasi', () => {
    expect(ERROR_CODES.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
    expect(ERROR_CODES.ACCOUNT_LOCKED).toBe('ACCOUNT_LOCKED');
    expect(ERROR_CODES.INSUFFICIENT_STOCK).toBe('INSUFFICIENT_STOCK');
    expect(ERROR_CODES.RATE_LIMITED).toBe('RATE_LIMITED');
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

describe('auth validators (Bagian 7.2 & Bagian 14.2)', () => {
  it('loginSchema memangkas spasi username dan menolak input kosong', () => {
    expect(loginSchema.parse({ username: '  kasir01  ', password: 'Password123' })).toEqual({
      username: 'kasir01',
      password: 'Password123',
    });
    expect(loginSchema.safeParse({ username: 'ab', password: 'Password123' }).success).toBe(false);
    expect(loginSchema.safeParse({ username: 'kasir01', password: '' }).success).toBe(false);
  });

  it('refreshTokenSchema & logoutSchema memvalidasi refreshToken non-kosong', () => {
    expect(refreshTokenSchema.parse({ refreshToken: 'token-abc' })).toEqual({
      refreshToken: 'token-abc',
    });
    expect(refreshTokenSchema.safeParse({ refreshToken: '   ' }).success).toBe(false);
    expect(logoutSchema.parse({ refreshToken: 'token-abc' })).toEqual({
      refreshToken: 'token-abc',
    });
  });

  it('changePasswordSchema memvalidasi aturan kekuatan password & kecocokan konfirmasi', () => {
    expect(
      changePasswordSchema.parse({
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
        confirmPassword: 'NewPassword456',
      }),
    ).toEqual({
      currentPassword: 'OldPassword123',
      newPassword: 'NewPassword456',
      confirmPassword: 'NewPassword456',
    });

    // Tidak ada huruf besar
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'OldPassword123',
        newPassword: 'newpassword456',
        confirmPassword: 'newpassword456',
      }).success,
    ).toBe(false);

    // Konfirmasi tidak cocok
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'OldPassword123',
        newPassword: 'NewPassword456',
        confirmPassword: 'DifferentPassword456',
      }).success,
    ).toBe(false);

    // Password baru sama dengan password lama
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'SamePassword123',
        newPassword: 'SamePassword123',
        confirmPassword: 'SamePassword123',
      }).success,
    ).toBe(false);
  });
});
