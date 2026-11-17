import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { CACHE_NAMESPACES, InMemoryCacheStore } from '../../src/lib/cache';
import { PurchaseOrderController } from '../../src/modules/suppliers/purchase-order.controller';
import { PurchaseOrderService } from '../../src/modules/suppliers/purchase-order.service';

describe('M05-002 Unit: PurchaseOrderService & PurchaseOrderController', () => {
  const actor = {
    userId: 'u-manager-1',
    ipAddress: '127.0.0.1',
    userAgent: 'po-test',
  };

  const basePo = {
    id: 'po-1',
    supplierId: 'sup-1',
    referenceNo: 'PO-20261117-01',
    totalAmount: new Prisma.Decimal(500000),
    paidAmount: new Prisma.Decimal(100000),
    status: 'PENDING' as const,
    notes: 'Order buah pagi',
    deliveredAt: null,
    createdBy: actor.userId,
    createdAt: new Date('2026-11-17T08:00:00Z'),
    updatedAt: new Date('2026-11-17T08:00:00Z'),
    supplier: { id: 'sup-1', name: 'CV Agro Makmur' },
    items: [
      {
        id: 'poi-1',
        purchaseOrderId: 'po-1',
        productId: 'prod-1',
        quantity: new Prisma.Decimal(25),
        unitCost: new Prisma.Decimal(20000),
        totalCost: new Prisma.Decimal(500000),
        createdAt: new Date('2026-11-17T08:00:00Z'),
        product: { id: 'prod-1', name: 'Mangga Harum Manis', productType: 'WEIGHT' as const },
      },
    ],
  };

  it('create menghitung total biaya atomik, menghasilkan PO-YYYYMMDD-NN, log audit & bust cache supplier', async () => {
    const cache = new InMemoryCacheStore();
    const txMock = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sup-1', name: 'CV Agro', isActive: true }),
      },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'prod-1', name: 'Mangga', isActive: true, deletedAt: null }]),
      },
      purchaseOrder: {
        findMany: jest.fn().mockResolvedValue([{ referenceNo: 'PO-20261117-09' }]),
        create: jest.fn().mockResolvedValue({ ...basePo, referenceNo: 'PO-20261117-10' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const prisma = {
      $transaction: jest.fn(async (cb: (t: typeof txMock) => Promise<unknown>) => cb(txMock)),
      user: { findMany: jest.fn().mockResolvedValue([{ id: actor.userId, fullName: 'Manajer' }]) },
    } as unknown as PrismaClient;

    const service = new PurchaseOrderService(prisma, cache);
    const created = await service.create(
      {
        supplierId: 'sup-1',
        items: [{ productId: 'prod-1', quantity: 25, unitCost: 20000 }],
        paidAmount: 100000,
        notes: 'Order buah pagi',
      },
      actor,
    );

    expect(created.referenceNo).toBe('PO-20261117-10');
    expect(created.remainingDebt).toBe('400000.00');
    expect(created.createdByName).toBe('Manajer');
    expect(await cache.getVersion(CACHE_NAMESPACES.SUPPLIERS)).toBe(1);
  });

  it('create menolak supplier hilang/nonaktif, produk hilang/nonaktif, dan DP > total', async () => {
    const cache = new InMemoryCacheStore();
    const runWithTx = (txMock: unknown) =>
      new PurchaseOrderService(
        {
          $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) => cb(txMock)),
        } as unknown as PrismaClient,
        cache,
      ).create(
        {
          supplierId: 'sup-1',
          items: [{ productId: 'prod-1', quantity: 2, unitCost: 10000 }],
          paidAmount: 50000,
        },
        actor,
      );

    await expect(
      runWithTx({ supplier: { findFirst: jest.fn().mockResolvedValue(null) } }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SUPPLIER_NOT_FOUND, statusCode: 404 });

    await expect(
      runWithTx({
        supplier: {
          findFirst: jest.fn().mockResolvedValue({ id: 'sup-1', name: 'X', isActive: false }),
        },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });

    await expect(
      runWithTx({
        supplier: {
          findFirst: jest.fn().mockResolvedValue({ id: 'sup-1', name: 'X', isActive: true }),
        },
        product: { findMany: jest.fn().mockResolvedValue([]) },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRODUCT_NOT_FOUND, statusCode: 404 });

    await expect(
      runWithTx({
        supplier: {
          findFirst: jest.fn().mockResolvedValue({ id: 'sup-1', name: 'X', isActive: true }),
        },
        product: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'prod-1', name: 'Mangga', isActive: false, deletedAt: null },
            ]),
        },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });

    await expect(
      runWithTx({
        supplier: {
          findFirst: jest.fn().mockResolvedValue({ id: 'sup-1', name: 'X', isActive: true }),
        },
        product: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'prod-1', name: 'Mangga', isActive: true, deletedAt: null }]),
        },
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });
  });

  it('list, getById, recordPayment & cancel menangani filter, overpay, CANCELLED, & not-found', async () => {
    const cache = new InMemoryCacheStore();
    const prismaQuery = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'po-1' }]),
      purchaseOrder: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([basePo]),
        findUnique: jest.fn().mockResolvedValueOnce(basePo).mockResolvedValueOnce(null),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: actor.userId, fullName: 'Manajer' }]) },
    } as unknown as PrismaClient;

    const svc = new PurchaseOrderService(prismaQuery, cache);
    const listRes = await svc.list({
      page: 1,
      limit: 20,
      supplierId: 'sup-1',
      status: 'PENDING',
      unpaidOnly: true,
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      search: 'PO-',
    });
    expect(listRes.items).toHaveLength(1);

    const detail = await svc.getById('po-1');
    expect(detail.id).toBe('po-1');

    await expect(svc.getById('po-404')).rejects.toMatchObject({
      code: ERROR_CODES.PURCHASE_ORDER_NOT_FOUND,
      statusCode: 404,
    });

    // recordPayment: not found, cancelled, overpay, success
    const makePaySvc = (po: unknown) =>
      new PurchaseOrderService(
        {
          $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) =>
            cb({
              purchaseOrder: {
                findUnique: jest.fn().mockResolvedValue(po),
                update: jest.fn().mockResolvedValue({
                  ...basePo,
                  paidAmount: new Prisma.Decimal(500000),
                }),
              },
              auditLog: { create: jest.fn().mockResolvedValue({}) },
            }),
          ),
          user: { findMany: jest.fn().mockResolvedValue([]) },
        } as unknown as PrismaClient,
        cache,
      );

    await expect(
      makePaySvc(null).recordPayment('po-404', { amount: 10000 }, actor),
    ).rejects.toMatchObject({
      code: ERROR_CODES.PURCHASE_ORDER_NOT_FOUND,
      statusCode: 404,
    });
    await expect(
      makePaySvc({ ...basePo, status: 'CANCELLED' }).recordPayment(
        'po-1',
        { amount: 10000 },
        actor,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });
    await expect(
      makePaySvc(basePo).recordPayment('po-1', { amount: 450000 }, actor),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });

    const paid = await makePaySvc(basePo).recordPayment('po-1', { amount: 400000 }, actor);
    expect(paid.remainingDebt).toBe('0.00');

    // cancel: not found, non-PENDING, success
    await expect(makePaySvc(null).cancel('po-404', actor)).rejects.toMatchObject({
      code: ERROR_CODES.PURCHASE_ORDER_NOT_FOUND,
      statusCode: 404,
    });
    await expect(
      makePaySvc({ ...basePo, status: 'RECEIVED' }).cancel('po-1', actor),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: 400,
    });
  });

  it('PurchaseOrderController menolak request tanpa req.authUser dengan 401 UNAUTHORIZED', async () => {
    const controller = new PurchaseOrderController({} as unknown as PurchaseOrderService);
    const req = { body: {}, params: {}, headers: {}, socket: {} } as unknown as Request;
    const res = {} as unknown as Response;

    await expect(controller.create(req, res)).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
    });
  });
});
