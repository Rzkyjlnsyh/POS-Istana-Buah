import type {
  PaymentBreakdownPointDto,
  ProductPerformanceItemDto,
  SalesTimelinePointDto,
} from './report';
import type { LowStockAlertItemDto } from './stock';

export interface DashboardDayMetricsDto {
  revenue: string;
  transactions: number;
  voidedTransactions: number;
  avgTransactionValue: string;
  costOfGoodsSold: string;
  grossProfit: string;
  profitMargin: string;
}

export interface DashboardComparisonDto {
  revenueChangeAmount: string;
  revenueChangePercent: string | null;
  transactionsChangeCount: number;
  transactionsChangePercent: string | null;
}

export interface DashboardOpenShiftItemDto {
  id: string;
  shiftNo: string;
  cashierName: string;
  openedAt: string;
  totalSales: string;
  totalTransactions: number;
}

export interface DashboardSummaryDto {
  generatedAt: string;
  todayDate: string;
  yesterdayDate: string;
  today: DashboardDayMetricsDto;
  yesterday: DashboardDayMetricsDto;
  comparison: DashboardComparisonDto;
  openShifts: {
    count: number;
    items: DashboardOpenShiftItemDto[];
  };
  lowStock: {
    totalCount: number;
    outOfStockCount: number;
    items: LowStockAlertItemDto[];
  };
  topProductsToday: ProductPerformanceItemDto[];
  unpaidPurchaseOrders: {
    count: number;
    totalOutstandingDebt: string;
  };
  todayWaste: {
    count: number;
    totalEstimatedCost: string;
  };
}

export interface DashboardCategoryBreakdownDto {
  categoryId: string;
  categoryName: string;
  revenue: string;
  percentage: string;
}

export interface DashboardChartsDto {
  days: number;
  startDate: string;
  endDate: string;
  totalRevenue: string;
  totalGrossProfit: string;
  totalTransactions: number;
  timeline: SalesTimelinePointDto[];
  paymentBreakdown: PaymentBreakdownPointDto[];
  categoryBreakdown: DashboardCategoryBreakdownDto[];
}
