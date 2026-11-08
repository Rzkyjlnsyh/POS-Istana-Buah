import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import { InMemoryCacheStore } from '../../src/lib/cache';
import { TransactionService } from '../../src/modules/transactions/transaction.service';

describe('M03-001 Unit: TransactionService', () => {
  const cashierActor = {
    userId: 'u-cashier-1',
    role: 'CASHIER' as const,
    fullName: 'Kasir Satu',
    ipAddress: '127.0.0.1',
    userAgent: 'pos-agent',
  };

  const managerActor = {
    userId: 'u-manager-1',
    role: 'MANAGER' as const,
    fullName: 'Manajer Toko',
    ipAddress: '127.0.0.1',
    userAgent: 'admin-agent',
  };

  const mockProductWeight = {
    id: 'prod-w-1',
    name: 'Mangga Harum Manis',
    productType: 'WEIGHT' as const,
    pricePerKg: new Prisma.Decimal(25000),
    pricePerUnit: null,
    costPerKg: new Prisma.Decimal(18000),
    costPerUnit: null,
    stockQty: new Prisma.Decimal(10.0), // 10 kg
    isActive: true,
    deletedAt: null,
  };

  it('TC-POS-003: Idempotency deduplication via clientId mengembalikan transaksi eksis tanpa duplicate', async () => {
    const cache = new InMemoryCacheStore();
    const existingTx = {
      id: 'tx-existing-1',
      transactionNo: 'TRX-20261108-0001',
      shiftId: null,
      cashierId: cashierActor.userId,
      status: 'COMPLETED' as const,
      subtotal: new Prisma.Decimal(37500),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(37500),
      paymentMethod: 'CASH' as const,
      amountPaid: new Prisma.Decimal(50000),
      changeAmount: new Prisma.Decimal(12500),
      notes: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      clientId: 'client-offline-uuid-1',
      syncedAt: null,
      transactedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      cashier: { id: cashierActor.userId, fullName: cashierActor.fullName },
      items: [],
    };

    const prisma = {
      transaction: {
        findUnique: jest.fn().mockResolvedValue(existingTx),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaClient;

    const service = new TransactionService(prisma, cache);
    const result = await service.create(
      {
        clientId: 'client-offline-uuid-1',
        items: [{ productId: 'prod-w-1', quantity: 1.5, unitPrice: 25000 }],
        paymentMethod: 'CASH',
        amountPaid: 50000,
      },
      cashierActor,
    );

    expect(result.id).toBe('tx-existing-1');
    expect(result.transactionNo).toBe('TRX-20261108-0001');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('TC-POS-002: Melempar 422 INSUFFICIENT_STOCK jika stok produk kurang dari kuantitas belanja', async () => {
    const cache = new InMemoryCacheStore();
    const txMock = {
      transaction: { findFirst: jest.fn().mockResolvedValue(null) },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...mockProductWeight,
            stockQty: new Prisma.Decimal(1.0), // hanya tersisa 1 kg
          },
        ]),
      },
    };

    const prisma = {
      transaction: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(txMock)),
    } as unknown as PrismaClient;

    const service = new TransactionService(prisma, cache);

    await expect(
      service.create(
        {
          items: [{ productId: 'prod-w-1', quantity: 2.0, unitPrice: 25000 }], // minta 2 kg
          paymentMethod: 'CASH',
          amountPaid: 50000,
        },
        cashierActor,
      ),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: ERROR_CODES.INSUFFICIENT_STOCK,
    });
  });

  it('melempar 404 PRODUCT_NOT_FOUND jika produk tidak ditemukan atau terhapus', async () => {
    const cache = new InMemoryCacheStore();
    const txMock = {
      transaction: { findFirst: jest.fn().mockResolvedValue(null) },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const prisma = {
      transaction: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(txMock)),
    } as unknown as PrismaClient;

    const service = new TransactionService(prisma, cache);

    await expect(
      service.create(
        {
          items: [{ productId: 'prod-unknown', quantity: 1, unitPrice: 10000 }],
          paymentMethod: 'CASH',
          amountPaid: 10000,
        },
        cashierActor,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.PRODUCT_NOT_FOUND,
    });
  });

  it('melempar 400 BAD_REQUEST jika produk berstatus non-aktif', async () => {
    const cache = new InMemoryCacheStore();
    const txMock = {
      transaction: { findFirst: jest.fn().mockResolvedValue(null) },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...mockProductWeight,
            isActive: false,
          },
        ]),
      },
    };

    const prisma = {
      transaction: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(txMock)),
    } as unknown as PrismaClient;

    const service = new TransactionService(prisma, cache);

    await expect(
      service.create(
        {
          items: [{ productId: 'prod-w-1', quantity: 1, unitPrice: 25000 }],
          paymentMethod: 'CASH',
          amountPaid: 25000,
        },
        cashierActor,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  });

  it('TC-POS-001: Berhasil memproses transaksi produk timbang WEIGHT, hitung kembalian dan kurangi stok', async () => {
    const cache = new InMemoryCacheStore();
    const createdTxData = {
      id: 'tx-new-1',
      transactionNo: 'TRX-20261108-0001',
      shiftId: null,
      cashierId: cashierActor.userId,
      status: 'COMPLETED' as const,
      subtotal: new Prisma.Decimal(37500),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(37500),
      paymentMethod: 'CASH' as const,
      amountPaid: new Prisma.Decimal(50000),
      changeAmount: new Prisma.Decimal(12500),
      notes: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      clientId: null,
      syncedAt: null,
      transactedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      cashier: { id: cashierActor.userId, fullName: cashierActor.fullName },
      items: [
        {
          id: 'item-1',
          transactionId: 'tx-new-1',
          productId: 'prod-w-1',
          productName: 'Mangga Harum Manis',
          productType: 'WEIGHT' as const,
          quantity: new Prisma.Decimal(1.5),
          unitPrice: new Prisma.Decimal(25000),
          unitCost: new Prisma.Decimal(18000),
          discountAmount: new Prisma.Decimal(0),
          lineTotal: new Prisma.Decimal(37500),
          createdAt: new Date(),
        },
      ],
    };

    const txMock = {
      transaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(createdTxData),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([mockProductWeight]),
        update: jest.fn().mockResolvedValue({
          ...mockProductWeight,
          stockQty: new Prisma.Decimal(8.5),
        }),
      },
      stockMovement: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    };

    const prisma = {
      transaction: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(txMock)),
    } as unknown as PrismaClient;

    const service = new TransactionService(prisma, cache);
    const result = await service.create(
      {
        items: [{ productId: 'prod-w-1', quantity: 1.5, unitPrice: 25000 }],
        paymentMethod: 'CASH',
        amountPaid: 50000,
      },
      cashierActor,
    );

    expect(result.id).toBe('tx-new-1');
    expect(result.transactionNo).toBe('TRX-20261108-0001');
    expect(result.totalAmount).toBe('37500');
    expect(result.changeAmount).toBe('12500');
    expect(txMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-w-1' },
      data: { stockQty: { decrement: new Prisma.Decimal(1.5) } },
    });
    expect(txMock.stockMovement.create).toHaveBeenCalled();
    expect(result.receiptData).toBeDefined();
    expect(result.receiptData?.storeName).toBe('Istana Buah Semarang');
  });

  it('void membatalkan transaksi, mengembalikan stok produk, dan mencatat RETURN_IN', async () => {
    const cache = new InMemoryCacheStore();
    const completedTx = {
      id: 'tx-to-void',
      transactionNo: 'TRX-20261108-0005',
      status: 'COMPLETED' as const,
      cashier: { id: cashierActor.userId, fullName: cashierActor.fullName },
      items: [
        {
          id: 'item-void-1',
          productId: 'prod-w-1',
          productName: 'Mangga Harum Manis',
          productType: 'WEIGHT' as const,
          quantity: new Prisma.Decimal(2.0),
          unitPrice: new Prisma.Decimal(25000),
          unitCost: new Prisma.Decimal(18000),
          discountAmount: new Prisma.Decimal(0),
          lineTotal: new Prisma.Decimal(50000),
          createdAt: new Date(),
        },
      ],
      subtotal: new Prisma.Decimal(50000),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(50000),
      paymentMethod: 'CASH' as const,
      amountPaid: new Prisma.Decimal(50000),
      changeAmount: new Prisma.Decimal(0),
      notes: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      clientId: null,
      syncedAt: null,
      transactedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const txMock = {
      transaction: {
        update: jest.fn().mockResolvedValue({
          ...completedTx,
          status: 'VOIDED',
          voidedBy: managerActor.userId,
          voidReason: 'Salah input berat',
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue({ stockQty: new Prisma.Decimal(8.0) }),
        update: jest.fn().mockResolvedValue({ stockQty: new Prisma.Decimal(10.0) }),
      },
      stockMovement: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const prisma = {
      transaction: { findUnique: jest.fn().mockResolvedValue(completedTx) },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(txMock)),
    } as unknown as PrismaClient;

    const service = new TransactionService(prisma, cache);
    const result = await service.void('tx-to-void', { reason: 'Salah input berat' }, managerActor);

    expect(result.status).toBe('VOIDED');
    expect(result.voidReason).toBe('Salah input berat');
    expect(txMock.product.update).toHaveBeenCalledWith({
      where: { id: 'prod-w-1' },
      data: { stockQty: { increment: new Prisma.Decimal(2.0) } },
    });
    expect(txMock.stockMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          movementType: 'RETURN_IN',
        }),
      }),
    );
  });

  it('void menolak pembatalan jika transaksi sudah berstatus VOIDED', async () => {
    const cache = new InMemoryCacheStore();
    const alreadyVoided = {
      id: 'tx-already-voided',
      status: 'VOIDED' as const,
      cashier: { id: cashierActor.userId, fullName: cashierActor.fullName },
      items: [],
    };

    const prisma = {
      transaction: { findUnique: jest.fn().mockResolvedValue(alreadyVoided) },
    } as unknown as PrismaClient;

    const service = new TransactionService(prisma, cache);

    await expect(
      service.void('tx-already-voided', { reason: 'Ulang void' }, managerActor),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: ERROR_CODES.TRANSACTION_ALREADY_VOIDED,
    });
  });

  it('list mengembalikan daftar transaksi terfilter dan paginasi', async () => {
    const cache = new InMemoryCacheStore();
    const sampleTx = {
      id: 'tx-1',
      transactionNo: 'TRX-20261108-0001',
      shiftId: null,
      cashierId: cashierActor.userId,
      status: 'COMPLETED' as const,
      subtotal: new Prisma.Decimal(25000),
      discountAmount: new Prisma.Decimal(0),
      taxAmount: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(25000),
      paymentMethod: 'CASH' as const,
      amountPaid: new Prisma.Decimal(30000),
      changeAmount: new Prisma.Decimal(5000),
      notes: null,
      voidedBy: null,
      voidedAt: null,
      voidReason: null,
      clientId: null,
      syncedAt: null,
      transactedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      cashier: { id: cashierActor.userId, fullName: cashierActor.fullName },
      items: [],
    };

    const prisma = {
      transaction: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([sampleTx]),
      },
    } as unknown as PrismaClient;

    const service = new TransactionService(prisma, cache);
    const result = await service.list(
      {
        page: 1,
        limit: 10,
        status: 'COMPLETED',
        paymentMethod: 'CASH',
        startDate: '2026-11-01',
        endDate: '2026-11-08',
      },
      cashierActor.role,
    );

    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.items[0]?.transactionNo).toBe('TRX-20261108-0001');
  });

  it('getById melempar 404 NOT_FOUND jika transaksi tidak ada', async () => {
    const cache = new InMemoryCacheStore();
    const prisma = {
      transaction: { findUnique: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    const service = new TransactionService(prisma, cache);

    await expect(service.getById('tx-unknown', 'CASHIER')).rejects.toMatchObject({
      statusCode: 404,
      code: ERROR_CODES.TRANSACTION_NOT_FOUND,
    });
  });
});
