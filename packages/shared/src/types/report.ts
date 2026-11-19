import type { PaymentMethod, ProductType, ShiftStatus } from '../constants/enums';

export type ReportGroupBy = 'day' | 'week' | 'month';
export type ProductPerformanceSortBy = 'revenue' | 'qty';
export type SalesExportFormat = 'csv' | 'excel' | 'pdf';
export type ReportExportType =
  | 'sales'
  | 'gross-profit'
  | 'cashier-performance'
  | 'supplier-purchases'
  | 'stock-current'
  | 'waste-summary';

export interface SalesTimelinePointDto {
  date: string;
  revenue: string;
  costOfGoodsSold: string;
  grossProfit: string;
  transactions: number;
}

export interface PaymentBreakdownPointDto {
  paymentMethod: PaymentMethod;
  revenue: string;
  transactions: number;
}

export interface SalesSummaryReportDto {
  startDate: string;
  endDate: string;
  groupBy: ReportGroupBy;
  totalRevenue: string;
  totalTransactions: number;
  voidedTransactions: number;
  avgTransactionValue: string;
  totalCostOfGoodsSold: string;
  grossProfit: string;
  profitMargin: string;
  paymentBreakdown: PaymentBreakdownPointDto[];
  timeline: SalesTimelinePointDto[];
}

export interface ProductPerformanceItemDto {
  productId: string;
  productName: string;
  productType: ProductType;
  categoryName: string;
  totalQuantity: string;
  totalRevenue: string;
  totalCost: string;
  grossProfit: string;
  profitMargin: string;
  transactionCount: number;
}

export interface ProductPerformanceReportDto {
  startDate: string;
  endDate: string;
  sortBy: ProductPerformanceSortBy;
  items: ProductPerformanceItemDto[];
}

export interface CurrentStockItemDto {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  productType: ProductType;
  stockQty: string;
  minStockAlert: string | null;
  unitCost: string;
  unitPrice: string;
  stockCostValue: string;
  stockRetailValue: string;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isActive: boolean;
}

export interface CurrentStockReportDto {
  generatedAt: string;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  totalStockCostValue: string;
  totalStockRetailValue: string;
  items: CurrentStockItemDto[];
}

export interface GrossProfitTimelinePointDto {
  date: string;
  revenue: string;
  costOfGoodsSold: string;
  grossProfitBeforeWaste: string;
  wasteLoss: string;
  netGrossProfit: string;
  netMarginPercent: string;
  transactions: number;
}

export interface PeriodComparisonSummaryDto {
  previousStartDate: string;
  previousEndDate: string;
  previousRevenue: string;
  previousCostOfGoodsSold: string;
  previousWasteLoss: string;
  previousNetGrossProfit: string;
  revenueGrowthPercent: string;
  netProfitGrowthPercent: string;
}

export interface GrossProfitReportDto {
  startDate: string;
  endDate: string;
  groupBy: ReportGroupBy;
  totalRevenue: string;
  totalCostOfGoodsSold: string;
  grossProfitBeforeWaste: string;
  grossMarginBeforeWaste: string;
  totalWasteLoss: string;
  netGrossProfit: string;
  netProfitMargin: string;
  totalTransactions: number;
  wasteRecordsCount: number;
  comparison: PeriodComparisonSummaryDto;
  timeline: GrossProfitTimelinePointDto[];
}

export interface CashierPerformanceItemDto {
  cashierId: string;
  cashierName: string;
  username: string;
  completedTransactions: number;
  voidedTransactions: number;
  totalRevenue: string;
  avgTransactionValue: string;
  cashRevenue: string;
  qrisRevenue: string;
  bankTransferRevenue: string;
  shiftsCount: number;
  totalCashDifference: string;
}

export interface ShiftPerformanceItemDto {
  shiftId: string;
  shiftNo: string;
  cashierId: string;
  cashierName: string;
  status: ShiftStatus;
  openedAt: string;
  closedAt: string | null;
  openingCash: string;
  expectedCash: string | null;
  closingCash: string | null;
  cashDifference: string | null;
  totalSales: string;
  totalTransactions: number;
}

export interface CashierPerformanceReportDto {
  startDate: string;
  endDate: string;
  totalRevenue: string;
  totalTransactions: number;
  totalVoidedTransactions: number;
  totalShifts: number;
  totalCashDifference: string;
  cashiers: CashierPerformanceItemDto[];
  shifts: ShiftPerformanceItemDto[];
}

export interface SupplierPurchaseReportItemDto {
  supplierId: string;
  supplierName: string;
  contactPerson: string | null;
  phone: string | null;
  orderCount: number;
  receivedOrderCount: number;
  totalItemsPurchased: string;
  totalPurchaseAmount: string;
  totalPaidAmount: string;
  outstandingDebt: string;
  lastOrderDate: string | null;
}

export interface SupplierPurchaseReportDto {
  startDate: string;
  endDate: string;
  totalOrders: number;
  receivedOrders: number;
  totalPurchaseAmount: string;
  totalPaidAmount: string;
  totalOutstandingDebt: string;
  suppliers: SupplierPurchaseReportItemDto[];
}
