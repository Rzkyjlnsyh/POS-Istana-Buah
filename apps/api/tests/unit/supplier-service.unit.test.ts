import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { InMemoryCacheStore } from '../../src/lib/cache';
import { SupplierController } from '../../src/modules/suppliers/supplier.controller';
import {
  SUPPLIER_CACHE_NAMESPACE,
  SupplierService,
} from '../../src/modules/suppliers/supplier.service';

describe('M05-001 Unit: SupplierService & SupplierController', () => {
  const cacheCfg = {
    keyPrefix: 'test',
    categoryTtlSeconds: 60,
    productTtlSeconds: 120,
  };

  const actor = {
    userId: 'u-manager-1',
    ipAddress: '127.0.0.1',
    userAgent: 'supplier-test',
  };

  const baseSupplier = {
    id: 'sup-1',
    name: 'CV Agro Makmur',
    contactPerson: 'Budi Santoso',
    phoneNumber: '081234567890',
    address: 'Jl. Bandungan No. 12',
    notes: 'Kiriman pagi',
    isActive: true,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    deletedAt: null,
    purchaseOrders: [
      {
        totalAmount: new Prisma.Decimal(1500000),
        paidAmount: new Prisma.Decimal(500000),
      },
      {
        totalAmount: new Prisma.Decimal(500000),
        paidAmount: new Prisma.Decimal(500000),
      },
    ],
  };

  it('list mengembalikan daftar supplier dengan total pembelian, sisa hutang & cache-aside', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      $transaction: jest.fn().mockResolvedValue([1, [baseSupplier]]),
      supplier: { count: jest.fn(), findMany: jest.fn() },
    } as unknown as PrismaClient;

    const service = new SupplierService(prisma, cache, cacheCfg);
    const res1 = await service.list({ page: 1, limit: 20, search: 'Agro', isActive: true });
    expect(res1.meta.total).toBe(1);
    expect(res1.items[0]?.purchaseOrderCount).toBe(2);
    expect(res1.items[0]?.totalPurchaseAmount).toBe('2000000.00');
    expect(res1.items[0]?.outstandingDebt).toBe('1000000.00');

    // Hit kedua memakai cache
    const res2 = await service.list({ page: 1, limit: 20, search: 'Agro', isActive: true });
    expect(res2.items).toHaveLength(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Cache korup ditangani fail-open
    await cache.set('suppliers:v0:p1:l20:a-:s', '{corrupt-json', 60);
    await service.list({ page: 1, limit: 20, search: undefined, isActive: undefined });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('getById mengembalikan detail supplier dengan PO terbaru atau melempar 404 jika hilang', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      supplier: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            ...baseSupplier,
            purchaseOrders: [
              {
                id: 'po-1',
                referenceNo: 'PO-20261117-01',
                status: 'PENDING',
                totalAmount: new Prisma.Decimal(1000000),
                paidAmount: new Prisma.Decimal(300000),
                deliveredAt: null,
                createdAt: new Date('2026-11-17T01:00:00Z'),
              },
              {
                id: 'po-2',
                referenceNo: 'PO-20261116-01',
                status: 'CANCELLED',
                totalAmount: new Prisma.Decimal(400000),
                paidAmount: new Prisma.Decimal(0),
                deliveredAt: null,
                createdAt: new Date('2026-11-16T01:00:00Z'),
              },
            ],
          })
          .mockResolvedValueOnce(null),
      },
    } as unknown as PrismaClient;

    const service = new SupplierService(prisma, cache, cacheCfg);
    const detail = await service.getById('sup-1');
    expect(detail.outstandingDebt).toBe('700000.00');
    expect(detail.recentPurchaseOrders).toHaveLength(2);
    expect(detail.recentPurchaseOrders[1]?.remainingDebt).toBe('0.00');

    await expect(service.getById('sup-404')).rejects.toMatchObject({
      code: ERROR_CODES.SUPPLIER_NOT_FOUND,
      statusCode: 404,
    });
  });

  it('create mencatat supplier + audit log + bust cache, dan menolak duplikat 409', async () => {
    const cache = new InMemoryCacheStore();
    const txOk = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ ...baseSupplier, purchaseOrders: [] }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const prismaOk = {
      $transaction: jest.fn(async (cb: (t: typeof txOk) => Promise<unknown>) => cb(txOk)),
    } as unknown as PrismaClient;

    const created = await new SupplierService(prismaOk, cache, cacheCfg).create(
      { name: 'CV Agro Makmur', contactPerson: 'Budi' },
      actor,
    );
    expect(created.name).toBe('CV Agro Makmur');
    expect(await cache.getVersion(SUPPLIER_CACHE_NAMESPACE)).toBe(1);

    const txDup = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'sup-1' }) },
    };
    const prismaDup = {
      $transaction: jest.fn(async (cb: (t: typeof txDup) => Promise<unknown>) => cb(txDup)),
    } as unknown as PrismaClient;

    await expect(
      new SupplierService(prismaDup, cache, cacheCfg).create({ name: 'CV Agro Makmur' }, actor),
    ).rejects.toMatchObject({ code: ERROR_CODES.DUPLICATE_SUPPLIER, statusCode: 409 });
  });

  it('update & remove menangani not-found (404), duplicate (409), in-use (409), dan soft delete', async () => {
    const cache = new InMemoryCacheStore();

    // Update valid
    const txUpd = {
      supplier: {
        findFirst: jest.fn().mockResolvedValueOnce(baseSupplier).mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({ ...baseSupplier, name: 'CV Agro Baru' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const updated = await new SupplierService(
      {
        $transaction: jest.fn(async (cb: (t: typeof txUpd) => Promise<unknown>) => cb(txUpd)),
      } as unknown as PrismaClient,
      cache,
      cacheCfg,
    ).update('sup-1', { name: 'CV Agro Baru' }, actor);
    expect(updated.name).toBe('CV Agro Baru');

    // Update duplicate name
    const txUpdDup = {
      supplier: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(baseSupplier)
          .mockResolvedValueOnce({ id: 'sup-2' }),
      },
    };
    await expect(
      new SupplierService(
        {
          $transaction: jest.fn(async (cb: (t: typeof txUpdDup) => Promise<unknown>) =>
            cb(txUpdDup),
          ),
        } as unknown as PrismaClient,
        cache,
        cacheCfg,
      ).update('sup-1', { name: 'PT Lain' }, actor),
    ).rejects.toMatchObject({ code: ERROR_CODES.DUPLICATE_SUPPLIER, statusCode: 409 });

    // Remove while PO active -> 409 SUPPLIER_IN_USE
    const txInUse = {
      supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'sup-1', name: 'CV Agro Makmur' }) },
      purchaseOrder: { count: jest.fn().mockResolvedValue(2) },
    };
    await expect(
      new SupplierService(
        {
          $transaction: jest.fn(async (cb: (t: typeof txInUse) => Promise<unknown>) => cb(txInUse)),
        } as unknown as PrismaClient,
        cache,
        cacheCfg,
      ).remove('sup-1', actor),
    ).rejects.toMatchObject({ code: ERROR_CODES.SUPPLIER_IN_USE, statusCode: 409 });

    // Remove clean
    const txRemove = {
      supplier: {
        findFirst: jest.fn().mockResolvedValue({ id: 'sup-1', name: 'CV Agro Makmur' }),
        update: jest.fn().mockResolvedValue({}),
      },
      purchaseOrder: { count: jest.fn().mockResolvedValue(0) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    await expect(
      new SupplierService(
        {
          $transaction: jest.fn(async (cb: (t: typeof txRemove) => Promise<unknown>) =>
            cb(txRemove),
          ),
        } as unknown as PrismaClient,
        cache,
        cacheCfg,
      ).remove('sup-1', actor),
    ).resolves.toBeUndefined();
    expect(txRemove.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isActive: false }),
      }),
    );
  });

  it('SupplierController menolak request tanpa req.authUser dengan 401 UNAUTHORIZED', async () => {
    const controller = new SupplierController({} as unknown as SupplierService);
    const req = { body: {}, params: {}, headers: {}, socket: {} } as unknown as Request;
    const res = {} as unknown as Response;

    await expect(controller.create(req, res)).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
    });
  });
});
