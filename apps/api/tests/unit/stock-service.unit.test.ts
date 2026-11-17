import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { CACHE_NAMESPACES, InMemoryCacheStore } from '../../src/lib/cache';
import { StockController } from '../../src/modules/stock/stock.controller';
import { STOCK_CACHE_NAMESPACE, StockService } from '../../src/modules/stock/stock.service';

describe('M04-001 Unit: StockService & StockController', () => {
  const cacheCfg = {
    keyPrefix: 'test',
    categoryTtlSeconds: 60,
    productTtlSeconds: 120,
  };

  const managerActor = {
    userId: 'u-manager-1',
    role: 'MANAGER' as const,
    ipAddress: '127.0.0.1',
    userAgent: 'stock-test',
  };

  const baseWeightProd = {
    id: 'prod-w-1',
    name: 'Mangga Harum Manis',
    productType: 'WEIGHT' as const,
    stockQty: new Prisma.Decimal(5),
    isActive: true,
    deletedAt: null,
  };

  const baseUnitProd = {
    id: 'prod-u-1',
    name: 'Kelapa Muda Utuh',
    productType: 'UNIT' as const,
    stockQty: new Prisma.Decimal(10),
    isActive: true,
    deletedAt: null,
  };

  it('TC-STK-001: receiveStock menambah stok WEIGHT & UNIT, update HPP, log audit & bust cache', async () => {
    const cache = new InMemoryCacheStore();
    const initialProdVer = await cache.getVersion(CACHE_NAMESPACES.PRODUCTS);
    const initialStockVer = await cache.getVersion(STOCK_CACHE_NAMESPACE);

    const movementCreate = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'mov-1',
        productId: baseWeightProd.id,
        movementType: 'PURCHASE_IN',
        quantity: new Prisma.Decimal(20),
        balanceBefore: new Prisma.Decimal(5),
        balanceAfter: new Prisma.Decimal(25),
        referenceId: 'sup-1',
        referenceType: 'SUPPLIER_RECEIVE',
        notes: 'Penerimaan dari PT Segar Nusantara: Kiriman pagi',
        createdBy: managerActor.userId,
        createdAt: new Date('2026-11-17T08:00:00Z'),
        product: { id: baseWeightProd.id, name: baseWeightProd.name, productType: 'WEIGHT' },
      })
      .mockResolvedValueOnce({
        id: 'mov-2',
        productId: baseUnitProd.id,
        movementType: 'PURCHASE_IN',
        quantity: new Prisma.Decimal(6),
        balanceBefore: new Prisma.Decimal(10),
        balanceAfter: new Prisma.Decimal(16),
        referenceId: 'sup-1',
        referenceType: 'SUPPLIER_RECEIVE',
        notes: 'Penerimaan dari PT Segar Nusantara: Kiriman pagi',
        createdBy: managerActor.userId,
        createdAt: new Date('2026-11-17T08:00:00Z'),
        product: { id: baseUnitProd.id, name: baseUnitProd.name, productType: 'UNIT' },
      });

    const txMock = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sup-1',
          name: 'PT Segar Nusantara',
          isActive: true,
        }),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([baseWeightProd, baseUnitProd]),
        update: jest.fn().mockResolvedValue({}),
      },
      stockMovement: { create: movementCreate },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: managerActor.userId, fullName: 'Manajer Toko' }]),
      },
    } as unknown as PrismaClient;

    const service = new StockService(prisma, cache, cacheCfg);
    const result = await service.receiveStock(
      {
        supplierId: 'sup-1',
        items: [
          { productId: baseWeightProd.id, quantity: 20, unitCost: 19500 },
          { productId: baseUnitProd.id, quantity: 6, unitCost: 8500 },
        ],
        notes: 'Kiriman pagi',
      },
      managerActor,
    );

    expect(result.supplierName).toBe('PT Segar Nusantara');
    expect(result.totalItems).toBe(2);
    expect(result.movements[0]?.balanceBefore).toBe('5');
    expect(result.movements[0]?.balanceAfter).toBe('25');
    expect(result.movements[0]?.createdByName).toBe('Manajer Toko');

    expect(txMock.product.update).toHaveBeenNthCalledWith(1, {
      where: { id: baseWeightProd.id },
      data: {
        stockQty: { increment: new Prisma.Decimal(20) },
        costPerKg: new Prisma.Decimal(19500),
      },
    });
    expect(txMock.product.update).toHaveBeenNthCalledWith(2, {
      where: { id: baseUnitProd.id },
      data: {
        stockQty: { increment: new Prisma.Decimal(6) },
        costPerUnit: new Prisma.Decimal(8500),
      },
    });

    expect(await cache.getVersion(CACHE_NAMESPACES.PRODUCTS)).toBe(initialProdVer + 1);
    expect(await cache.getVersion(STOCK_CACHE_NAMESPACE)).toBe(initialStockVer + 1);
  });

  it('receiveStock mendukung Purchase Order (PARTIAL vs RECEIVED) dan menangani PO/supplier error', async () => {
    const cache = new InMemoryCacheStore();
    const txBase = (
      po: unknown,
      sup: unknown = { id: 'sup-1', name: 'Sup A', isActive: true },
    ) => ({
      purchaseOrder: {
        findUnique: jest.fn().mockResolvedValue(po),
        update: jest.fn().mockResolvedValue({}),
      },
      supplier: { findFirst: jest.fn().mockResolvedValue(sup) },
      product: {
        findMany: jest.fn().mockResolvedValue([baseWeightProd]),
        update: jest.fn().mockResolvedValue({}),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({
          id: 'mov-po',
          productId: baseWeightProd.id,
          movementType: 'PURCHASE_IN',
          quantity: new Prisma.Decimal(10),
          balanceBefore: new Prisma.Decimal(5),
          balanceAfter: new Prisma.Decimal(15),
          referenceId: 'po-1',
          referenceType: 'PURCHASE_ORDER',
          notes: 'Penerimaan PO PO-01',
          createdBy: managerActor.userId,
          createdAt: new Date(),
          product: { id: baseWeightProd.id, name: baseWeightProd.name, productType: 'WEIGHT' },
        }),
        findMany: jest
          .fn()
          .mockResolvedValue([{ productId: baseWeightProd.id, quantity: new Prisma.Decimal(10) }]),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    });

    const prismaMissingPo = {
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(txBase(null))),
    } as unknown as PrismaClient;
    await expect(
      new StockService(prismaMissingPo, cache, cacheCfg).receiveStock(
        { purchaseOrderId: 'po-404', items: [{ productId: baseWeightProd.id, quantity: 5 }] },
        managerActor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PURCHASE_ORDER_NOT_FOUND, statusCode: 404 });

    const prismaCancelledPo = {
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) =>
        cb(
          txBase({
            id: 'po-1',
            supplierId: 'sup-1',
            referenceNo: 'PO-1',
            status: 'CANCELLED',
            items: [],
          }),
        ),
      ),
    } as unknown as PrismaClient;
    await expect(
      new StockService(prismaCancelledPo, cache, cacheCfg).receiveStock(
        { purchaseOrderId: 'po-1', items: [{ productId: baseWeightProd.id, quantity: 5 }] },
        managerActor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });

    const prismaMismatchSup = {
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) =>
        cb(
          txBase({
            id: 'po-1',
            supplierId: 'sup-1',
            referenceNo: 'PO-1',
            status: 'PENDING',
            items: [],
          }),
        ),
      ),
    } as unknown as PrismaClient;
    await expect(
      new StockService(prismaMismatchSup, cache, cacheCfg).receiveStock(
        {
          purchaseOrderId: 'po-1',
          supplierId: 'sup-other',
          items: [{ productId: baseWeightProd.id, quantity: 5 }],
        },
        managerActor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });

    // Partial PO (PO butuh 20 kg, diterima 10 kg)
    const txPartial = txBase({
      id: 'po-1',
      supplierId: 'sup-1',
      referenceNo: 'PO-01',
      status: 'PENDING',
      items: [{ productId: baseWeightProd.id, quantity: new Prisma.Decimal(20) }],
    });
    const prismaPartial = {
      $transaction: jest.fn(async (cb: (t: typeof txPartial) => Promise<unknown>) => cb(txPartial)),
      user: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    await new StockService(prismaPartial, cache, cacheCfg).receiveStock(
      { purchaseOrderId: 'po-1', items: [{ productId: baseWeightProd.id, quantity: 10 }] },
      managerActor,
    );
    expect(txPartial.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 'po-1' },
      data: { status: 'PARTIAL' },
    });

    // Empty PO items marks RECEIVED immediately
    const txEmptyPo = txBase({
      id: 'po-2',
      supplierId: 'sup-1',
      referenceNo: 'PO-02',
      status: 'PENDING',
      items: [],
    });
    const prismaEmptyPo = {
      $transaction: jest.fn(async (cb: (t: typeof txEmptyPo) => Promise<unknown>) => cb(txEmptyPo)),
      user: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    await new StockService(prismaEmptyPo, cache, cacheCfg).receiveStock(
      { purchaseOrderId: 'po-2', items: [{ productId: baseWeightProd.id, quantity: 10 }] },
      managerActor,
    );
    expect(txEmptyPo.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'po-2' },
        data: expect.objectContaining({ status: 'RECEIVED' }),
      }),
    );
  });

  it('receiveStock menolak supplier hilang/nonaktif dan produk hilang/nonaktif', async () => {
    const cache = new InMemoryCacheStore();

    const makePrisma = (supplier: unknown, products: unknown[]) =>
      ({
        $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) =>
          cb({
            supplier: { findFirst: jest.fn().mockResolvedValue(supplier) },
            product: { findMany: jest.fn().mockResolvedValue(products) },
          }),
        ),
      }) as unknown as PrismaClient;

    await expect(
      new StockService(makePrisma(null, []), cache, cacheCfg).receiveStock(
        { supplierId: 'sup-404', items: [{ productId: baseWeightProd.id, quantity: 1 }] },
        managerActor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.SUPPLIER_NOT_FOUND, statusCode: 404 });

    await expect(
      new StockService(
        makePrisma({ id: 'sup-1', name: 'Sup Nonaktif', isActive: false }, []),
        cache,
        cacheCfg,
      ).receiveStock(
        { supplierId: 'sup-1', items: [{ productId: baseWeightProd.id, quantity: 1 }] },
        managerActor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });

    await expect(
      new StockService(makePrisma(null, []), cache, cacheCfg).receiveStock(
        { items: [{ productId: 'prod-404', quantity: 1 }] },
        managerActor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRODUCT_NOT_FOUND, statusCode: 404 });

    await expect(
      new StockService(
        makePrisma(null, [{ ...baseWeightProd, isActive: false }]),
        cache,
        cacheCfg,
      ).receiveStock({ items: [{ productId: baseWeightProd.id, quantity: 1 }] }, managerActor),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });
  });

  it('createOpname (immediate & draft) serta finalizeOpname berjalan atomik & valid', async () => {
    const cache = new InMemoryCacheStore();
    const createdOpname = {
      id: 'opn-1',
      referenceNo: 'OPN-20261117-100',
      notes: 'Opname malam',
      status: 'COMPLETED',
      conductedBy: managerActor.userId,
      completedAt: new Date('2026-11-17T14:00:00Z'),
      createdAt: new Date('2026-11-17T14:00:00Z'),
      updatedAt: new Date('2026-11-17T14:00:00Z'),
      conductor: { id: managerActor.userId, fullName: 'Manajer' },
      items: [
        {
          id: 'opni-1',
          opnameId: 'opn-1',
          productId: baseWeightProd.id,
          systemQty: new Prisma.Decimal(5),
          physicalQty: new Prisma.Decimal(4.5),
          difference: new Prisma.Decimal(-0.5),
          notes: 'Susut 500g',
          createdAt: new Date(),
          product: { id: baseWeightProd.id, name: baseWeightProd.name, productType: 'WEIGHT' },
        },
        {
          id: 'opni-2',
          opnameId: 'opn-1',
          productId: baseUnitProd.id,
          systemQty: new Prisma.Decimal(10),
          physicalQty: new Prisma.Decimal(10),
          difference: new Prisma.Decimal(0),
          notes: null,
          createdAt: new Date(),
          product: { id: baseUnitProd.id, name: baseUnitProd.name, productType: 'UNIT' },
        },
      ],
    };

    const txMock = {
      product: {
        findMany: jest.fn().mockResolvedValue([baseWeightProd, baseUnitProd]),
        update: jest.fn().mockResolvedValue({}),
      },
      stockOpname: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { referenceNo: 'OPN-20261117-99' },
            { referenceNo: 'OPN-20261117-09' },
          ]),
        create: jest.fn().mockResolvedValue(createdOpname),
      },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      $transaction: jest.fn(async (cb: (t: typeof txMock) => Promise<unknown>) => cb(txMock)),
    } as unknown as PrismaClient;

    const service = new StockService(prisma, cache, cacheCfg);
    const dto = await service.createOpname(
      {
        items: [
          { productId: baseWeightProd.id, physicalQty: 4.5, notes: 'Susut 500g' },
          { productId: baseUnitProd.id, physicalQty: 10 },
        ],
        notes: 'Opname malam',
        finalize: true,
      },
      managerActor,
    );

    expect(dto.status).toBe('COMPLETED');
    expect(dto.adjustedItemsCount).toBe(1);
    expect(txMock.stockOpname.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referenceNo: expect.stringMatching(/-\d{3}$/) }),
      }),
    );
    // Hanya item selisih != 0 yang mencatat StockMovement
    expect(txMock.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(await cache.getVersion(STOCK_CACHE_NAMESPACE)).toBe(1);

    // Mode DRAFT (finalize: false) tidak menyentuh stok maupun cache
    txMock.stockMovement.create.mockClear();
    txMock.product.update.mockClear();
    txMock.stockOpname.create.mockResolvedValueOnce({
      ...createdOpname,
      status: 'DRAFT',
      completedAt: null,
    });

    const draftDto = await service.createOpname(
      { items: [{ productId: baseWeightProd.id, physicalQty: 4.5 }], finalize: false },
      managerActor,
    );
    expect(draftDto.status).toBe('DRAFT');
    expect(txMock.product.update).not.toHaveBeenCalled();
    expect(txMock.stockMovement.create).not.toHaveBeenCalled();
    expect(await cache.getVersion(STOCK_CACHE_NAMESPACE)).toBe(1);
  });

  it('finalizeOpname menghitung ulang selisih stok live & menolak not-found / sudah selesai', async () => {
    const cache = new InMemoryCacheStore();
    const draftOpname = {
      id: 'opn-draft',
      referenceNo: 'OPN-20261117-01',
      notes: 'Opname pagi',
      status: 'DRAFT',
      conductedBy: managerActor.userId,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      conductor: { id: managerActor.userId, fullName: 'Manajer' },
      items: [
        {
          id: 'item-1',
          opnameId: 'opn-draft',
          productId: baseWeightProd.id,
          systemQty: new Prisma.Decimal(5),
          physicalQty: new Prisma.Decimal(4),
          difference: new Prisma.Decimal(-1),
          notes: null,
          createdAt: new Date(),
          product: { id: baseWeightProd.id, name: baseWeightProd.name, productType: 'WEIGHT' },
        },
      ],
    };

    const txFinalize = {
      stockOpname: {
        findUnique: jest.fn().mockResolvedValue(draftOpname),
        update: jest
          .fn()
          .mockResolvedValue({ ...draftOpname, status: 'COMPLETED', completedAt: new Date() }),
      },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ ...baseWeightProd, stockQty: new Prisma.Decimal(6) }]),
        update: jest.fn().mockResolvedValue({}),
      },
      stockOpnameItem: { update: jest.fn().mockResolvedValue({}) },
      stockMovement: { create: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const prismaOk = {
      $transaction: jest.fn(async (cb: (t: typeof txFinalize) => Promise<unknown>) =>
        cb(txFinalize),
      ),
    } as unknown as PrismaClient;

    const finalized = await new StockService(prismaOk, cache, cacheCfg).finalizeOpname(
      'opn-draft',
      managerActor,
    );
    expect(finalized.status).toBe('COMPLETED');
    expect(txFinalize.stockOpnameItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: {
        systemQty: new Prisma.Decimal(6),
        difference: new Prisma.Decimal(-2),
      },
    });
    expect(txFinalize.stockMovement.create).toHaveBeenCalledTimes(1);

    const prismaMissing = {
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) =>
        cb({ stockOpname: { findUnique: jest.fn().mockResolvedValue(null) } }),
      ),
    } as unknown as PrismaClient;
    await expect(
      new StockService(prismaMissing, cache, cacheCfg).finalizeOpname('opn-404', managerActor),
    ).rejects.toMatchObject({ code: ERROR_CODES.STOCK_OPNAME_NOT_FOUND, statusCode: 404 });

    const prismaDone = {
      $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) =>
        cb({
          stockOpname: {
            findUnique: jest.fn().mockResolvedValue({ ...draftOpname, status: 'COMPLETED' }),
          },
        }),
      ),
    } as unknown as PrismaClient;
    await expect(
      new StockService(prismaDone, cache, cacheCfg).finalizeOpname('opn-done', managerActor),
    ).rejects.toMatchObject({ code: ERROR_CODES.STOCK_OPNAME_ALREADY_COMPLETED, statusCode: 400 });
  });

  it('listOpnames, getOpnameById, listMovements, & listLowStockAlerts mengelola filter dan cache-aside', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      stockOpname: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      stockMovement: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'mov-1',
            productId: baseWeightProd.id,
            movementType: 'SALE_OUT',
            quantity: new Prisma.Decimal(1.5),
            balanceBefore: new Prisma.Decimal(5),
            balanceAfter: new Prisma.Decimal(3.5),
            referenceId: 'tx-1',
            referenceType: 'TRANSACTION',
            notes: 'Penjualan kasir',
            createdBy: 'u-deleted',
            createdAt: new Date('2026-11-17T09:00:00Z'),
            product: { id: baseWeightProd.id, name: baseWeightProd.name, productType: 'WEIGHT' },
          },
        ]),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: baseWeightProd.id }])
        .mockResolvedValueOnce([]),
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: baseWeightProd.id,
            name: baseWeightProd.name,
            categoryId: 'cat-1',
            category: { name: 'Buah Lokal' },
            productType: 'WEIGHT',
            stockQty: new Prisma.Decimal(3),
            minStockAlert: new Prisma.Decimal(5),
            isActive: true,
          },
        ]),
      },
    } as unknown as PrismaClient;

    const service = new StockService(prisma, cache, cacheCfg);

    const opList = await service.listOpnames({
      page: 1,
      limit: 20,
      status: 'COMPLETED',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      search: 'OPN-',
    });
    expect(opList.meta.total).toBe(0);

    await expect(service.getOpnameById('opn-404')).rejects.toMatchObject({
      code: ERROR_CODES.STOCK_OPNAME_NOT_FOUND,
      statusCode: 404,
    });

    const movList = await service.listMovements({
      page: 1,
      limit: 20,
      productId: baseWeightProd.id,
      type: 'SALE_OUT',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      search: 'Penjualan',
    });
    expect(movList.items[0]?.createdByName).toBeNull();

    // First low-alert hit loads DB & caches result
    const alerts1 = await service.listLowStockAlerts({ page: 1, limit: 20 });
    expect(alerts1.items[0]?.deficit).toBe('2');

    // Second hit served directly from cache (product.findMany tidak dipanggil ulang)
    const alerts2 = await service.listLowStockAlerts({ page: 1, limit: 20 });
    expect(alerts2.items).toHaveLength(1);
    expect(prisma.product.findMany).toHaveBeenCalledTimes(1);

    // Filter baru menghasilkan empty result saat $queryRaw kosong
    const alertsEmpty = await service.listLowStockAlerts({
      page: 1,
      limit: 20,
      categoryId: 'cat-1',
      search: 'Naga',
    });
    expect(alertsEmpty.items).toEqual([]);
  });

  it('StockController menolak request tanpa req.authUser dengan 401 UNAUTHORIZED', async () => {
    const controller = new StockController({} as unknown as StockService);
    const req = { body: {}, params: {}, headers: {}, socket: {} } as unknown as Request;
    const res = {} as unknown as Response;

    await expect(controller.receive(req, res)).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
    });
  });
});
