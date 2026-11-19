import type {
  DashboardCategoryBreakdownDto,
  DashboardChartsDto,
  DashboardDayMetricsDto,
  DashboardOpenShiftItemDto,
  DashboardSummaryDto,
  PaymentBreakdownPointDto,
  PaymentMethod,
  ProductPerformanceItemDto,
  ProductType,
  SalesTimelinePointDto,
} from '@istana-buah/shared';
import type { PrismaClient } from '@prisma/client';
import type { CacheConfig } from '../../config/cache.config';
import { CACHE_NAMESPACES, readJsonCache, writeJsonCache, type CacheStore } from '../../lib/cache';
import {
  getCalendarYmdDashedInTimeZone,
  getZonedDayRangeUtc,
  shiftYmdDashed,
} from '../../utils/date-helpers';
import type { StockService } from '../stock/stock.service';
import type { DashboardChartsQuery, DashboardSummaryQuery } from './dashboard.dto';

export const DASHBOARD_CACHE_NAMESPACE = CACHE_NAMESPACES.DASHBOARD;

interface RawTxForDashboard {
  id: string;
  status: string;
  totalAmount: unknown;
  paymentMethod: string;
  transactedAt: Date;
  items: Array<{
    productId: string;
    productName: string;
    productType: ProductType;
    quantity: unknown;
    unitCost: unknown;
    lineTotal: unknown;
    product?: {
      categoryId: string;
      category?: { id: string; name: string } | null;
    } | null;
  }>;
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0.00';
  return ((numerator / denominator) * 100).toFixed(2);
}

function computeDayMetrics(rows: RawTxForDashboard[]): {
  metrics: DashboardDayMetricsDto;
  topProducts: ProductPerformanceItemDto[];
} {
  let revenue = 0;
  let cogs = 0;
  let completedCount = 0;
  let voidedCount = 0;

  const prodMap = new Map<
    string,
    {
      productId: string;
      productName: string;
      productType: ProductType;
      categoryName: string;
      qty: number;
      rev: number;
      cost: number;
      txIds: Set<string>;
    }
  >();

  for (const row of rows) {
    if (row.status === 'VOIDED') {
      voidedCount += 1;
      continue;
    }
    if (row.status !== 'COMPLETED') {
      continue;
    }

    completedCount += 1;
    revenue += Number(row.totalAmount);

    for (const item of row.items) {
      const qty = Number(item.quantity);
      const itemCost = qty * Number(item.unitCost);
      const itemRev = Number(item.lineTotal);
      cogs += itemCost;

      const existing = prodMap.get(item.productId) ?? {
        productId: item.productId,
        productName: item.productName,
        productType: item.productType,
        categoryName: item.product?.category?.name ?? 'Tanpa Kategori',
        qty: 0,
        rev: 0,
        cost: 0,
        txIds: new Set<string>(),
      };

      existing.qty += qty;
      existing.rev += itemRev;
      existing.cost += itemCost;
      existing.txIds.add(row.id);
      prodMap.set(item.productId, existing);
    }
  }

  const grossProfit = revenue - cogs;
  const avgTx = completedCount > 0 ? revenue / completedCount : 0;

  const topProducts: ProductPerformanceItemDto[] = Array.from(prodMap.values())
    .sort((a, b) => b.rev - a.rev || b.qty - a.qty)
    .map((entry) => {
      const gp = entry.rev - entry.cost;
      return {
        productId: entry.productId,
        productName: entry.productName,
        productType: entry.productType,
        categoryName: entry.categoryName,
        totalQuantity: Number(entry.qty.toFixed(3)).toString(),
        totalRevenue: formatMoney(entry.rev),
        totalCost: formatMoney(entry.cost),
        grossProfit: formatMoney(gp),
        profitMargin: formatPercent(gp, entry.rev),
        transactionCount: entry.txIds.size,
      };
    });

  return {
    metrics: {
      revenue: formatMoney(revenue),
      transactions: completedCount,
      voidedTransactions: voidedCount,
      avgTransactionValue: formatMoney(avgTx),
      costOfGoodsSold: formatMoney(cogs),
      grossProfit: formatMoney(grossProfit),
      profitMargin: formatPercent(grossProfit, revenue),
    },
    topProducts,
  };
}

