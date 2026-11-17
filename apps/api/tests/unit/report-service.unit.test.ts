import { ERROR_CODES } from '@istana-buah/shared';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';
import { cacheConfig } from '../../src/config/cache.config';
import { InMemoryCacheStore } from '../../src/lib/cache';
import { buildSalesReportPdf } from '../../src/modules/reports/pdf-report-builder';
import { ReportController } from '../../src/modules/reports/report.controller';
import { ReportService } from '../../src/modules/reports/report.service';
import {
  buildSalesCsvBuffer,
  buildSalesExcelBuffer,
} from '../../src/modules/reports/report-export-formatter';

describe('M07-001 Unit: ReportService, Export Formatters & ReportController', () => {
  const TZ = 'Asia/Jakarta';
  const STORE = 'Istana Buah Test';

  const sampleTransactions = [
    {
      id: 'tx-1',
      transactionNo: 'TRX-20261110-001',
      status: 'COMPLETED',
      totalAmount: new Prisma.Decimal('100000.00'),
      paymentMethod: 'CASH',
      discountAmount: new Prisma.Decimal('0.00'),
      transactedAt: new Date('2026-11-10T03:00:00Z'), // 10:00 WIB (Selasa)
      cashier: { fullName: 'Kasir Pagi' },
      items: [
        {
          productId: 'p-1',
          productName: 'Mangga Harum Manis',
          productType: 'WEIGHT' as const,
          quantity: new Prisma.Decimal('2.500'),
          unitCost: new Prisma.Decimal('20000.00'),
          lineTotal: new Prisma.Decimal('100000.00'),
          product: { category: { name: 'Buah Lokal' } },
        },
      ],
    },
    {
      id: 'tx-2',
      transactionNo: 'TRX-20261115-002',
      status: 'COMPLETED',
      totalAmount: new Prisma.Decimal('60000.00'),
      paymentMethod: 'QRIS',
      discountAmount: new Prisma.Decimal('0.00'),
      transactedAt: new Date('2026-11-15T18:30:00Z'), // 2026-11-16 01:30 WIB (Senin minggu berikut)
      cashier: { fullName: '=HYPERLINK("bad")' },
      items: [
        {
          productId: 'p-2',
          productName: 'Apel Fuji',
          productType: 'UNIT' as const,
          quantity: new Prisma.Decimal('4.000'),
          unitCost: new Prisma.Decimal('9000.00'),
          lineTotal: new Prisma.Decimal('60000.00'),
          product: { category: { name: 'Buah Impor' } },
        },
      ],
    },
    {
      id: 'tx-3',
      transactionNo: 'TRX-20261115-003',
      status: 'VOIDED',
      totalAmount: new Prisma.Decimal('25000.00'),
      paymentMethod: 'CASH',
      discountAmount: new Prisma.Decimal('0.00'),
      transactedAt: new Date('2026-11-15T05:00:00Z'),
      cashier: { fullName: 'Kasir Siang' },
      items: [
        {
          productId: 'p-1',
          productName: 'Mangga Harum Manis',
          productType: 'WEIGHT' as const,
          quantity: new Prisma.Decimal('1.000'),
          unitCost: new Prisma.Decimal('20000.00'),
          lineTotal: new Prisma.Decimal('25000.00'),
          product: { category: { name: 'Buah Lokal' } },
        },
      ],
    },
  ];

  function createMockPrisma() {
    return {
      transaction: {
        findMany: jest.fn().mockResolvedValue(sampleTransactions),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'p-1',
            name: 'Mangga Harum Manis',
            categoryId: 'cat-1',
            category: { id: 'cat-1', name: 'Buah Lokal' },
            productType: 'WEIGHT',
            pricePerKg: new Prisma.Decimal('40000.00'),
            costPerKg: new Prisma.Decimal('20000.00'),
            pricePerUnit: null,
            costPerUnit: null,
            stockQty: new Prisma.Decimal('8.000'),
            minStockAlert: new Prisma.Decimal('10.000'),
            isActive: true,
          },
          {
            id: 'p-2',
            name: 'Apel Fuji',
            categoryId: 'cat-2',
            category: { id: 'cat-2', name: 'Buah Impor' },
            productType: 'UNIT',
            pricePerKg: null,
            costPerKg: null,
            pricePerUnit: new Prisma.Decimal('15000.00'),
            costPerUnit: new Prisma.Decimal('9000.00'),
            stockQty: new Prisma.Decimal('0.000'),
            minStockAlert: new Prisma.Decimal('5.000'),
            isActive: true,
          },
          {
            id: 'p-3',
            name: 'Pisang Cavendish',
            categoryId: 'cat-1',
            category: { id: 'cat-1', name: 'Buah Lokal' },
            productType: 'UNIT',
            pricePerKg: null,
            costPerKg: null,
            pricePerUnit: new Prisma.Decimal('20000.00'),
            costPerUnit: new Prisma.Decimal('12000.00'),
            stockQty: new Prisma.Decimal('30.000'),
            minStockAlert: new Prisma.Decimal('5.000'),
            isActive: true,
          },
        ]),
      },
    } as unknown as PrismaClient;
  }

  it('menghitung sales-summary, timeline day/week/month, dan memakai cache Redis', async () => {
    const mockPrisma = createMockPrisma();
    const cache = new InMemoryCacheStore();
    const service = new ReportService(mockPrisma, cache, cacheConfig, TZ, STORE);

    const daily = await service.getSalesSummary({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      groupBy: 'day',
    });

    // Total selesai: 100.000 + 60.000 = 160.000; COGS: (2.5*20rb) + (4*9rb) = 86.000; Laba: 74.000
    expect(daily.totalRevenue).toBe('160000.00');
    expect(daily.totalTransactions).toBe(2);
    expect(daily.voidedTransactions).toBe(1);
    expect(daily.totalCostOfGoodsSold).toBe('86000.00');
    expect(daily.grossProfit).toBe('74000.00');
    expect(daily.profitMargin).toBe('46.25');
    expect(daily.avgTransactionValue).toBe('80000.00');
    expect(daily.timeline.map((t) => t.date)).toEqual(['2026-11-10', '2026-11-16']);
    expect(daily.paymentBreakdown[0]).toEqual({
      paymentMethod: 'CASH',
      revenue: '100000.00',
      transactions: 1,
    });

    // Panggilan identik kedua harus cache hit tanpa query Prisma lagi
    await service.getSalesSummary({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      groupBy: 'day',
    });
    expect(mockPrisma.transaction.findMany).toHaveBeenCalledTimes(1);

    const weekly = await service.getSalesSummary({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      groupBy: 'week',
    });
    expect(weekly.timeline.map((t) => t.date)).toEqual(['2026-11-09', '2026-11-16']);

    const monthly = await service.getSalesSummary({
      startDate: '2026-11-01',
      endDate: '2026-11-30',
      groupBy: 'month',
    });
    expect(monthly.timeline).toHaveLength(1);
    expect(monthly.timeline[0]?.date).toBe('2026-11');
  });

  it('menolak rentang tanggal terbalik dengan VALIDATION_ERROR', async () => {
    const service = new ReportService(
      createMockPrisma(),
      new InMemoryCacheStore(),
      cacheConfig,
      TZ,
      STORE,
    );

    await expect(
      service.getSalesSummary({
        startDate: '2026-11-20',
        endDate: '2026-11-10',
        groupBy: 'day',
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR, statusCode: 400 });
  });

  it('mengurutkan product-performance menurut revenue atau qty serta menyaring stock-current', async () => {
    const completedOnly = sampleTransactions.filter((t) => t.status === 'COMPLETED');
    const mockPrisma = createMockPrisma();
    (mockPrisma.transaction.findMany as jest.Mock).mockResolvedValue(completedOnly);

    const service = new ReportService(mockPrisma, new InMemoryCacheStore(), cacheConfig, TZ, STORE);

    const byRev = await service.getProductPerformance({ sortBy: 'revenue', limit: 10 });
    expect(byRev.items[0]?.productId).toBe('p-1');
    expect(byRev.items[0]?.totalQuantity).toBe('2.5');
    expect(byRev.items[0]?.profitMargin).toBe('50.00');

    const byQty = await service.getProductPerformance({ sortBy: 'qty', limit: 10 });
    expect(byQty.items[0]?.productId).toBe('p-2');
    expect(byQty.items[0]?.totalQuantity).toBe('4');

    const stockAll = await service.getCurrentStock({});
    expect(stockAll.totalProducts).toBe(3);
    expect(stockAll.lowStockCount).toBe(2);
    expect(stockAll.outOfStockCount).toBe(1);
    // Cost value: (8*20rb) + (0*9rb) + (30*12rb) = 160rb + 360rb = 520rb
    expect(stockAll.totalStockCostValue).toBe('520000.00');
    // Retail value: (8*40rb) + (0*15rb) + (30*20rb) = 320rb + 600rb = 920rb
    expect(stockAll.totalStockRetailValue).toBe('920000.00');

    const stockLow = await service.getCurrentStock({ lowStockOnly: true });
    expect(stockLow.totalProducts).toBe(2);
    expect(stockLow.items.every((i) => i.isLowStock || i.isOutOfStock)).toBe(true);
  });

  it('menghasilkan ekspor CSV (UTF-8 BOM + anti-formula-injection), Excel XML, & PDF A4 multi-halaman valid', async () => {
    const service = new ReportService(
      createMockPrisma(),
      new InMemoryCacheStore(),
      cacheConfig,
      TZ,
      STORE,
    );

    const csvFile = await service.exportSalesReport({
      format: 'csv',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(csvFile.filename).toMatch(/^laporan-penjualan-.*\.csv$/);
    const csvText = csvFile.content.toString('utf8');
    expect(csvText.startsWith('\uFEFF')).toBe(true);
    expect(csvText).toContain("'=HYPERLINK(");

    const xlsFile = await service.exportSalesReport({
      format: 'excel',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(xlsFile.filename).toMatch(/\.xls$/);
    const xlsText = xlsFile.content.toString('utf8');
    expect(xlsText).toContain('ss:Name="Ringkasan"');
    expect(xlsText).toContain('ss:Name="Detail Transaksi"');

    const pdfFile = await service.exportSalesReport({
      format: 'pdf',
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(pdfFile.mimeType).toBe('application/pdf');
    const pdfText = pdfFile.content.toString('utf8');
    expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfText).toContain('xref');
    expect(pdfText.trim().endsWith('%%EOF')).toBe(true);

    // Uji multi-page pagination PDF builder (45 baris > 34 baris halaman pertama)
    const manyRows = Array.from({ length: 45 }, (_, idx) => ({
      transactionNo: `TRX-20261110-${String(idx + 1).padStart(3, '0')}`,
      transactedAtLabel: '2026-11-10 10:00',
      cashierName: 'Kasir Uji',
      paymentMethod: 'CASH',
      status: 'COMPLETED',
      discountAmount: '0.00',
      totalAmount: '50000.00',
      costOfGoodsSold: '30000.00',
      grossProfit: '20000.00',
    }));
    const multiPagePdf = buildSalesReportPdf({
      storeName: STORE,
      periodLabel: '2026-11-01 s/d 2026-11-30',
      printedAtLabel: '2026-11-18 09:00',
      summary: {
        startDate: '2026-11-01T00:00:00.000Z',
        endDate: '2026-11-30T23:59:59.999Z',
        groupBy: 'day',
        totalRevenue: '2250000.00',
        totalTransactions: 45,
        voidedTransactions: 0,
        avgTransactionValue: '50000.00',
        totalCostOfGoodsSold: '1350000.00',
        grossProfit: '900000.00',
        profitMargin: '40.00',
        paymentBreakdown: [],
        timeline: [],
      },
      rows: manyRows,
    });
    expect(multiPagePdf.toString('utf8')).toContain('/Count 2');

    // Uji empty PDF/CSV/Excel rows
    const emptySummary = await new ReportService(
      {
        ...createMockPrisma(),
        transaction: { findMany: jest.fn().mockResolvedValue([]) },
      } as unknown as PrismaClient,
      new InMemoryCacheStore(),
      cacheConfig,
      TZ,
      STORE,
    ).getSalesSummary({ groupBy: 'day' });
    expect(emptySummary.profitMargin).toBe('0.00');
    expect(
      buildSalesReportPdf({
        storeName: STORE,
        periodLabel: '2026-11-01',
        printedAtLabel: '2026-11-01 10:00',
        summary: emptySummary,
        rows: [],
      }).toString('utf8'),
    ).toContain('Tidak ada transaksi pada periode ini.');
    expect(
      buildSalesCsvBuffer({ storeName: STORE, periodLabel: 'p', summary: emptySummary, rows: [] })
        .length,
    ).toBeGreaterThan(0);
    expect(
      buildSalesExcelBuffer({ storeName: STORE, periodLabel: 'p', summary: emptySummary, rows: [] })
        .length,
    ).toBeGreaterThan(0);
  });

  it('ReportController mengirim respons JSON dan header download file dengan benar', async () => {
    const fakeService = {
      getSalesSummary: jest.fn().mockResolvedValue({ totalRevenue: '100.00' }),
      getProductPerformance: jest.fn().mockResolvedValue({ items: [] }),
      getCurrentStock: jest.fn().mockResolvedValue({ totalProducts: 0, items: [] }),
      exportSalesReport: jest.fn().mockResolvedValue({
        filename: 'laporan-test.csv',
        mimeType: 'text/csv; charset=utf-8',
        content: Buffer.from('ok'),
      }),
    } as unknown as ReportService;

    const controller = new ReportController(fakeService);
    const makeRes = () =>
      ({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
        send: jest.fn().mockReturnThis(),
      }) as unknown as Response;

    const r1 = makeRes();
    await controller.salesSummary({ validatedQuery: { groupBy: 'day' } } as unknown as Request, r1);
    expect(r1.status).toHaveBeenCalledWith(200);

    const r2 = makeRes();
    await controller.productPerformance(
      { validatedQuery: { sortBy: 'revenue', limit: 10 } } as unknown as Request,
      r2,
    );
    expect(r2.status).toHaveBeenCalledWith(200);

    const r3 = makeRes();
    await controller.stockCurrent({ validatedQuery: {} } as unknown as Request, r3);
    expect(r3.status).toHaveBeenCalledWith(200);

    const r4 = makeRes();
    await controller.exportSales({ validatedQuery: { format: 'csv' } } as unknown as Request, r4);
    expect(r4.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(r4.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="laporan-test.csv"',
    );
    expect(r4.send).toHaveBeenCalledWith(Buffer.from('ok'));
  });
});
