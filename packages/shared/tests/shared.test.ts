import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  ERROR_CODES,
  MAX_PAGE_LIMIT,
  PRODUCT_TYPES,
  USER_ROLES,
  addProductBarcodeSchema,
  calculateEan13CheckDigit,
  encodeBarcodePattern,
  encodeCode39Pattern,
  encodeEan13Pattern,
  categoryListQuerySchema,
  changePasswordSchema,
  createProductSchema,
  generateBarcodeQuerySchema,
  isValidEan13,
  loginSchema,
  logoutSchema,
  paginationQuerySchema,
  productListQuerySchema,
  refreshTokenSchema,
  updateProductSchema,
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

describe('EAN-13 Barcode GS1 Utilities (M02-003)', () => {
  it('calculateEan13CheckDigit menghitung check digit sesuai GS1 Modulo 10', () => {
    // 899123456789 -> check digit 1
    expect(calculateEan13CheckDigit('899123456789')).toBe(1);
    // 400638133393 -> check digit 1
    expect(calculateEan13CheckDigit('400638133393')).toBe(1);
    // 123456789012 -> check digit 8
    expect(calculateEan13CheckDigit('123456789012')).toBe(8);
    // 000000000000 -> check digit 0 (remainder 0)
    expect(calculateEan13CheckDigit('000000000000')).toBe(0);

    // Menolak string bukan 12 digit
    expect(() => calculateEan13CheckDigit('12345')).toThrow(/12 digit/);
    expect(() => calculateEan13CheckDigit('12345678901a')).toThrow(/12 digit/);
  });

  it('isValidEan13 memvalidasi panjang dan kebenaran check digit', () => {
    expect(isValidEan13('8991234567891')).toBe(true);
    expect(isValidEan13('4006381333931')).toBe(true);
    expect(isValidEan13('1234567890128')).toBe(true);
    expect(isValidEan13('0000000000000')).toBe(true);

    // Check digit salah
    expect(isValidEan13('8991234567890')).toBe(false);
    // Panjang bukan 13
    expect(isValidEan13('12345')).toBe(false);
    expect(isValidEan13('89912345678910')).toBe(false);
    // Non numerik
    expect(isValidEan13('899123456789A')).toBe(false);
  });

  it('encodeEan13Pattern menghasilkan tepat 95 modul biner (101 guard, center 01010, right 101)', () => {
    const pattern = encodeEan13Pattern('8991234567891');
    expect(pattern).toHaveLength(95);
    expect(pattern.startsWith('101')).toBe(true); // Left guard
    expect(pattern.slice(45, 50)).toBe('01010'); // Center guard
    expect(pattern.endsWith('101')).toBe(true); // Right guard
    expect(/^[01]+$/.test(pattern)).toBe(true);

    // Menolak barcode bukan 13 digit
    expect(() => encodeEan13Pattern('12345')).toThrow(/13 digit/);
  });

  it('encodeCode39Pattern menghasilkan modul biner untuk teks alfanumerik', () => {
    const pattern = encodeCode39Pattern('APEL-10');
    expect(pattern.length).toBeGreaterThan(0);
    expect(/^[01]+$/.test(pattern)).toBe(true);
  });

  it('encodeBarcodePattern secara cerdas memilih EAN-13 untuk 13 digit dan Code 39 untuk format lain', () => {
    const eanPattern = encodeBarcodePattern('8991234567891');
    expect(eanPattern).toHaveLength(95);

    const code39Pattern = encodeBarcodePattern('ITEM-001');
    expect(code39Pattern).toBe(encodeCode39Pattern('ITEM-001'));
  });
});

