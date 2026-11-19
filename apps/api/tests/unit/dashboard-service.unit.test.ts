import { Prisma, type PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { cacheConfig } from '../../src/config/cache.config';
import { InMemoryCacheStore } from '../../src/lib/cache';
import { DashboardController } from '../../src/modules/dashboard/dashboard.controller';
import { DashboardService } from '../../src/modules/dashboard/dashboard.service';
import type { StockService } from '../../src/modules/stock/stock.service';
import {
  getCalendarYmdDashedInTimeZone,
  getZonedDayRangeUtc,
  shiftYmdDashed,
} from '../../src/utils/date-helpers';

describe('M08-001 Unit: DashboardService & DashboardController', () => {
  const TZ = 'Asia/Jakarta';

  const makeMockDeps = (options?: { emptyYesterday?: boolean }) => {
    const todayYmd = getCalendarYmdDashedInTimeZone(new Date(), TZ);
    const yesterdayYmd = shiftYmdDashed(todayYmd, -1);
    const todayMid = new Date(
      (getZonedDayRangeUtc(todayYmd, TZ).start.getTime() +
        getZonedDayRangeUtc(todayYmd, TZ).end.getTime()) /
        2,
    );
    const yesterdayMid = new Date(
      (getZonedDayRangeUtc(yesterdayYmd, TZ).start.getTime() +
        getZonedDayRangeUtc(yesterdayYmd, TZ).end.getTime()) /
        2,
    );

    const todayTx = [
      {
        id: 'tx-today-1',
        status: 'COMPLETED',
        totalAmount: new Prisma.Decimal('150000.00'),
        paymentMethod: 'CASH',
        transactedAt: todayMid,
        items: [
          {
            productId: 'p-1',
            productName: 'Mangga Harum Manis',
            productType: 'WEIGHT' as const,
            quantity: new Prisma.Decimal('3.000'),
            unitCost: new Prisma.Decimal('25000.00'),
            lineTotal: new Prisma.Decimal('150000.00'),
            product: {
              categoryId: 'cat-1',
              category: { id: 'cat-1', name: 'Buah Lokal' },
            },
          },
        ],
      },
      {
        id: 'tx-today-void',
        status: 'VOIDED',
        totalAmount: new Prisma.Decimal('50000.00'),
        paymentMethod: 'QRIS',
        transactedAt: todayMid,
        items: [],
      },
    ];

    const yesterdayTx = options?.emptyYesterday
      ? []
      : [
          {
            id: 'tx-yest-1',
            status: 'COMPLETED',
            totalAmount: new Prisma.Decimal('100000.00'),
            paymentMethod: 'QRIS',
            transactedAt: yesterdayMid,
            items: [
              {
                productId: 'p-2',
                productName: 'Apel Fuji',
                productType: 'UNIT' as const,
                quantity: new Prisma.Decimal('4.000'),
                unitCost: new Prisma.Decimal('15000.00'),
                lineTotal: new Prisma.Decimal('100000.00'),
                product: {
                  categoryId: 'cat-2',
                  category: { id: 'cat-2', name: 'Buah Impor' },
                },
              },
            ],
          },
        ];

    const prisma = {
      transaction: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(todayTx)
          .mockResolvedValueOnce(yesterdayTx)
          .mockResolvedValueOnce([...yesterdayTx, todayTx[0]!]),
      },
      shift: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sh-1',
            shiftNo: 'SHIFT-20261119-001',
            openedAt: todayMid,
            user: { fullName: 'Kasir Satu' },
            transactions: [{ totalAmount: new Prisma.Decimal('150000.00') }],
          },
        ]),
      },
      product: {
        count: jest.fn().mockResolvedValue(1),
      },
      purchaseOrder: {
        findMany: jest.fn().mockResolvedValue([
          {
            totalAmount: new Prisma.Decimal('500000.00'),
            paidAmount: new Prisma.Decimal('200000.00'),
          },
          {
            totalAmount: new Prisma.Decimal('100000.00'),
            paidAmount: new Prisma.Decimal('100000.00'),
          },
        ]),
      },
      wasteRecord: {
        aggregate: jest.fn().mockResolvedValue({
          _count: { _all: 2 },
          _sum: { estimatedCost: new Prisma.Decimal('45000.00') },
        }),
      },
    } as unknown as PrismaClient;

    const stockService = {
      listLowStockAlerts: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'p-2',
            name: 'Apel Fuji',
            categoryId: 'cat-2',
            categoryName: 'Buah Impor',
            productType: 'UNIT',
            stockQty: '2',
            minStockAlert: '10',
            deficit: '8',
            isActive: true,
          },
        ],
        meta: { page: 1, limit: 5, total: 3 },
      }),
    } as unknown as StockService;

    return { prisma, stockService, todayYmd, yesterdayYmd };
  };

  it('menghitung getSummary perbandingan hari ini vs kemarin, shift aktif, stok menipis, hutang PO & memakai cache', async () => {
    const { prisma, stockService, todayYmd, yesterdayYmd } = makeMockDeps();
    const cache = new InMemoryCacheStore();
    const service = new DashboardService(prisma, cache, cacheConfig, TZ, stockService);

    const summary = await service.getSummary({ topLimit: 5, lowStockLimit: 5 });

    expect(summary.todayDate).toBe(todayYmd);
    expect(summary.yesterdayDate).toBe(yesterdayYmd);
    expect(summary.today.revenue).toBe('150000.00');
    expect(summary.today.costOfGoodsSold).toBe('75000.00');
    expect(summary.today.grossProfit).toBe('75000.00');
    expect(summary.today.profitMargin).toBe('50.00');
    expect(summary.today.voidedTransactions).toBe(1);
    expect(summary.yesterday.revenue).toBe('100000.00');
    expect(summary.comparison).toEqual({
      revenueChangeAmount: '50000.00',
      revenueChangePercent: '50.00',
      transactionsChangeCount: 0,
      transactionsChangePercent: '0.00',
    });
    expect(summary.openShifts.count).toBe(1);
    expect(summary.openShifts.items[0]?.cashierName).toBe('Kasir Satu');
    expect(summary.lowStock.totalCount).toBe(3);
    expect(summary.lowStock.outOfStockCount).toBe(1);
    expect(summary.topProductsToday[0]?.productName).toBe('Mangga Harum Manis');
    expect(summary.unpaidPurchaseOrders).toEqual({
      count: 1,
      totalOutstandingDebt: '300000.00',
    });
    expect(summary.todayWaste).toEqual({
      count: 2,
      totalEstimatedCost: '45000.00',
    });

    // Panggilan identik kedua harus hit cache
    await service.getSummary({ topLimit: 5, lowStockLimit: 5 });
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(2);
  });

  it('mengembalikan comparison percent null jika kemarin nol & mengisi hari kosong di getCharts', async () => {
    const { prisma, stockService } = makeMockDeps({ emptyYesterday: true });
    const cache = new InMemoryCacheStore();
    const service = new DashboardService(prisma, cache, cacheConfig, TZ, stockService);

    const summary = await service.getSummary({ topLimit: 5, lowStockLimit: 5 });
    expect(summary.comparison.revenueChangePercent).toBeNull();
    expect(summary.comparison.transactionsChangePercent).toBeNull();

    const charts = await service.getCharts({ days: 7 });
    expect(charts.days).toBe(7);
    expect(charts.timeline).toHaveLength(7);
    expect(charts.totalRevenue).toBe('150000.00');
    expect(charts.categoryBreakdown[0]).toEqual({
      categoryId: 'cat-1',
      categoryName: 'Buah Lokal',
      revenue: '150000.00',
      percentage: '100.00',
    });
    expect(charts.paymentBreakdown[0]).toEqual({
      paymentMethod: 'CASH',
      revenue: '150000.00',
      transactions: 1,
    });

    // Panggilan getCharts kedua harus hit cache
    await service.getCharts({ days: 7 });
    expect(prisma.transaction.findMany).toHaveBeenCalledTimes(3);
  });

  it('DashboardController mengembalikan respons 200 JSON untuk summary & charts', async () => {
    const fakeService = {
      getSummary: jest.fn().mockResolvedValue({ todayDate: '2026-11-19' }),
      getCharts: jest.fn().mockResolvedValue({ days: 30, timeline: [] }),
    } as unknown as DashboardService;

    const controller = new DashboardController(fakeService);
    const makeRes = () =>
      ({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      }) as unknown as Response;

    const r1 = makeRes();
    await controller.summary(
      { validatedQuery: { topLimit: 5, lowStockLimit: 5 } } as unknown as Request,
      r1,
    );
    expect(r1.status).toHaveBeenCalledWith(200);
    expect(r1.json).toHaveBeenCalledWith({ success: true, data: { todayDate: '2026-11-19' } });

    const r2 = makeRes();
    await controller.charts({ validatedQuery: { days: 30 } } as unknown as Request, r2);
    expect(r2.status).toHaveBeenCalledWith(200);
    expect(r2.json).toHaveBeenCalledWith({ success: true, data: { days: 30, timeline: [] } });
  });
});
