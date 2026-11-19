import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_LIMIT,
  ERROR_CODES,
  MAX_PAGE_LIMIT,
  PRODUCT_TYPES,
  USER_ROLES,
  addProductBarcodeSchema,
  batchImportProductItemSchema,
  batchImportProductsSchema,
  calculateEan13CheckDigit,
  closeShiftSchema,
  encodeBarcodePattern,
  encodeCode39Pattern,
  encodeEan13Pattern,
  escapeCsvCell,
  categoryListQuerySchema,
  changePasswordSchema,
  createProductSchema,
  createPurchaseOrderSchema,
  createStockOpnameSchema,
  createSupplierSchema,
  createTransactionSchema,
  generateBarcodeQuerySchema,
  generateProductCsvTemplate,
  isValidEan13,
  loginSchema,
  logoutSchema,
  lowStockAlertQuerySchema,
  openShiftSchema,
  paginationQuerySchema,
  parseCsv,
  payPurchaseOrderSchema,
  productListQuerySchema,
  productPerformanceQuerySchema,
  purchaseOrderListQuerySchema,
  receiveStockSchema,
  refreshTokenSchema,
  salesExportQuerySchema,
  salesSummaryQuerySchema,
  shiftListQuerySchema,
  stockCurrentReportQuerySchema,
  stockMovementListQuerySchema,
  supplierListQuerySchema,
  transactionListQuerySchema,
  updateProductSchema,
  updateSupplierSchema,
  voidTransactionSchema,
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

describe('CSV Parser, Serializer, and Product Template (M02-007)', () => {
  it('parseCsv membaca CSV dengan header dan whitespace dengan benar', () => {
    const csvContent = `name,categoryName,productType,price,cost\nApel Malang,Buah Lokal,WEIGHT,25000,18000\nJeruk Bali,Buah Lokal,UNIT,35000,28000`;
    const rows = parseCsv(csvContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.rowNumber).toBe(2);
    expect(rows[0]?.data.name).toBe('Apel Malang');
    expect(rows[0]?.data.categoryname).toBe('Buah Lokal');
    expect(rows[0]?.data.producttype).toBe('WEIGHT');
    expect(rows[0]?.data.price).toBe('25000');
    expect(rows[1]?.data.name).toBe('Jeruk Bali');
  });

  it('parseCsv mendukung quoted string dan escaped double quotes', () => {
    const csvContent = `"name","categoryName","productType","description"\n"Mangga ""Super"" Probolinggo","Buah Lokal","WEIGHT","Segar, manis, dan berair"`;
    const rows = parseCsv(csvContent);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data.name).toBe('Mangga "Super" Probolinggo');
    expect(rows[0]?.data.description).toBe('Segar, manis, dan berair');
  });

  it('parseCsv mengembalikan array kosong saat CSV kosong atau hanya header', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('   \n  \r\n ')).toEqual([]);
    expect(parseCsv('name,categoryName,productType')).toEqual([]);
  });

  it('escapeCsvCell meng-escape koma, kutip dua, dan baris baru', () => {
    expect(escapeCsvCell('Normal')).toBe('Normal');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
    expect(escapeCsvCell('Apple, Banana')).toBe('"Apple, Banana"');
    expect(escapeCsvCell('Say "Hello"')).toBe('"Say ""Hello"""');
    expect(escapeCsvCell('Line1\nLine2')).toBe('"Line1\nLine2"');
  });

  it('generateProductCsvTemplate menghasilkan template CSV valid yang dapat di-parse kembali', () => {
    const template = generateProductCsvTemplate();
    expect(template).toContain('name,categoryName,productType,price');
    const parsed = parseCsv(template);
    expect(parsed.length).toBeGreaterThanOrEqual(4);
    expect(parsed[0]?.data.name).toBe('Mangga Harum Manis Super');
    expect(parsed[0]?.data.producttype).toBe('WEIGHT');
  });
});

