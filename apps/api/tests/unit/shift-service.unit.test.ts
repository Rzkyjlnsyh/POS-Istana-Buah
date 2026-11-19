import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { ShiftController } from '../../src/modules/shifts/shift.controller';
import type { ShiftActorContext } from '../../src/modules/shifts/shift.dto';
import { ShiftService } from '../../src/modules/shifts/shift.service';

describe('M06-001 Unit: ShiftService & ShiftController', () => {
  const cashierActor = {
    userId: 'u-cashier-1',
    role: 'CASHIER' as const,
    ipAddress: '127.0.0.1',
    userAgent: 'shift-test',
  };

  const managerActor = {
    userId: 'u-manager-1',
    role: 'MANAGER' as const,
    ipAddress: '127.0.0.1',
    userAgent: 'shift-test',
  };

  const baseShift = {
    id: 'shift-1',
    userId: cashierActor.userId,
    shiftNo: 'SHIFT-20261117-001',
    status: 'OPEN' as const,
    openedAt: new Date('2026-11-17T01:00:00Z'),
    closedAt: null,
    openingCash: new Prisma.Decimal(500000),
    closingCash: null,
    expectedCash: new Prisma.Decimal(500000),
    cashDifference: null,
    totalSales: new Prisma.Decimal(0),
    totalTransactions: 0,
    notes: 'Shift Pagi',
    createdAt: new Date('2026-11-17T01:00:00Z'),
    updatedAt: new Date('2026-11-17T01:00:00Z'),
    user: { id: cashierActor.userId, fullName: 'Kasir Utama' },
    transactions: [],
  };

  it('open membuka shift baru dengan nomor SHIFT-YYYYMMDD-NNN dan menolak jika sudah ada shift terbuka', async () => {
    const txOpen = {
      shift: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([{ shiftNo: 'SHIFT-20261117-009' }]),
        create: jest.fn().mockResolvedValue({ ...baseShift, shiftNo: 'SHIFT-20261117-010' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const prismaOk = {
      $transaction: jest.fn(async (cb: (t: typeof txOpen) => Promise<unknown>) => cb(txOpen)),
    } as unknown as PrismaClient;

    const opened = await new ShiftService(prismaOk).open(
      { openingCash: 500000, notes: 'Shift Pagi' },
      cashierActor,
    );
    expect(opened.shiftNo).toBe('SHIFT-20261117-010');
    expect(opened.openingCash).toBe('500000.00');

    const txConflict = {
      shift: {
        findFirst: jest.fn().mockResolvedValue({ id: 'shift-1', shiftNo: 'SHIFT-20261117-001' }),
      },
    };
    await expect(
      new ShiftService({
        $transaction: jest.fn(async (cb: (t: typeof txConflict) => Promise<unknown>) =>
          cb(txConflict),
        ),
      } as unknown as PrismaClient).open({ openingCash: 500000 }, cashierActor),
    ).rejects.toMatchObject({ code: ERROR_CODES.SHIFT_ALREADY_OPEN, statusCode: 409 });
  });

  it('close menghitung expectedCash, cashDifference & breakdown metode bayar serta menegakkan guard', async () => {
    const shiftWithSales = {
      ...baseShift,
      transactions: [
        { status: 'COMPLETED', paymentMethod: 'CASH', totalAmount: new Prisma.Decimal(200000) },
        { status: 'COMPLETED', paymentMethod: 'QRIS', totalAmount: new Prisma.Decimal(150000) },
        {
          status: 'COMPLETED',
          paymentMethod: 'BANK_TRANSFER',
          totalAmount: new Prisma.Decimal(100000),
        },
        { status: 'COMPLETED', paymentMethod: 'MIXED', totalAmount: new Prisma.Decimal(50000) },
        { status: 'VOIDED', paymentMethod: 'CASH', totalAmount: new Prisma.Decimal(75000) },
        { status: 'PENDING', paymentMethod: 'CASH', totalAmount: new Prisma.Decimal(25000) },
      ],
    };

    const closedReturn = {
      ...shiftWithSales,
      status: 'CLOSED' as const,
      closedAt: new Date('2026-11-17T09:00:00Z'),
      closingCash: new Prisma.Decimal(695000),
      expectedCash: new Prisma.Decimal(700000), // 500k + 200k cash
      cashDifference: new Prisma.Decimal(-5000),
      totalSales: new Prisma.Decimal(500000),
      totalTransactions: 4,
    };

    const txClose = {
      shift: {
        findUnique: jest.fn().mockResolvedValue(shiftWithSales),
        update: jest.fn().mockResolvedValue(closedReturn),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const closed = await new ShiftService({
      $transaction: jest.fn(async (cb: (t: typeof txClose) => Promise<unknown>) => cb(txClose)),
    } as unknown as PrismaClient).close('shift-1', { closingCash: 695000 }, cashierActor);

    expect(closed.expectedCash).toBe('700000.00');
    expect(closed.cashDifference).toBe('-5000.00');
    expect(closed.totalSales).toBe('500000.00');
    expect(closed.summary.completedTransactions).toBe(4);
    expect(closed.summary.voidedTransactions).toBe(1);
    expect(closed.summary.qrisSales).toBe('150000.00');
    expect(closed.summary.bankTransferSales).toBe('100000.00');
    expect(closed.summary.mixedSales).toBe('50000.00');

    // Guard cases
    const runClose = (row: unknown, actor: ShiftActorContext = cashierActor) =>
      new ShiftService({
        $transaction: jest.fn(async (cb: (t: unknown) => Promise<unknown>) =>
          cb({ shift: { findUnique: jest.fn().mockResolvedValue(row) } }),
        ),
      } as unknown as PrismaClient).close('shift-1', { closingCash: 500000 }, actor);

    await expect(runClose(null)).rejects.toMatchObject({
      code: ERROR_CODES.SHIFT_NOT_FOUND,
      statusCode: 404,
    });
    await expect(
      runClose({ ...baseShift, userId: 'other-cashier' }, cashierActor),
    ).rejects.toMatchObject({ code: ERROR_CODES.FORBIDDEN, statusCode: 403 });
    await expect(runClose({ ...baseShift, status: 'CLOSED' }, managerActor)).rejects.toMatchObject({
      code: ERROR_CODES.SHIFT_ALREADY_CLOSED,
      statusCode: 400,
    });
  });

  it('list, getActive, & getById memfilter riwayat dan mengisolasi data per role', async () => {
    const prisma = {
      shift: {
        findFirst: jest.fn().mockResolvedValueOnce(baseShift).mockResolvedValueOnce(null),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([baseShift]),
        findUnique: jest.fn().mockResolvedValueOnce(baseShift).mockResolvedValueOnce(baseShift),
      },
    } as unknown as PrismaClient;

    const svc = new ShiftService(prisma);
    expect((await svc.getActive(cashierActor.userId))?.id).toBe('shift-1');
    expect(await svc.getActive(cashierActor.userId)).toBeNull();

    const listCashier = await svc.list(
      {
        page: 1,
        limit: 20,
        status: 'OPEN',
        userId: 'other-id',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        search: 'SHIFT',
      },
      'CASHIER',
      cashierActor.userId,
    );
    expect(listCashier.items).toHaveLength(1);
    expect(prisma.shift.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: cashierActor.userId }),
      }),
    );

    const listManager = await svc.list(
      { page: 1, limit: 20, userId: 'u-cashier-1', search: undefined },
      'MANAGER',
      managerActor.userId,
    );
    expect(listManager.items).toHaveLength(1);

    await expect(svc.getById('shift-1', 'CASHIER', 'other-cashier')).rejects.toMatchObject({
      code: ERROR_CODES.SHIFT_NOT_FOUND,
      statusCode: 404,
    });
    expect((await svc.getById('shift-1', 'MANAGER', managerActor.userId)).id).toBe('shift-1');
  });

  it('ShiftController menolak request tanpa req.authUser dengan 401 UNAUTHORIZED', async () => {
    const controller = new ShiftController({} as unknown as ShiftService);
    const req = { body: {}, params: {}, headers: {}, socket: {} } as unknown as Request;
    const res = {} as unknown as Response;

    await expect(controller.open(req, res)).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: 401,
    });
  });
});