describe('Product & Barcode Validators (M02-002 & M02-003)', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  it('createProductSchema memvalidasi tipe WEIGHT dan UNIT secara tepat', () => {
    const validWeight = createProductSchema.safeParse({
      name: 'Apel Malang',
      categoryId: validUuid,
      productType: 'WEIGHT',
      pricePerKg: 25000,
      costPerKg: 18000,
      description: 'Apel manis',
    });
    expect(validWeight.success).toBe(true);

    // WEIGHT tanpa pricePerKg
    const noPriceWeight = createProductSchema.safeParse({
      name: 'Apel Malang',
      categoryId: validUuid,
      productType: 'WEIGHT',
    });
    expect(noPriceWeight.success).toBe(false);

    // WEIGHT ada costPerUnit
    const costUnitWeight = createProductSchema.safeParse({
      name: 'Apel Malang',
      categoryId: validUuid,
      productType: 'WEIGHT',
      pricePerKg: 25000,
      costPerUnit: 5000,
    });
    expect(costUnitWeight.success).toBe(false);

    // WEIGHT tidak boleh ada pricePerUnit
    const invalidWeight = createProductSchema.safeParse({
      name: 'Apel Malang',
      categoryId: validUuid,
      productType: 'WEIGHT',
      pricePerKg: 25000,
      pricePerUnit: 5000,
    });
    expect(invalidWeight.success).toBe(false);

    // UNIT wajib ada pricePerUnit
    const validUnit = createProductSchema.safeParse({
      name: 'Semangka Potong',
      categoryId: validUuid,
      productType: 'UNIT',
      pricePerUnit: 12000,
      costPerUnit: 8000,
      description: '',
    });
    expect(validUnit.success).toBe(true);

    // UNIT tanpa pricePerUnit
    const noPriceUnit = createProductSchema.safeParse({
      name: 'Semangka Potong',
      categoryId: validUuid,
      productType: 'UNIT',
    });
    expect(noPriceUnit.success).toBe(false);

    // UNIT ada costPerKg
    const costKgUnit = createProductSchema.safeParse({
      name: 'Semangka Potong',
      categoryId: validUuid,
      productType: 'UNIT',
      pricePerUnit: 12000,
      costPerKg: 5000,
    });
    expect(costKgUnit.success).toBe(false);

    // UNIT tidak boleh ada pricePerKg
    const invalidUnit = createProductSchema.safeParse({
      name: 'Semangka Potong',
      categoryId: validUuid,
      productType: 'UNIT',
      pricePerUnit: 12000,
      pricePerKg: 10000,
    });
    expect(invalidUnit.success).toBe(false);
  });

  it('updateProductSchema menolak objek kosong dan menerima partial updates', () => {
    expect(updateProductSchema.safeParse({}).success).toBe(false);
    expect(updateProductSchema.safeParse({ name: 'Nama Baru' }).success).toBe(true);
  });

  it('productListQuerySchema mentransform query parameter dengan benar', () => {
    const parsed = productListQuerySchema.parse({
      page: '2',
      limit: '15',
      search: 'jeruk',
      isActive: 'true',
      lowStock: 'false',
    });
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(15);
    expect(parsed.search).toBe('jeruk');
    expect(parsed.isActive).toBe(true);
    expect(parsed.lowStock).toBe(false);

    const emptySearch = productListQuerySchema.parse({ search: '' });
    expect(emptySearch.search).toBeUndefined();
  });

  it('categoryListQuerySchema mentransform filter dengan benar', () => {
    const parsed = categoryListQuerySchema.parse({
      search: 'lokal',
      isActive: 'false',
    });
    expect(parsed.search).toBe('lokal');
    expect(parsed.isActive).toBe(false);
  });

  it('generateBarcodeQuerySchema memvalidasi prefix numerik', () => {
    expect(generateBarcodeQuerySchema.safeParse({ prefix: '200' }).success).toBe(true);
    expect(generateBarcodeQuerySchema.safeParse({ prefix: '20' }).success).toBe(true);
    expect(generateBarcodeQuerySchema.safeParse({ prefix: '2' }).success).toBe(false);
    expect(generateBarcodeQuerySchema.safeParse({ prefix: 'abc' }).success).toBe(false);
  });

  it('addProductBarcodeSchema memvalidasi format barcode', () => {
    expect(addProductBarcodeSchema.safeParse({ barcode: '8991234567891' }).success).toBe(true);
    expect(addProductBarcodeSchema.safeParse({ barcode: 'ABC-123_45' }).success).toBe(true);
    expect(addProductBarcodeSchema.safeParse({ barcode: 'ab' }).success).toBe(false); // terlalu pendek (<3)
    expect(addProductBarcodeSchema.safeParse({ barcode: 'abc@123' }).success).toBe(false); // karakter terlarang
  });
});