describe('Batch Import Product Validators (M02-007)', () => {
  it('batchImportProductItemSchema memvalidasi data baris produk', () => {
    const validWeightItem = {
      name: 'Salak Pondoh Sleman',
      categoryName: 'Buah Lokal',
      productType: 'WEIGHT',
      price: 15000,
      cost: 10000,
      stockQty: 50,
      minStockAlert: 5,
      barcode: '8991234567891',
      description: 'Salak manis renyah',
    };
    expect(batchImportProductItemSchema.safeParse(validWeightItem).success).toBe(true);

    const invalidPriceItem = {
      ...validWeightItem,
      price: -500, // harus positif
    };
    expect(batchImportProductItemSchema.safeParse(invalidPriceItem).success).toBe(false);

    const missingCategoryItem = {
      ...validWeightItem,
      categoryName: '',
    };
    expect(batchImportProductItemSchema.safeParse(missingCategoryItem).success).toBe(false);
  });

  it('batchImportProductsSchema memvalidasi batasan ukuran batch (1 hingga 500)', () => {
    expect(batchImportProductsSchema.safeParse({ items: [] }).success).toBe(false);

    const singleItem = {
      name: 'Semangka Non Biji',
      categoryName: 'Buah Lokal',
      productType: 'WEIGHT' as const,
      price: 10000,
    };
    expect(batchImportProductsSchema.safeParse({ items: [singleItem] }).success).toBe(true);

    const overLimit = Array.from({ length: 501 }, (_, i) => ({
      name: `Produk ${i}`,
      categoryName: 'Buah Lokal',
      productType: 'UNIT' as const,
      price: 10000,
    }));
    expect(batchImportProductsSchema.safeParse({ items: overLimit }).success).toBe(false);
  });
});

describe('Transaction Validators (M03-001)', () => {
  const validProductId = '123e4567-e89b-12d3-a456-426614174000';

  it('createTransactionSchema memvalidasi data transaksi POS', () => {
    const validCash = {
      items: [
        {
          productId: validProductId,
          quantity: 1.5,
          unitPrice: 25000,
          discountAmount: 0,
        },
      ],
      discountAmount: 0,
      paymentMethod: 'CASH',
      amountPaid: 40000,
    };
    expect(createTransactionSchema.safeParse(validCash).success).toBe(true);

    // CASH pembayaran kurang dari total belanja (1.5 * 25000 = 37500 > 30000)
    const underpaidCash = {
      ...validCash,
      amountPaid: 30000,
    };
    expect(createTransactionSchema.safeParse(underpaidCash).success).toBe(false);

    // QRIS tidak memerlukan amountPaid melebihi subtotal (bisa pas)
    const validQris = {
      items: [
        {
          productId: validProductId,
          quantity: 2,
          unitPrice: 15000,
        },
      ],
      paymentMethod: 'QRIS',
      amountPaid: 30000,
    };
    expect(createTransactionSchema.safeParse(validQris).success).toBe(true);
  });

  it('voidTransactionSchema memvalidasi alasan void', () => {
    expect(voidTransactionSchema.safeParse({ reason: 'Salah input berat timbangan' }).success).toBe(
      true,
    );
    expect(voidTransactionSchema.safeParse({ reason: 'no' }).success).toBe(false); // < 3 karakter
    expect(voidTransactionSchema.safeParse({ reason: '' }).success).toBe(false);
  });

  it('transactionListQuerySchema memvalidasi filter query riwayat transaksi', () => {
    const parsed = transactionListQuerySchema.parse({
      page: '1',
      limit: '20',
      status: 'COMPLETED',
      paymentMethod: 'CASH',
    });
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.status).toBe('COMPLETED');
    expect(parsed.paymentMethod).toBe('CASH');
  });

  it('transactionListQuerySchema menerima YYYY-MM-DD & ISO berzona, menolak format tidak valid', () => {
    expect(
      transactionListQuerySchema.safeParse({
        startDate: '2026-11-17',
        endDate: '2026-11-17T23:59:59.999+07:00',
      }).success,
    ).toBe(true);
    expect(transactionListQuerySchema.safeParse({ startDate: 'bukan-tanggal' }).success).toBe(
      false,
    );
    expect(transactionListQuerySchema.safeParse({ endDate: '2026-13-45' }).success).toBe(false);
  });
});

