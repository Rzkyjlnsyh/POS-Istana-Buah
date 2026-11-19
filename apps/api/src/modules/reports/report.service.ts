import {
  ERROR_CODES,
  type CashierPerformanceItemDto,
  type CashierPerformanceReportDto,
  type CurrentStockItemDto,
  type CurrentStockReportDto,
  type GrossProfitReportDto,
  type GrossProfitTimelinePointDto,
  type PaymentBreakdownPointDto,
  type PaymentMethod,
  type ProductPerformanceItemDto,
  type ProductPerformanceReportDto,
  type ReportGroupBy,
  type SalesSummaryReportDto,
  type SalesTimelinePointDto,
  type ShiftPerformanceItemDto,
  type SupplierPurchaseReportDto,
  type SupplierPurchaseReportItemDto,
} from '@istana-buah/shared';
import type { PrismaClient } from '@prisma/client';
import type { CacheConfig } from '../../config/cache.config';
import { CACHE_NAMESPACES, type CacheStore } from '../../lib/cache';
import { AppError } from '../../utils/app-error';
import {
  getCalendarYmdDashedInTimeZone,
  getMonthKeyInTimeZone,
  getWeekStartYmdInTimeZone,
  parseRangeBoundary,
  shiftYmdDashed,
} from '../../utils/date-helpers';
import { buildSalesReportPdf } from './pdf-report-builder';
import type {
  CashierPerformanceQuery,
  GrossProfitReportQuery,
  ProductPerformanceQuery,
  SalesExportFileResult,
  SalesExportQuery,
  SalesExportTransactionRow,
  SalesSummaryQuery,
  StockCurrentReportServiceQuery,
  SupplierPurchasesReportQuery,
} from './report.dto';
import { buildSalesCsvBuffer, buildSalesExcelBuffer } from './report-export-formatter';

export const REPORT_CACHE_NAMESPACE = CACHE_NAMESPACES.REPORTS;
const DEFAULT_REPORT_WINDOW_DAYS = 30;

interface DateWindow {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  startYmd: string;
  endYmd: string;
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

function formatMarginPercent(grossProfit: number, revenue: number): string {
  if (revenue <= 0) return '0.00';
  return ((grossProfit / revenue) * 100).toFixed(2);
}

function formatGrowthPercent(current: number, previous: number): string {
  if (Math.abs(previous) < 0.005) {
    if (current > 0) return '100.00';
    if (current < 0) return '-100.00';
    return '0.00';
  }
  return (((current - previous) / Math.abs(previous)) * 100).toFixed(2);
}

function formatStockDecimal(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function formatDateTimeLabel(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}

/**
 * Layanan Laporan Penjualan, Performa Produk, Valuasi Stok & Ekspor (M07-001).
 * Seluruh data agregasi hanya dapat diakses MANAGER & OWNER dan ter-cache Redis per namespace versi.
 */
export class ReportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore,
    private readonly cacheCfg: CacheConfig,
    private readonly timezone: string,
    private readonly storeName: string,
  ) {}

