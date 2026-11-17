import type { PaymentMethod, ProductType } from '../constants/enums';

export type ReportGroupBy = 'day' | 'week' | 'month';
export type ProductPerformanceSortBy = 'revenue' | 'qty';
export type SalesExportFormat = 'csv' | 'excel' | 'pdf';

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