describe('Stock Validators (M04-001)', () => {
  const validProductId = '123e4567-e89b-12d3-a456-426614174000';
  const validSupplierId = '223e4567-e89b-12d3-a456-426614174000';

  it('receiveStockSchema memvalidasi penerimaan stok dan menolak item kosong/qty <= 0', () => {
    expect(
      receiveStockSchema.safeParse({
        supplierId: validSupplierId,
        items: [{ productId: validProductId, quantity: 20, unitCost: 18000 }],
        notes: 'Penerimaan pagi',
      }).success,
    ).toBe(true);

    expect(receiveStockSchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      receiveStockSchema.safeParse({
        items: [{ productId: validProductId, quantity: 0 }],
      }).success,
    ).toBe(false);
    expect(
      receiveStockSchema.safeParse({
        items: [{ productId: validProductId, quantity: 5, unitCost: -1 }],
      }).success,
    ).toBe(false);
  });

  it('createStockOpnameSchema memvalidasi qty fisik >= 0 dan menolak produk duplikat', () => {
    const valid = createStockOpnameSchema.parse({
      items: [{ productId: validProductId, physicalQty: 0 }],
      notes: 'Opname akhir bulan',
    });
    expect(valid.finalize).toBe(true);

    expect(
      createStockOpnameSchema.safeParse({
        items: [
          { productId: validProductId, physicalQty: 5 },
          { productId: validProductId, physicalQty: 6 },
        ],
      }).success,
    ).toBe(false);

    expect(
      createStockOpnameSchema.safeParse({
        items: [{ productId: validProductId, physicalQty: -0.5 }],
      }).success,
    ).toBe(false);
  });

  it('stockMovementListQuerySchema & lowStockAlertQuerySchema memvalidasi query filter stok', () => {
    const movQuery = stockMovementListQuerySchema.parse({
      productId: validProductId,
      type: 'PURCHASE_IN',
      startDate: '2026-11-17T00:00:00+07:00',
    });
    expect(movQuery.type).toBe('PURCHASE_IN');
    expect(stockMovementListQuerySchema.safeParse({ type: 'INVALID_TYPE' }).success).toBe(false);

    const lowQuery = lowStockAlertQuerySchema.parse({ search: 'Mangga', limit: '50' });
    expect(lowQuery.search).toBe('Mangga');
    expect(lowQuery.limit).toBe(50);
  });
});

describe('Supplier Validators (M05-001)', () => {
  it('createSupplierSchema, updateSupplierSchema & supplierListQuerySchema memvalidasi input supplier', () => {
    const created = createSupplierSchema.parse({
      name: '  CV Agro Segar  ',
      contactPerson: '  ',
      phoneNumber: '08123456789',
    });
    expect(created.name).toBe('CV Agro Segar');
    expect(created.contactPerson).toBeNull();

    expect(createSupplierSchema.safeParse({ name: 'A' }).success).toBe(false);
    expect(updateSupplierSchema.safeParse({}).success).toBe(false);
    expect(updateSupplierSchema.safeParse({ isActive: false }).success).toBe(true);

    const query = supplierListQuerySchema.parse({ search: 'Agro', isActive: 'true', limit: '25' });
    expect(query.search).toBe('Agro');
    expect(query.isActive).toBe(true);
    expect(query.limit).toBe(25);
  });
});

