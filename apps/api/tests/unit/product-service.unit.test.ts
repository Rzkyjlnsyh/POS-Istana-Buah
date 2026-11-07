import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import { InMemoryCacheStore } from '../../src/lib/cache';
import {
  PRODUCT_CACHE_NAMESPACE,
  ProductService,
} from '../../src/modules/products/product.service';

describe('M02-002 Unit: ProductService', () => {
  const cacheCfg = {
    keyPrefix: 'test',
    categoryTtlSeconds: 60,
    productTtlSeconds: 120,
  };

  const managerActor = {
    userId: 'u-manager',
    role: 'MANAGER' as const,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  };

  const mockProductWeight = {
    id: 'prod-1',
    categoryId: 'cat-1',
    name: 'Apel Fuji Super',
    description: 'Apel segar',
    productType: 'WEIGHT' as const,
    pricePerKg: new Prisma.Decimal(45000),
    pricePerUnit: null,
    costPerKg: new Prisma.Decimal(30000),
    costPerUnit: null,
    stockQty: new Prisma.Decimal(25.5),
    minStockAlert: new Prisma.Decimal(10),
    imageUrl: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    category: { id: 'cat-1', name: 'Buah Segar' },
    barcodes: [{ id: 'bc-1', barcode: '8991234567890', isPrimary: true }],
  };

  const mockProductUnit = {
    id: 'prod-2',
    categoryId: 'cat-1',
    name: 'Kelapa Muda Butir',
    description: null,
    productType: 'UNIT' as const,
    pricePerKg: null,
    pricePerUnit: new Prisma.Decimal(15000),
    costPerKg: null,
    costPerUnit: new Prisma.Decimal(9000),
    stockQty: new Prisma.Decimal(50),
    minStockAlert: new Prisma.Decimal(5),
    imageUrl: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    category: { id: 'cat-1', name: 'Buah Segar' },
    barcodes: [{ id: 'bc-2', barcode: '8999876543210', isPrimary: true }],
  };

  it('NFR-SEC-09: Menyembunyikan HPP (costPerKg, costPerUnit) dari role CASHIER pada getById', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(mockProductWeight),
      },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    const cashierView = await service.getById('prod-1', 'CASHIER');
    expect(cashierView.costPerKg).toBeNull();
    expect(cashierView.costPerUnit).toBeNull();
    expect(cashierView.pricePerKg).toBe('45000.00');

    const managerView = await service.getById('prod-1', 'MANAGER');
    expect(managerView.costPerKg).toBe('30000.00');
    expect(managerView.costPerUnit).toBeNull();
  });

  it('NFR-SEC-09: Menyembunyikan HPP dari role CASHIER pada getByBarcode dan list', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      barcode: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'bc-1',
          product: mockProductWeight,
        }),
      },
      product: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([mockProductWeight]),
      },
      $transaction: jest.fn().mockImplementation((fns) => Promise.all(fns)),
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    const barcodeCashier = await service.getByBarcode('8991234567890', 'CASHIER');
    expect(barcodeCashier.costPerKg).toBeNull();

    const listCashier = await service.list(
      {
        page: 1,
        limit: 10,
        search: undefined,
        categoryId: undefined,
        type: undefined,
        isActive: undefined,
        lowStock: undefined,
      },
      'CASHIER',
    );
    expect(listCashier.items[0]?.costPerKg).toBeNull();
  });

  it('getById melempar 404 PRODUCT_NOT_FOUND jika produk tidak ditemukan atau terhapus', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await expect(service.getById('unknown', 'MANAGER')).rejects.toMatchObject({
      code: ERROR_CODES.PRODUCT_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('getByBarcode melempar 404 PRODUCT_NOT_FOUND jika barcode tidak ada', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      barcode: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await expect(service.getByBarcode('999999', 'MANAGER')).rejects.toMatchObject({
      code: ERROR_CODES.PRODUCT_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('create melempar 404 CATEGORY_NOT_FOUND jika kategori tidak ada', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      category: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await expect(
      service.create(
        {
          name: 'Mangga',
          categoryId: 'non-existent',
          productType: 'WEIGHT',
          pricePerKg: 20000,
        },
        managerActor,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CATEGORY_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('create melempar 409 DUPLICATE_BARCODE jika ada barcode duplikat dalam payload input', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      category: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await expect(
      service.create(
        {
          name: 'Mangga',
          categoryId: 'cat-1',
          productType: 'WEIGHT',
          pricePerKg: 20000,
          barcodes: ['123', '123'],
        },
        managerActor,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.DUPLICATE_BARCODE,
      statusCode: 409,
    });
  });

  it('create melempar 409 DUPLICATE_BARCODE jika barcode sudah terdaftar di database', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      category: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }) },
      barcode: { findFirst: jest.fn().mockResolvedValue({ barcode: '899123' }) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await expect(
      service.create(
        {
          name: 'Mangga',
          categoryId: 'cat-1',
          productType: 'WEIGHT',
          pricePerKg: 20000,
          barcodes: ['899123'],
        },
        managerActor,
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.DUPLICATE_BARCODE,
      statusCode: 409,
    });
  });

  it('create berhasil menyimpan produk, barcode, audit log, dan membust cache', async () => {
    const cache = new InMemoryCacheStore();
    const txMock = {
      product: { create: jest.fn().mockResolvedValue(mockProductWeight) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      category: { findFirst: jest.fn().mockResolvedValue({ id: 'cat-1' }) },
      barcode: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(txMock)),
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    const created = await service.create(
      {
        name: 'Apel Fuji Super',
        categoryId: 'cat-1',
        productType: 'WEIGHT',
        pricePerKg: 45000,
        costPerKg: 30000,
        barcodes: ['8991234567890'],
      },
      managerActor,
    );

    expect(created.id).toBe('prod-1');
    expect(txMock.product.create).toHaveBeenCalled();
    expect(txMock.auditLog.create).toHaveBeenCalled();
    expect(await cache.getVersion(PRODUCT_CACHE_NAMESPACE)).toBe(1);
  });

  it('update memvalidasi tipe produk dan menolak field yang tidak sesuai tipe (WEIGHT vs UNIT)', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(mockProductWeight) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    // Mengubah produk WEIGHT dengan memasukkan pricePerUnit -> harus ditolak
    await expect(
      service.update('prod-1', { pricePerUnit: 10000 }, managerActor),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
      statusCode: 400,
    });

    // Mengubah produk WEIGHT dengan memasukkan costPerUnit -> harus ditolak
    await expect(
      service.update('prod-1', { costPerUnit: 5000 }, managerActor),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
      statusCode: 400,
    });

    // Mengubah produk UNIT dengan memasukkan pricePerKg -> harus ditolak
    const prismaUnit = {
      product: { findFirst: jest.fn().mockResolvedValue(mockProductUnit) },
    } as unknown as PrismaClient;
    const serviceUnit = new ProductService(prismaUnit, cache, cacheCfg);

    await expect(
      serviceUnit.update('prod-2', { pricePerKg: 20000 }, managerActor),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
      statusCode: 400,
    });
  });

  it('update mencatat PriceHistory saat terjadi perubahan harga jual', async () => {
    const cache = new InMemoryCacheStore();
    const txMock = {
      priceHistory: { create: jest.fn().mockResolvedValue({}) },
      barcode: { deleteMany: jest.fn(), createMany: jest.fn() },
      product: {
        update: jest.fn().mockResolvedValue({
          ...mockProductWeight,
          pricePerKg: new Prisma.Decimal(48000),
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(mockProductWeight) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(txMock)),
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await service.update(
      'prod-1',
      { pricePerKg: 48000, priceChangeReason: 'Kenaikan harga distributor' },
      managerActor,
    );

    expect(txMock.priceHistory.create).toHaveBeenCalledWith({
      data: {
        productId: 'prod-1',
        oldPrice: mockProductWeight.pricePerKg,
        newPrice: new Prisma.Decimal(48000),
        priceType: 'WEIGHT',
        changedBy: 'u-manager',
        reason: 'Kenaikan harga distributor',
      },
    });
  });

  it('update tidak mencatat PriceHistory jika harga tidak berubah', async () => {
    const cache = new InMemoryCacheStore();
    const txMock = {
      priceHistory: { create: jest.fn() },
      product: { update: jest.fn().mockResolvedValue(mockProductWeight) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(mockProductWeight) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(txMock)),
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await service.update('prod-1', { name: 'Nama Baru' }, managerActor);
    expect(txMock.priceHistory.create).not.toHaveBeenCalled();
  });

  it('remove melakukan soft-delete, audit log, dan membust cache', async () => {
    const cache = new InMemoryCacheStore();
    const txMock = {
      product: { update: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(mockProductWeight) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(txMock)),
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await service.remove('prod-1', managerActor);
    expect(txMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-1' },
      data: expect.objectContaining({ isActive: false }),
    });
    expect(txMock.auditLog.create).toHaveBeenCalled();
  });

  it('list menggunakan $queryRaw saat query.lowStock = true', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'prod-1' }]),
      product: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([mockProductWeight]),
      },
      $transaction: jest.fn().mockImplementation((fns) => Promise.all(fns)),
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    const result = await service.list(
      {
        page: 1,
        limit: 10,
        search: undefined,
        categoryId: undefined,
        type: undefined,
        isActive: undefined,
        lowStock: true,
      },
      'MANAGER',
    );
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result.items.length).toBe(1);
  });

  it('update menolak costPerKg pada produk UNIT dan melempar INVALID_PRODUCT_TYPE_FIELDS', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(mockProductUnit) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await expect(service.update('prod-2', { costPerKg: 5000 }, managerActor)).rejects.toMatchObject(
      {
        code: ERROR_CODES.INVALID_PRODUCT_TYPE_FIELDS,
        statusCode: 400,
      },
    );
  });

  it('update melempar 404 CATEGORY_NOT_FOUND jika kategori baru tidak ada', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(mockProductWeight) },
      category: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await expect(
      service.update('prod-1', { categoryId: 'non-existent-cat' }, managerActor),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CATEGORY_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('update melempar 409 DUPLICATE_BARCODE jika input memiliki barcode ganda atau konflik dengan produk lain', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(mockProductWeight) },
      barcode: { findFirst: jest.fn().mockResolvedValue({ barcode: '899999999' }) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    // Duplikat dalam array input
    await expect(
      service.update('prod-1', { barcodes: ['899111', '899111'] }, managerActor),
    ).rejects.toMatchObject({
      code: ERROR_CODES.DUPLICATE_BARCODE,
      statusCode: 409,
    });

    // Konflik di database dengan produk lain
    await expect(
      service.update('prod-1', { barcodes: ['899999999'] }, managerActor),
    ).rejects.toMatchObject({
      code: ERROR_CODES.DUPLICATE_BARCODE,
      statusCode: 409,
    });
  });

  it('update mencatat PriceHistory untuk produk UNIT saat pricePerUnit berubah', async () => {
    const cache = new InMemoryCacheStore();
    const txMock = {
      priceHistory: { create: jest.fn().mockResolvedValue({}) },
      barcode: { deleteMany: jest.fn(), createMany: jest.fn() },
      product: {
        update: jest.fn().mockResolvedValue({
          ...mockProductUnit,
          pricePerUnit: new Prisma.Decimal(18000),
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(mockProductUnit) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(txMock)),
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await service.update(
      'prod-2',
      { pricePerUnit: 18000, priceChangeReason: 'Penyesuaian satuan' },
      managerActor,
    );

    expect(txMock.priceHistory.create).toHaveBeenCalledWith({
      data: {
        productId: 'prod-2',
        oldPrice: mockProductUnit.pricePerUnit,
        newPrice: new Prisma.Decimal(18000),
        priceType: 'UNIT',
        changedBy: 'u-manager',
        reason: 'Penyesuaian satuan',
      },
    });
  });

  it('update dan remove melempar 404 PRODUCT_NOT_FOUND jika produk tidak ditemukan', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    await expect(service.update('non-existent', { name: 'X' }, managerActor)).rejects.toMatchObject(
      {
        code: ERROR_CODES.PRODUCT_NOT_FOUND,
        statusCode: 404,
      },
    );

    await expect(service.remove('non-existent', managerActor)).rejects.toMatchObject({
      code: ERROR_CODES.PRODUCT_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('list, getById, dan getByBarcode mengembalikan data dari cache jika cache hit', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      product: { findFirst: jest.fn() },
      barcode: { findUnique: jest.fn() },
    } as unknown as PrismaClient;
    const service = new ProductService(prisma, cache, cacheCfg);

    // List cache
    const cachedList = { items: [], meta: { page: 1, limit: 10, total: 0 } };
    await cache.set('products:v0:rMANAGER:p1:l10:c-:t-:a-:w-:s', JSON.stringify(cachedList), 60);
    const listRes = await service.list(
      {
        page: 1,
        limit: 10,
        search: undefined,
        categoryId: undefined,
        type: undefined,
        isActive: undefined,
        lowStock: undefined,
      },
      'MANAGER',
    );
    expect(listRes).toEqual(cachedList);
    expect(prisma.product.findFirst).not.toHaveBeenCalled();

    // getById cache
    const cachedDto = { id: 'prod-cached', name: 'Cached' };
    await cache.set('products:v0:rMANAGER:id:prod-1', JSON.stringify(cachedDto), 60);
    const getByIdRes = await service.getById('prod-1', 'MANAGER');
    expect(getByIdRes).toEqual(cachedDto);

    // getByBarcode cache
    await cache.set('products:v0:rMANAGER:bc:899123', JSON.stringify(cachedDto), 60);
    const getByBcRes = await service.getByBarcode('899123', 'MANAGER');
    expect(getByBcRes).toEqual(cachedDto);
  });
});