/**
 * Layanan Dashboard Owner & Manajer (M08-001).
 * Menyediakan KPI real-time hari ini vs kemarin, shift aktif, stok menipis,
 * produk terlaris, hutang PO & grafik penjualan 7/30 hari dengan cache Redis invalidasi otomatis.
 */
export class DashboardService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore,
    private readonly cacheCfg: CacheConfig,
    private readonly timezone: string,
    private readonly stockService: StockService,
  ) {}

  private async getCompositeVersion(): Promise<string> {
    const [vDashboard, vReports, vStock, vSuppliers] = await Promise.all([
      this.cache.getVersion(DASHBOARD_CACHE_NAMESPACE),
      this.cache.getVersion(CACHE_NAMESPACES.REPORTS),
      this.cache.getVersion(CACHE_NAMESPACES.STOCK),
      this.cache.getVersion(CACHE_NAMESPACES.SUPPLIERS),
    ]);
    return `${vDashboard}.${vReports}.${vStock}.${vSuppliers}`;
  }

  async getSummary(query: DashboardSummaryQuery): Promise<DashboardSummaryDto> {
    const topLimit = query.topLimit ?? 5;
    const lowStockLimit = query.lowStockLimit ?? 5;
    const todayYmd = getCalendarYmdDashedInTimeZone(new Date(), this.timezone);
    const yesterdayYmd = shiftYmdDashed(todayYmd, -1);

    const compositeVer = await this.getCompositeVersion();
    const cacheKey = `${DASHBOARD_CACHE_NAMESPACE}:v${compositeVer}:summary:${todayYmd}:${topLimit}:${lowStockLimit}`;
    const cached = await readJsonCache<DashboardSummaryDto>(this.cache, cacheKey);
    if (cached) {
      return cached;
    }

    const todayRange = getZonedDayRangeUtc(todayYmd, this.timezone);
    const yesterdayRange = getZonedDayRangeUtc(yesterdayYmd, this.timezone);

    const [
      todayTxRows,
      yesterdayTxRows,
      openShiftRows,
      lowStockRes,
      outOfStockCount,
      unpaidPoRows,
      wasteAgg,
    ] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          transactedAt: { gte: todayRange.start, lte: todayRange.end },
          status: { in: ['COMPLETED', 'VOIDED'] },
        },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          paymentMethod: true,
          transactedAt: true,
          items: {
            select: {
              productId: true,
              productName: true,
              productType: true,
              quantity: true,
              unitCost: true,
              lineTotal: true,
              product: {
                select: {
                  categoryId: true,
                  category: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.transaction.findMany({
        where: {
          transactedAt: { gte: yesterdayRange.start, lte: yesterdayRange.end },
          status: { in: ['COMPLETED', 'VOIDED'] },
        },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          paymentMethod: true,
          transactedAt: true,
          items: {
            select: {
              productId: true,
              productName: true,
              productType: true,
              quantity: true,
              unitCost: true,
              lineTotal: true,
            },
          },
        },
      }),
      this.prisma.shift.findMany({
        where: { status: 'OPEN' },
        orderBy: { openedAt: 'asc' },
        select: {
          id: true,
          shiftNo: true,
          openedAt: true,
          user: { select: { fullName: true } },
          transactions: {
            where: { status: 'COMPLETED' },
            select: { totalAmount: true },
          },
        },
      }),
      this.stockService.listLowStockAlerts({ page: 1, limit: lowStockLimit }),
      this.prisma.product.count({
        where: { deletedAt: null, isActive: true, stockQty: { lte: 0 } },
      }),
      this.prisma.purchaseOrder.findMany({
        where: { status: { in: ['PENDING', 'PARTIAL', 'RECEIVED'] } },
        select: { totalAmount: true, paidAmount: true },
      }),
      this.prisma.wasteRecord.aggregate({
        where: { recordedAt: { gte: todayRange.start, lte: todayRange.end } },
        _count: { _all: true },
        _sum: { estimatedCost: true },
      }),
    ]);

    const todayCalc = computeDayMetrics(todayTxRows as RawTxForDashboard[]);
    const yesterdayCalc = computeDayMetrics(yesterdayTxRows as RawTxForDashboard[]);

    const todayRevNum = Number(todayCalc.metrics.revenue);
    const yesterdayRevNum = Number(yesterdayCalc.metrics.revenue);
    const revDiff = todayRevNum - yesterdayRevNum;
    const revPct = yesterdayRevNum > 0 ? ((revDiff / yesterdayRevNum) * 100).toFixed(2) : null;

    const txDiff = todayCalc.metrics.transactions - yesterdayCalc.metrics.transactions;
    const txPct =
      yesterdayCalc.metrics.transactions > 0
        ? ((txDiff / yesterdayCalc.metrics.transactions) * 100).toFixed(2)
        : null;

    const openShifts: DashboardOpenShiftItemDto[] = openShiftRows.map((sh) => {
      const sum = sh.transactions.reduce((acc, t) => acc + Number(t.totalAmount), 0);
      return {
        id: sh.id,
        shiftNo: sh.shiftNo,
        cashierName: sh.user.fullName,
        openedAt: sh.openedAt.toISOString(),
        totalSales: formatMoney(sum),
        totalTransactions: sh.transactions.length,
      };
    });

    let unpaidCount = 0;
    let totalOutstandingDebt = 0;
    for (const po of unpaidPoRows) {
      const debt = Number(po.totalAmount) - Number(po.paidAmount);
      if (debt > 0) {
        unpaidCount += 1;
        totalOutstandingDebt += debt;
      }
    }

    const summary: DashboardSummaryDto = {
      generatedAt: new Date().toISOString(),
      todayDate: todayYmd,
      yesterdayDate: yesterdayYmd,
      today: todayCalc.metrics,
      yesterday: yesterdayCalc.metrics,
      comparison: {
        revenueChangeAmount: formatMoney(revDiff),
        revenueChangePercent: revPct,
        transactionsChangeCount: txDiff,
        transactionsChangePercent: txPct,
      },
      openShifts: {
        count: openShifts.length,
        items: openShifts,
      },
      lowStock: {
        totalCount: lowStockRes.meta.total,
        outOfStockCount,
        items: lowStockRes.items,
      },
      topProductsToday: todayCalc.topProducts.slice(0, topLimit),
      unpaidPurchaseOrders: {
        count: unpaidCount,
        totalOutstandingDebt: formatMoney(totalOutstandingDebt),
      },
      todayWaste: {
        count: wasteAgg._count._all,
        totalEstimatedCost: formatMoney(Number(wasteAgg._sum.estimatedCost ?? 0)),
      },
    };

    await writeJsonCache(this.cache, cacheKey, summary, this.cacheCfg.productTtlSeconds);
    return summary;
  }

  /**
   * Data grafik tren harian kontinyu (termasuk hari nol transaksi), breakdown metode pembayaran,
   * serta kontribusi omzet per kategori buah untuk rentang N hari (default 7 atau 30 hari).
   */
  async getCharts(query: DashboardChartsQuery): Promise<DashboardChartsDto> {
    const days = query.days ?? 7;
    const endYmd = getCalendarYmdDashedInTimeZone(new Date(), this.timezone);
    const startYmd = shiftYmdDashed(endYmd, -(days - 1));

    const compositeVer = await this.getCompositeVersion();
    const cacheKey = `${DASHBOARD_CACHE_NAMESPACE}:v${compositeVer}:charts:${startYmd}:${endYmd}:${days}`;
    const cached = await readJsonCache<DashboardChartsDto>(this.cache, cacheKey);
    if (cached) {
      return cached;
    }

    const startRange = getZonedDayRangeUtc(startYmd, this.timezone);
    const endRange = getZonedDayRangeUtc(endYmd, this.timezone);

    const rows = await this.prisma.transaction.findMany({
      where: {
        transactedAt: { gte: startRange.start, lte: endRange.end },
        status: 'COMPLETED',
      },
      orderBy: { transactedAt: 'asc' },
      select: {
        id: true,
        totalAmount: true,
        paymentMethod: true,
        transactedAt: true,
        items: {
          select: {
            quantity: true,
            unitCost: true,
            lineTotal: true,
            product: {
              select: {
                categoryId: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    const timelineMap = new Map<
      string,
      { revenue: number; costOfGoodsSold: number; transactions: number }
    >();
    for (let offset = 0; offset < days; offset += 1) {
      const slotYmd = shiftYmdDashed(startYmd, offset);
      timelineMap.set(slotYmd, { revenue: 0, costOfGoodsSold: 0, transactions: 0 });
    }

    const paymentMap = new Map<PaymentMethod, { revenue: number; transactions: number }>();
    const categoryMap = new Map<
      string,
      { categoryId: string; categoryName: string; revenue: number }
    >();

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalItemRevenue = 0;

    for (const row of rows) {
      const txRevenue = Number(row.totalAmount);
      const txCogs = row.items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
        0,
      );
      totalRevenue += txRevenue;
      totalCogs += txCogs;

      const dateKey = getCalendarYmdDashedInTimeZone(row.transactedAt, this.timezone);
      const dayBucket = timelineMap.get(dateKey);
      if (dayBucket) {
        dayBucket.revenue += txRevenue;
        dayBucket.costOfGoodsSold += txCogs;
        dayBucket.transactions += 1;
      }

      const method = row.paymentMethod as PaymentMethod;
      const pmEntry = paymentMap.get(method) ?? { revenue: 0, transactions: 0 };
      pmEntry.revenue += txRevenue;
      pmEntry.transactions += 1;
      paymentMap.set(method, pmEntry);

      for (const item of row.items) {
        const lineRev = Number(item.lineTotal);
        totalItemRevenue += lineRev;
        const catId = item.product?.category?.id ?? item.product?.categoryId ?? 'uncategorized';
        const catName = item.product?.category?.name ?? 'Tanpa Kategori';
        const catEntry = categoryMap.get(catId) ?? {
          categoryId: catId,
          categoryName: catName,
          revenue: 0,
        };
        catEntry.revenue += lineRev;
        categoryMap.set(catId, catEntry);
      }
    }

    const timeline: SalesTimelinePointDto[] = Array.from(timelineMap.entries()).map(
      ([date, stats]) => ({
        date,
        revenue: formatMoney(stats.revenue),
        costOfGoodsSold: formatMoney(stats.costOfGoodsSold),
        grossProfit: formatMoney(stats.revenue - stats.costOfGoodsSold),
        transactions: stats.transactions,
      }),
    );

    const paymentBreakdown: PaymentBreakdownPointDto[] = Array.from(paymentMap.entries())
      .map(([paymentMethod, stats]) => ({
        paymentMethod,
        revenue: formatMoney(stats.revenue),
        transactions: stats.transactions,
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));

    const categoryBreakdown: DashboardCategoryBreakdownDto[] = Array.from(categoryMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((entry) => ({
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        revenue: formatMoney(entry.revenue),
        percentage: formatPercent(entry.revenue, totalItemRevenue),
      }));

    const charts: DashboardChartsDto = {
      days,
      startDate: startYmd,
      endDate: endYmd,
      totalRevenue: formatMoney(totalRevenue),
      totalGrossProfit: formatMoney(totalRevenue - totalCogs),
      totalTransactions: rows.length,
      timeline,
      paymentBreakdown,
      categoryBreakdown,
    };

    await writeJsonCache(this.cache, cacheKey, charts, this.cacheCfg.productTtlSeconds);
    return charts;
  }
}