describe('Purchase Order Validators (M05-002)', () => {
  const validSupplierId = '223e4567-e89b-12d3-a456-426614174000';
  const validProductId = '123e4567-e89b-12d3-a456-426614174000';

  it('createPurchaseOrderSchema memvalidasi PO, menolak produk duplikat, dan menolak DP melebihi total', () => {
    expect(
      createPurchaseOrderSchema.safeParse({
        supplierId: validSupplierId,
        items: [{ productId: validProductId, quantity: 10, unitCost: 18000 }],
        paidAmount: 50000,
      }).success,
    ).toBe(true);

    expect(
      createPurchaseOrderSchema.safeParse({
        supplierId: validSupplierId,
        items: [
          { productId: validProductId, quantity: 10, unitCost: 18000 },
          { productId: validProductId, quantity: 5, unitCost: 18000 },
        ],
      }).success,
    ).toBe(false);

    expect(
      createPurchaseOrderSchema.safeParse({
        supplierId: validSupplierId,
        items: [{ productId: validProductId, quantity: 2, unitCost: 10000 }],
        paidAmount: 25000,
      }).success,
    ).toBe(false);
  });

  it('payPurchaseOrderSchema & purchaseOrderListQuerySchema memvalidasi pelunasan & filter PO', () => {
    expect(
      payPurchaseOrderSchema.safeParse({ amount: 150000, notes: 'Transfer BCA' }).success,
    ).toBe(true);
    expect(payPurchaseOrderSchema.safeParse({ amount: 0 }).success).toBe(false);

    const parsed = purchaseOrderListQuerySchema.parse({
      status: 'PARTIAL',
      unpaidOnly: 'true',
      page: '2',
    });
    expect(parsed.status).toBe('PARTIAL');
    expect(parsed.unpaidOnly).toBe(true);
    expect(parsed.page).toBe(2);
  });
});

describe('Shift Validators (M06-001)', () => {
  it('openShiftSchema, closeShiftSchema, & shiftListQuerySchema memvalidasi input shift kasir', () => {
    expect(openShiftSchema.safeParse({ openingCash: 500000, notes: 'Shift Pagi' }).success).toBe(
      true,
    );
    expect(openShiftSchema.safeParse({ openingCash: -100 }).success).toBe(false);

    expect(closeShiftSchema.safeParse({ closingCash: 1250000 }).success).toBe(true);
    expect(closeShiftSchema.safeParse({ closingCash: -1 }).success).toBe(false);

    const parsed = shiftListQuerySchema.parse({ status: 'OPEN', page: '1', limit: '20' });
    expect(parsed.status).toBe('OPEN');
    expect(parsed.page).toBe(1);
  });
});

describe('Report Validators (M07-001)', () => {
  it('salesSummaryQuerySchema memvalidasi rentang tanggal dan groupBy', () => {
    const parsed = salesSummaryQuerySchema.parse({
      startDate: '2026-11-01',
      endDate: '2026-11-17',
      groupBy: 'week',
    });
    expect(parsed.groupBy).toBe('week');
    expect(salesSummaryQuerySchema.parse({}).groupBy).toBe('day');
    expect(salesSummaryQuerySchema.safeParse({ groupBy: 'hourly' }).success).toBe(false);
  });

  it('productPerformanceQuerySchema memvalidasi sortBy & batas limit', () => {
    const parsed = productPerformanceQuerySchema.parse({ sortBy: 'qty', limit: '25' });
    expect(parsed.sortBy).toBe('qty');
    expect(parsed.limit).toBe(25);
    expect(productPerformanceQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('stockCurrentReportQuerySchema & salesExportQuerySchema memvalidasi parameter laporan & ekspor', () => {
    const stockParsed = stockCurrentReportQuerySchema.parse({
      lowStockOnly: 'true',
      search: '  Mangga  ',
    });
    expect(stockParsed.lowStockOnly).toBe(true);
    expect(stockParsed.search).toBe('Mangga');
    expect(stockCurrentReportQuerySchema.safeParse({ categoryId: 'not-uuid' }).success).toBe(false);

    const exportParsed = salesExportQuerySchema.parse({
      format: 'pdf',
      startDate: '2026-11-01',
      endDate: '2026-11-17',
    });
    expect(exportParsed.format).toBe('pdf');
    expect(salesExportQuerySchema.safeParse({ format: 'docx' }).success).toBe(false);
  });
});