  private resolveDateWindow(startDate?: string, endDate?: string): DateWindow {
    const todayYmd = getCalendarYmdDashedInTimeZone(new Date(), this.timezone);
    const defaultStartYmd = shiftYmdDashed(todayYmd, -(DEFAULT_REPORT_WINDOW_DAYS - 1));

    const start = startDate
      ? parseRangeBoundary(startDate, 'start')
      : parseRangeBoundary(defaultStartYmd, 'start');
    const end = endDate ? parseRangeBoundary(endDate, 'end') : parseRangeBoundary(todayYmd, 'end');

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Rentang tanggal laporan tidak valid', 400);
    }
    if (start > end) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Tanggal awal tidak boleh melebihi tanggal akhir',
        400,
      );
    }

    return {
      start,
      end,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      startYmd: getCalendarYmdDashedInTimeZone(start, this.timezone),
      endYmd: getCalendarYmdDashedInTimeZone(end, this.timezone),
    };
  }

  private resolveBucketKey(date: Date, groupBy: ReportGroupBy): string {
    if (groupBy === 'week') {
      return getWeekStartYmdInTimeZone(date, this.timezone);
    }
    if (groupBy === 'month') {
      return getMonthKeyInTimeZone(date, this.timezone);
    }
    return getCalendarYmdDashedInTimeZone(date, this.timezone);
  }

  private async readJsonCache<T>(key: string): Promise<T | null> {
    const raw = await this.cache.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private async writeJsonCache(key: string, payload: unknown): Promise<void> {
    await this.cache.set(key, JSON.stringify(payload), this.cacheCfg.productTtlSeconds);
  }

  private async getCompositeAdvancedVersion(): Promise<string> {
    const [r, w, s, d] = await Promise.all([
      this.cache.getVersion(CACHE_NAMESPACES.REPORTS),
      this.cache.getVersion(CACHE_NAMESPACES.WASTE),
      this.cache.getVersion(CACHE_NAMESPACES.SUPPLIERS),
      this.cache.getVersion(CACHE_NAMESPACES.DASHBOARD),
    ]);
    return `v${r}:${w}:${s}:${d}`;
  }

  /**
   * Ringkasan omzet, jumlah transaksi, COGS/HPP, laba kotor, metode bayar, dan timeline periodik.
   */
  async getSalesSummary(query: SalesSummaryQuery): Promise<SalesSummaryReportDto> {
    const window = this.resolveDateWindow(query.startDate, query.endDate);
    const groupBy: ReportGroupBy = query.groupBy ?? 'day';

    const version = await this.cache.getVersion(REPORT_CACHE_NAMESPACE);
    const cacheKey = `${REPORT_CACHE_NAMESPACE}:v${version}:sales-summary:${window.startIso}:${window.endIso}:${groupBy}`;
    const cached = await this.readJsonCache<SalesSummaryReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const rows = await this.prisma.transaction.findMany({
      where: {
        transactedAt: { gte: window.start, lte: window.end },
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
            quantity: true,
            unitCost: true,
          },
        },
      },
      orderBy: { transactedAt: 'asc' },
    });

    let totalRevenue = 0;
    let totalCostOfGoodsSold = 0;
    let totalTransactions = 0;
    let voidedTransactions = 0;

    const paymentMap = new Map<PaymentMethod, { revenue: number; transactions: number }>();
    const timelineMap = new Map<
      string,
      { revenue: number; costOfGoodsSold: number; transactions: number }
    >();

    for (const row of rows) {
      if (row.status === 'VOIDED') {
        voidedTransactions += 1;
        continue;
      }

      const txRevenue = Number(row.totalAmount);
      const txCogs = row.items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
        0,
      );

      totalRevenue += txRevenue;
      totalCostOfGoodsSold += txCogs;
      totalTransactions += 1;

      const method = row.paymentMethod as PaymentMethod;
      const pmEntry = paymentMap.get(method) ?? { revenue: 0, transactions: 0 };
      pmEntry.revenue += txRevenue;
      pmEntry.transactions += 1;
      paymentMap.set(method, pmEntry);

      const bucketKey = this.resolveBucketKey(row.transactedAt, groupBy);
      const bucket = timelineMap.get(bucketKey) ?? {
        revenue: 0,
        costOfGoodsSold: 0,
        transactions: 0,
      };
      bucket.revenue += txRevenue;
      bucket.costOfGoodsSold += txCogs;
      bucket.transactions += 1;
      timelineMap.set(bucketKey, bucket);
    }

    const grossProfit = totalRevenue - totalCostOfGoodsSold;
    const avgTransactionValue = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    const paymentBreakdown: PaymentBreakdownPointDto[] = Array.from(paymentMap.entries())
      .map(([paymentMethod, stats]) => ({
        paymentMethod,
        revenue: formatMoney(stats.revenue),
        transactions: stats.transactions,
      }))
      .sort((a, b) => Number(b.revenue) - Number(a.revenue));

    const timeline: SalesTimelinePointDto[] = Array.from(timelineMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, stats]) => ({
        date,
        revenue: formatMoney(stats.revenue),
        costOfGoodsSold: formatMoney(stats.costOfGoodsSold),
        grossProfit: formatMoney(stats.revenue - stats.costOfGoodsSold),
        transactions: stats.transactions,
      }));

    const result: SalesSummaryReportDto = {
      startDate: window.startIso,
      endDate: window.endIso,
      groupBy,
      totalRevenue: formatMoney(totalRevenue),
      totalTransactions,
      voidedTransactions,
      avgTransactionValue: formatMoney(avgTransactionValue),
      totalCostOfGoodsSold: formatMoney(totalCostOfGoodsSold),
      grossProfit: formatMoney(grossProfit),
      profitMargin: formatMarginPercent(grossProfit, totalRevenue),
      paymentBreakdown,
      timeline,
    };

    await this.writeJsonCache(cacheKey, result);
    return result;
  }

  /**
   * Peringkat produk terlaris berdasarkan omzet penjualan (`revenue`) atau kuantitas terjual (`qty`).
   */
  async getProductPerformance(
    query: ProductPerformanceQuery,
  ): Promise<ProductPerformanceReportDto> {
    const window = this.resolveDateWindow(query.startDate, query.endDate);
    const sortBy = query.sortBy ?? 'revenue';
    const limit = query.limit ?? 10;

    const version = await this.cache.getVersion(REPORT_CACHE_NAMESPACE);
    const cacheKey = `${REPORT_CACHE_NAMESPACE}:v${version}:product-performance:${window.startIso}:${window.endIso}:${sortBy}:${limit}`;
    const cached = await this.readJsonCache<ProductPerformanceReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const transactions = await this.prisma.transaction.findMany({
      where: {
        transactedAt: { gte: window.start, lte: window.end },
        status: 'COMPLETED',
      },
      select: {
        id: true,
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
                category: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    const accumulator = new Map<
      string,
      {
        productId: string;
        productName: string;
        productType: 'WEIGHT' | 'UNIT';
        categoryName: string;
        totalQuantity: number;
        totalRevenue: number;
        totalCost: number;
        txIds: Set<string>;
      }
    >();

    for (const tx of transactions) {
      for (const item of tx.items) {
        const entry = accumulator.get(item.productId) ?? {
          productId: item.productId,
          productName: item.productName,
          productType: item.productType,
          categoryName: item.product?.category?.name ?? 'Tanpa Kategori',
          totalQuantity: 0,
          totalRevenue: 0,
          totalCost: 0,
          txIds: new Set<string>(),
        };

        const qty = Number(item.quantity);
        entry.totalQuantity += qty;
        entry.totalRevenue += Number(item.lineTotal);
        entry.totalCost += qty * Number(item.unitCost);
        entry.txIds.add(tx.id);
        accumulator.set(item.productId, entry);
      }
    }

    const sorted = Array.from(accumulator.values()).sort((a, b) => {
      if (sortBy === 'qty') {
        return b.totalQuantity - a.totalQuantity || b.totalRevenue - a.totalRevenue;
      }
      return b.totalRevenue - a.totalRevenue || b.totalQuantity - a.totalQuantity;
    });

    const items: ProductPerformanceItemDto[] = sorted.slice(0, limit).map((entry) => {
      const grossProfit = entry.totalRevenue - entry.totalCost;
      return {
        productId: entry.productId,
        productName: entry.productName,
        productType: entry.productType,
        categoryName: entry.categoryName,
        totalQuantity: formatStockDecimal(entry.totalQuantity),
        totalRevenue: formatMoney(entry.totalRevenue),
        totalCost: formatMoney(entry.totalCost),
        grossProfit: formatMoney(grossProfit),
        profitMargin: formatMarginPercent(grossProfit, entry.totalRevenue),
        transactionCount: entry.txIds.size,
      };
    });

    const result: ProductPerformanceReportDto = {
      startDate: window.startIso,
      endDate: window.endIso,
      sortBy,
      items,
    };

    await this.writeJsonCache(cacheKey, result);
    return result;
  }

  /**
   * Posisi stok produk saat ini beserta valuasi modal (HPP) dan nilai jual ritel.
   */
  async getCurrentStock(
    query: StockCurrentReportServiceQuery = {},
  ): Promise<CurrentStockReportDto> {
    const version = await this.cache.getVersion(REPORT_CACHE_NAMESPACE);
    const cacheKey = `${REPORT_CACHE_NAMESPACE}:v${version}:stock-current:${query.categoryId ?? 'all'}:${query.lowStockOnly ? '1' : '0'}:${query.search ?? ''}`;
    const cached = await this.readJsonCache<CurrentStockReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ stockQty: 'asc' }, { name: 'asc' }],
    });

    let totalStockCostValue = 0;
    let totalStockRetailValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const mappedItems: CurrentStockItemDto[] = [];

    for (const product of products) {
      const stockNum = Number(product.stockQty);
      const minNum = product.minStockAlert !== null ? Number(product.minStockAlert) : null;
      const isOutOfStock = stockNum <= 0;
      const isLowStock = minNum !== null && stockNum <= minNum;

      if (query.lowStockOnly && !isLowStock && !isOutOfStock) {
        continue;
      }

      const unitCost = Number(
        product.productType === 'WEIGHT' ? (product.costPerKg ?? 0) : (product.costPerUnit ?? 0),
      );
      const unitPrice = Number(
        product.productType === 'WEIGHT' ? (product.pricePerKg ?? 0) : (product.pricePerUnit ?? 0),
      );

      const safeStockForValuation = Math.max(0, stockNum);
      const stockCostValue = safeStockForValuation * unitCost;
      const stockRetailValue = safeStockForValuation * unitPrice;

      totalStockCostValue += stockCostValue;
      totalStockRetailValue += stockRetailValue;
      if (isOutOfStock) outOfStockCount += 1;
      if (isLowStock) lowStockCount += 1;

      mappedItems.push({
        id: product.id,
        name: product.name,
        categoryId: product.categoryId,
        categoryName: product.category.name,
        productType: product.productType,
        stockQty: formatStockDecimal(stockNum),
        minStockAlert: minNum !== null ? formatStockDecimal(minNum) : null,
        unitCost: formatMoney(unitCost),
        unitPrice: formatMoney(unitPrice),
        stockCostValue: formatMoney(stockCostValue),
        stockRetailValue: formatMoney(stockRetailValue),
        isLowStock,
        isOutOfStock,
        isActive: product.isActive,
      });
    }

    const result: CurrentStockReportDto = {
      generatedAt: new Date().toISOString(),
      totalProducts: mappedItems.length,
      lowStockCount,
      outOfStockCount,
      totalStockCostValue: formatMoney(totalStockCostValue),
      totalStockRetailValue: formatMoney(totalStockRetailValue),
      items: mappedItems,
    };

    await this.writeJsonCache(cacheKey, result);
    return result;
  }

  /**
   * Mengekspor laporan penjualan periode tertentu dalam format CSV, Excel (.xls), atau PDF.
   */
  async exportSalesReport(query: SalesExportQuery): Promise<SalesExportFileResult> {
    const window = this.resolveDateWindow(query.startDate, query.endDate);
    const summary = await this.getSalesSummary({
      startDate: query.startDate,
      endDate: query.endDate,
      groupBy: 'day',
    });

    const transactions = await this.prisma.transaction.findMany({
      where: {
        transactedAt: { gte: window.start, lte: window.end },
        status: { in: ['COMPLETED', 'VOIDED'] },
      },
      orderBy: { transactedAt: 'asc' },
      select: {
        transactionNo: true,
        status: true,
        paymentMethod: true,
        discountAmount: true,
        totalAmount: true,
        transactedAt: true,
        cashier: { select: { fullName: true } },
        items: { select: { quantity: true, unitCost: true } },
      },
    });

    const exportRows: SalesExportTransactionRow[] = transactions.map((tx) => {
      const revenue = Number(tx.totalAmount);
      const cogs = tx.items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
        0,
      );
      const grossProfit = tx.status === 'VOIDED' ? 0 : revenue - cogs;
      return {
        transactionNo: tx.transactionNo,
        transactedAtLabel: formatDateTimeLabel(tx.transactedAt, this.timezone),
        cashierName: tx.cashier.fullName,
        paymentMethod: tx.paymentMethod,
        status: tx.status,
        discountAmount: formatMoney(Number(tx.discountAmount)),
        totalAmount: formatMoney(revenue),
        costOfGoodsSold: formatMoney(cogs),
        grossProfit: formatMoney(grossProfit),
      };
    });

    const safeStart = window.startYmd.replace(/[^0-9A-Za-z_-]/g, '');
    const safeEnd = window.endYmd.replace(/[^0-9A-Za-z_-]/g, '');
    const baseName = `laporan-penjualan-${safeStart}-${safeEnd}`;
    const periodLabel = `${window.startYmd} s/d ${window.endYmd}`;

    if (query.format === 'pdf') {
      return {
        filename: `${baseName}.pdf`,
        mimeType: 'application/pdf',
        content: buildSalesReportPdf({
          storeName: this.storeName,
          periodLabel,
          printedAtLabel: formatDateTimeLabel(new Date(), this.timezone),
          summary,
          rows: exportRows,
        }),
      };
    }

    if (query.format === 'excel') {
      return {
        filename: `${baseName}.xls`,
        mimeType: 'application/vnd.ms-excel; charset=utf-8',
        content: buildSalesExcelBuffer({
          storeName: this.storeName,
          periodLabel,
          summary,
          rows: exportRows,
        }),
      };
    }

    return {
      filename: `${baseName}.csv`,
      mimeType: 'text/csv; charset=utf-8',
      content: buildSalesCsvBuffer({
        storeName: this.storeName,
        periodLabel,
        summary,
        rows: exportRows,
      }),
    };
  }

  /**
   * Laporan Keuntungan Kotor Bersih (Penjualan - HPP - Penyusutan) beserta komparasi periode (M12-001 / FR-RPT-03).
   */
  async getGrossProfitReport(query: GrossProfitReportQuery): Promise<GrossProfitReportDto> {
    const window = this.resolveDateWindow(query.startDate, query.endDate);
    const groupBy: ReportGroupBy = query.groupBy ?? 'day';

    const compositeVer = await this.getCompositeAdvancedVersion();
    const cacheKey = `${REPORT_CACHE_NAMESPACE}:${compositeVer}:gross-profit:${window.startIso}:${window.endIso}:${groupBy}`;
    const cached = await this.readJsonCache<GrossProfitReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const daySpanCount = Math.max(
      1,
      Math.round((window.end.getTime() - window.start.getTime()) / (24 * 60 * 60 * 1000)),
    );
    const prevEndYmd = shiftYmdDashed(window.startYmd, -1);
    const prevStartYmd = shiftYmdDashed(window.startYmd, -daySpanCount);
    const prevStart = parseRangeBoundary(prevStartYmd, 'start');
    const prevEnd = parseRangeBoundary(prevEndYmd, 'end');

    const [currentTxs, currentWastes, prevTxs, prevWastes] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          transactedAt: { gte: window.start, lte: window.end },
          status: 'COMPLETED',
        },
        select: {
          totalAmount: true,
          transactedAt: true,
          items: { select: { quantity: true, unitCost: true } },
        },
        orderBy: { transactedAt: 'asc' },
      }),
      this.prisma.wasteRecord
        ? this.prisma.wasteRecord.findMany({
            where: { recordedAt: { gte: window.start, lte: window.end } },
            select: { estimatedCost: true, recordedAt: true },
            orderBy: { recordedAt: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.transaction.findMany({
        where: {
          transactedAt: { gte: prevStart, lte: prevEnd },
          status: 'COMPLETED',
        },
        select: {
          totalAmount: true,
          items: { select: { quantity: true, unitCost: true } },
        },
      }),
      this.prisma.wasteRecord
        ? this.prisma.wasteRecord.findMany({
            where: { recordedAt: { gte: prevStart, lte: prevEnd } },
            select: { estimatedCost: true },
          })
        : Promise.resolve([]),
    ]);

    let totalRevenue = 0;
    let totalCostOfGoodsSold = 0;
    const timelineMap = new Map<
      string,
      { revenue: number; costOfGoodsSold: number; wasteLoss: number; transactions: number }
    >();

    for (const tx of currentTxs) {
      const rev = Number(tx.totalAmount);
      const cogs = tx.items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
        0,
      );
      totalRevenue += rev;
      totalCostOfGoodsSold += cogs;

      const bucketKey = this.resolveBucketKey(tx.transactedAt, groupBy);
      const bucket = timelineMap.get(bucketKey) ?? {
        revenue: 0,
        costOfGoodsSold: 0,
        wasteLoss: 0,
        transactions: 0,
      };
      bucket.revenue += rev;
      bucket.costOfGoodsSold += cogs;
      bucket.transactions += 1;
      timelineMap.set(bucketKey, bucket);
    }

    let totalWasteLoss = 0;
    for (const waste of currentWastes) {
      const loss = Number(waste.estimatedCost);
      totalWasteLoss += loss;
      const bucketKey = this.resolveBucketKey(waste.recordedAt, groupBy);
      const bucket = timelineMap.get(bucketKey) ?? {
        revenue: 0,
        costOfGoodsSold: 0,
        wasteLoss: 0,
        transactions: 0,
      };
      bucket.wasteLoss += loss;
      timelineMap.set(bucketKey, bucket);
    }

    const grossProfitBeforeWaste = totalRevenue - totalCostOfGoodsSold;
    const netGrossProfit = grossProfitBeforeWaste - totalWasteLoss;

    let prevRevenue = 0;
    let prevCogs = 0;
    for (const tx of prevTxs) {
      prevRevenue += Number(tx.totalAmount);
      prevCogs += tx.items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.unitCost),
        0,
      );
    }
    const prevWasteLoss = prevWastes.reduce((sum, w) => sum + Number(w.estimatedCost), 0);
    const prevNetGrossProfit = prevRevenue - prevCogs - prevWasteLoss;

    const timeline: GrossProfitTimelinePointDto[] = Array.from(timelineMap.entries())
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .map(([date, stats]) => {
        const gpBefore = stats.revenue - stats.costOfGoodsSold;
        const netGp = gpBefore - stats.wasteLoss;
        return {
          date,
          revenue: formatMoney(stats.revenue),
          costOfGoodsSold: formatMoney(stats.costOfGoodsSold),
          grossProfitBeforeWaste: formatMoney(gpBefore),
          wasteLoss: formatMoney(stats.wasteLoss),
          netGrossProfit: formatMoney(netGp),
          netMarginPercent: formatMarginPercent(netGp, stats.revenue),
          transactions: stats.transactions,
        };
      });

    const result: GrossProfitReportDto = {
      startDate: window.startIso,
      endDate: window.endIso,
      groupBy,
      totalRevenue: formatMoney(totalRevenue),
      totalCostOfGoodsSold: formatMoney(totalCostOfGoodsSold),
      grossProfitBeforeWaste: formatMoney(grossProfitBeforeWaste),
      grossMarginBeforeWaste: formatMarginPercent(grossProfitBeforeWaste, totalRevenue),
      totalWasteLoss: formatMoney(totalWasteLoss),
      netGrossProfit: formatMoney(netGrossProfit),
      netProfitMargin: formatMarginPercent(netGrossProfit, totalRevenue),
      totalTransactions: currentTxs.length,
      wasteRecordsCount: currentWastes.length,
      comparison: {
        previousStartDate: prevStart.toISOString(),
        previousEndDate: prevEnd.toISOString(),
        previousRevenue: formatMoney(prevRevenue),
        previousCostOfGoodsSold: formatMoney(prevCogs),
        previousWasteLoss: formatMoney(prevWasteLoss),
        previousNetGrossProfit: formatMoney(prevNetGrossProfit),
        revenueGrowthPercent: formatGrowthPercent(totalRevenue, prevRevenue),
        netProfitGrowthPercent: formatGrowthPercent(netGrossProfit, prevNetGrossProfit),
      },
      timeline,
    };

    await this.writeJsonCache(cacheKey, result);
    return result;
  }

  /**
   * Laporan Performa per Kasir dan Riwayat Shift Operasional (M12-001 / FR-RPT-07).
   */
  async getCashierPerformance(
    query: CashierPerformanceQuery,
  ): Promise<CashierPerformanceReportDto> {
    const window = this.resolveDateWindow(query.startDate, query.endDate);
    const compositeVer = await this.getCompositeAdvancedVersion();
    const cacheKey = `${REPORT_CACHE_NAMESPACE}:${compositeVer}:cashier-perf:${window.startIso}:${window.endIso}:${query.cashierId ?? 'all'}`;
    const cached = await this.readJsonCache<CashierPerformanceReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const [transactions, shifts] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          transactedAt: { gte: window.start, lte: window.end },
          status: { in: ['COMPLETED', 'VOIDED'] },
          ...(query.cashierId ? { cashierId: query.cashierId } : {}),
        },
        select: {
          id: true,
          cashierId: true,
          status: true,
          totalAmount: true,
          paymentMethod: true,
          cashier: { select: { id: true, fullName: true, username: true } },
        },
      }),
      this.prisma.shift
        ? this.prisma.shift.findMany({
            where: {
              openedAt: { gte: window.start, lte: window.end },
              ...(query.cashierId ? { userId: query.cashierId } : {}),
            },
            include: {
              user: { select: { id: true, fullName: true, username: true } },
              transactions: {
                where: { status: 'COMPLETED' },
                select: { totalAmount: true },
              },
            },
            orderBy: { openedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const cashierMap = new Map<
      string,
      {
        cashierId: string;
        cashierName: string;
        username: string;
        completedTransactions: number;
        voidedTransactions: number;
        totalRevenue: number;
        cashRevenue: number;
        qrisRevenue: number;
        bankTransferRevenue: number;
        shiftsCount: number;
        totalCashDifference: number;
      }
    >();

    const ensureCashierEntry = (id: string, fullName: string, username: string) => {
      let entry = cashierMap.get(id);
      if (!entry) {
        entry = {
          cashierId: id,
          cashierName: fullName,
          username,
          completedTransactions: 0,
          voidedTransactions: 0,
          totalRevenue: 0,
          cashRevenue: 0,
          qrisRevenue: 0,
          bankTransferRevenue: 0,
          shiftsCount: 0,
          totalCashDifference: 0,
        };
        cashierMap.set(id, entry);
      }
      return entry;
    };

    let totalRevenue = 0;
    let totalTransactions = 0;
    let totalVoidedTransactions = 0;

    for (const tx of transactions) {
      const entry = ensureCashierEntry(
        tx.cashierId,
        tx.cashier.fullName,
        tx.cashier.username ?? 'kasir',
      );
      if (tx.status === 'VOIDED') {
        entry.voidedTransactions += 1;
        totalVoidedTransactions += 1;
        continue;
      }
      const amount = Number(tx.totalAmount);
      entry.completedTransactions += 1;
      entry.totalRevenue += amount;
      totalTransactions += 1;
      totalRevenue += amount;

      if (tx.paymentMethod === 'CASH') {
        entry.cashRevenue += amount;
      } else if (tx.paymentMethod === 'QRIS') {
        entry.qrisRevenue += amount;
      } else if (tx.paymentMethod === 'BANK_TRANSFER') {
        entry.bankTransferRevenue += amount;
      }
    }

    let totalCashDifference = 0;
    const shiftItems: ShiftPerformanceItemDto[] = [];

    for (const shift of shifts) {
      const entry = ensureCashierEntry(shift.userId, shift.user.fullName, shift.user.username);
      entry.shiftsCount += 1;

      const diff = shift.cashDifference !== null ? Number(shift.cashDifference) : 0;
      entry.totalCashDifference += diff;
      totalCashDifference += diff;

      const liveTxCount = shift.transactions.length;
      const liveSalesSum = shift.transactions.reduce((sum, t) => sum + Number(t.totalAmount), 0);
      const effectiveSales = Number(shift.totalSales) > 0 ? Number(shift.totalSales) : liveSalesSum;
      const effectiveTxCount = shift.totalTransactions > 0 ? shift.totalTransactions : liveTxCount;

      shiftItems.push({
        shiftId: shift.id,
        shiftNo: shift.shiftNo,
        cashierId: shift.userId,
        cashierName: shift.user.fullName,
        status: shift.status,
        openedAt: shift.openedAt.toISOString(),
        closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
        openingCash: formatMoney(Number(shift.openingCash)),
        expectedCash: shift.expectedCash !== null ? formatMoney(Number(shift.expectedCash)) : null,
        closingCash: shift.closingCash !== null ? formatMoney(Number(shift.closingCash)) : null,
        cashDifference:
          shift.cashDifference !== null ? formatMoney(Number(shift.cashDifference)) : null,
        totalSales: formatMoney(effectiveSales),
        totalTransactions: effectiveTxCount,
      });
    }

    const cashiers: CashierPerformanceItemDto[] = Array.from(cashierMap.values())
      .sort(
        (a, b) =>
          b.totalRevenue - a.totalRevenue || b.completedTransactions - a.completedTransactions,
      )
      .map((entry) => ({
        cashierId: entry.cashierId,
        cashierName: entry.cashierName,
        username: entry.username,
        completedTransactions: entry.completedTransactions,
        voidedTransactions: entry.voidedTransactions,
        totalRevenue: formatMoney(entry.totalRevenue),
        avgTransactionValue: formatMoney(
          entry.completedTransactions > 0 ? entry.totalRevenue / entry.completedTransactions : 0,
        ),
        cashRevenue: formatMoney(entry.cashRevenue),
        qrisRevenue: formatMoney(entry.qrisRevenue),
        bankTransferRevenue: formatMoney(entry.bankTransferRevenue),
        shiftsCount: entry.shiftsCount,
        totalCashDifference: formatMoney(entry.totalCashDifference),
      }));

    const result: CashierPerformanceReportDto = {
      startDate: window.startIso,
      endDate: window.endIso,
      totalRevenue: formatMoney(totalRevenue),
      totalTransactions,
      totalVoidedTransactions,
      totalShifts: shiftItems.length,
      totalCashDifference: formatMoney(totalCashDifference),
      cashiers,
      shifts: shiftItems,
    };

    await this.writeJsonCache(cacheKey, result);
    return result;
  }

  /**
   * Laporan Pembelian & Hutang Purchase Order per Supplier (M12-001).
   */
  async getSupplierPurchases(
    query: SupplierPurchasesReportQuery,
  ): Promise<SupplierPurchaseReportDto> {
    const window = this.resolveDateWindow(query.startDate, query.endDate);
    const compositeVer = await this.getCompositeAdvancedVersion();
    const cacheKey = `${REPORT_CACHE_NAMESPACE}:${compositeVer}:supplier-purchases:${window.startIso}:${window.endIso}:${query.supplierId ?? 'all'}`;
    const cached = await this.readJsonCache<SupplierPurchaseReportDto>(cacheKey);
    if (cached) {
      return cached;
    }

    const orders = this.prisma.purchaseOrder
      ? await this.prisma.purchaseOrder.findMany({
          where: {
            createdAt: { gte: window.start, lte: window.end },
            status: { not: 'CANCELLED' },
            ...(query.supplierId ? { supplierId: query.supplierId } : {}),
          },
          include: {
            supplier: {
              select: { id: true, name: true, contactPerson: true, phoneNumber: true },
            },
            items: {
              select: { quantity: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    const supplierMap = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        contactPerson: string | null;
        phone: string | null;
        orderCount: number;
        receivedOrderCount: number;
        totalItemsPurchased: number;
        totalPurchaseAmount: number;
        totalPaidAmount: number;
        outstandingDebt: number;
        lastOrderDate: Date | null;
      }
    >();

    let totalOrders = 0;
    let receivedOrders = 0;
    let totalPurchaseAmount = 0;
    let totalPaidAmount = 0;
    let totalOutstandingDebt = 0;

    for (const po of orders) {
      const entry = supplierMap.get(po.supplierId) ?? {
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        contactPerson: po.supplier.contactPerson,
        phone: po.supplier.phoneNumber,
        orderCount: 0,
        receivedOrderCount: 0,
        totalItemsPurchased: 0,
        totalPurchaseAmount: 0,
        totalPaidAmount: 0,
        outstandingDebt: 0,
        lastOrderDate: null,
      };

      const poTotal = Number(po.totalAmount);
      const poPaid = Number(po.paidAmount);
      const poDebt = Math.max(0, poTotal - poPaid);
      const itemQtySum = po.items.reduce((sum, item) => sum + Number(item.quantity), 0);

      entry.orderCount += 1;
      if (po.status === 'RECEIVED') {
        entry.receivedOrderCount += 1;
        receivedOrders += 1;
      }
      entry.totalItemsPurchased += itemQtySum;
      entry.totalPurchaseAmount += poTotal;
      entry.totalPaidAmount += poPaid;
      entry.outstandingDebt += poDebt;
      if (!entry.lastOrderDate || po.createdAt > entry.lastOrderDate) {
        entry.lastOrderDate = po.createdAt;
      }

      supplierMap.set(po.supplierId, entry);

      totalOrders += 1;
      totalPurchaseAmount += poTotal;
      totalPaidAmount += poPaid;
      totalOutstandingDebt += poDebt;
    }

    const suppliers: SupplierPurchaseReportItemDto[] = Array.from(supplierMap.values())
      .sort((a, b) => b.totalPurchaseAmount - a.totalPurchaseAmount)
      .map((entry) => ({
        supplierId: entry.supplierId,
        supplierName: entry.supplierName,
        contactPerson: entry.contactPerson,
        phone: entry.phone,
        orderCount: entry.orderCount,
        receivedOrderCount: entry.receivedOrderCount,
        totalItemsPurchased: formatStockDecimal(entry.totalItemsPurchased),
        totalPurchaseAmount: formatMoney(entry.totalPurchaseAmount),
        totalPaidAmount: formatMoney(entry.totalPaidAmount),
        outstandingDebt: formatMoney(entry.outstandingDebt),
        lastOrderDate: entry.lastOrderDate ? entry.lastOrderDate.toISOString() : null,
      }));

    const result: SupplierPurchaseReportDto = {
      startDate: window.startIso,
      endDate: window.endIso,
      totalOrders,
      receivedOrders,
      totalPurchaseAmount: formatMoney(totalPurchaseAmount),
      totalPaidAmount: formatMoney(totalPaidAmount),
      totalOutstandingDebt: formatMoney(totalOutstandingDebt),
      suppliers,
    };

    await this.writeJsonCache(cacheKey, result);
    return result;
  }
}
