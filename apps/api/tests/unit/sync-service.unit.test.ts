import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import { SyncService } from '../../src/modules/sync/sync.service';
import type { TransactionService } from '../../src/modules/transactions/transaction.service';
import { AppError } from '../../src/utils/app-error';

describe('SyncService unit tests (M11-002)', () => {
  const actor = {
    userId: 'user-cashier-1',
    role: 'CASHIER' as const,
    ipAddress: '127.0.0.1',
    userAgent: 'JestUnit',
  };

  function createMockPrisma() {
    return {
      transaction: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaClient & {
      transaction: { updateMany: jest.Mock };
      category: { findMany: jest.Mock };
      product: { findMany: jest.Mock };
    };
  }

  it('memisahkan operasi sukses, konflik stok/bisnis, dan galat tak terduga per item batch', async () => {
    const prisma = createMockPrisma();
    const mockTxService = {
      create: jest
        .fn()
        .mockResolvedValueOnce({ id: 'srv-1', transactionNo: 'TRX-20261119-0001' })
        .mockRejectedValueOnce(
          new AppError(ERROR_CODES.INSUFFICIENT_STOCK, 'Stok Mangga tidak mencukupi', 422),
        )
        .mockRejectedValueOnce(new Error('Koneksi DB putus sementara')),
    } as unknown as TransactionService;

    const service = new SyncService(prisma, mockTxService);
    const baseOpData = {
      paymentMethod: 'CASH' as const,
      amountPaid: 50000,
      items: [
        {
          productId: '11111111-1111-4111-8111-111111111111',
          quantity: 1,
          unitPrice: 25000,
        },
      ],
    };

    const result = await service.processBatch(
      {
        deviceId: 'pos-01',
        operations: [
          {
            type: 'TRANSACTION',
            clientId: 'client-ok',
            timestamp: '2026-11-19T08:00:00.000Z',
            data: baseOpData,
          },
          {
            type: 'TRANSACTION',
            clientId: 'client-conflict',
            timestamp: '2026-11-19T08:01:00.000Z',
            data: baseOpData,
          },
          {
            type: 'TRANSACTION',
            clientId: 'client-err',
            timestamp: '2026-11-19T08:02:00.000Z',
            data: baseOpData,
          },
        ],
      },
      actor,
    );

    expect(result.processed).toBe(3);
    expect(result.success).toEqual([
      { clientId: 'client-ok', serverId: 'srv-1', transactionNo: 'TRX-20261119-0001' },
    ]);
    expect(result.conflicts).toEqual([
      {
        clientId: 'client-conflict',
        reason: 'Stok Mangga tidak mencukupi',
        code: ERROR_CODES.INSUFFICIENT_STOCK,
      },
    ]);
    expect(result.errors).toEqual([
      {
        clientId: 'client-err',
        message: 'Koneksi DB putus sementara',
        code: ERROR_CODES.INTERNAL_ERROR,
      },
    ]);
    expect(prisma.transaction.updateMany).toHaveBeenCalledTimes(1);
  });

  it('menyaring HPP pada pullUpdates untuk CASHIER dan menampilkannya bagi MANAGER', async () => {
    const prisma = createMockPrisma();
    const now = new Date('2026-11-19T09:00:00.000Z');
    prisma.category.findMany.mockResolvedValue([
      {
        id: 'cat-1',
        name: 'Buah Lokal',
        description: null,
        sortOrder: 1,
        isActive: true,
        _count: { products: 1 },
        createdAt: now,
        updatedAt: now,
      },
    ]);
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'prod-1',
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: 'Buah Lokal' },
        name: 'Mangga Harum Manis',
        description: null,
        productType: 'WEIGHT',
        pricePerKg: new Prisma.Decimal('25000.00'),
        pricePerUnit: null,
        costPerKg: new Prisma.Decimal('18000.00'),
        costPerUnit: null,
        stockQty: new Prisma.Decimal('10.000'),
        minStockAlert: new Prisma.Decimal('2.000'),
        imageUrl: null,
        isActive: true,
        barcodes: [{ id: 'bc-1', barcode: '899100001', isPrimary: true }],
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const service = new SyncService(prisma, {} as TransactionService);

    const cashierPull = await service.pullUpdates(
      { since: '2026-11-19T00:00:00.000Z', types: ['products', 'categories'] },
      'CASHIER',
    );
    expect(cashierPull.products[0]?.costPerKg).toBeNull();
    expect(cashierPull.categories).toHaveLength(1);

    const managerPull = await service.pullUpdates({ types: ['products'] }, 'MANAGER');
    expect(managerPull.products[0]?.costPerKg).toBe('18000.00');
    expect(managerPull.categories).toHaveLength(0);
  });
});
