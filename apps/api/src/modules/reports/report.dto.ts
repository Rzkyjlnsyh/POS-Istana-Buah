export {
  PRODUCT_PERFORMANCE_SORT_VALUES,
  REPORT_GROUP_BY_VALUES,
  SALES_EXPORT_FORMATS,
  cashierPerformanceQuerySchema,
  grossProfitReportQuerySchema,
  productPerformanceQuerySchema,
  salesExportQuerySchema,
  salesSummaryQuerySchema,
  stockCurrentReportQuerySchema,
  supplierPurchasesReportQuerySchema,
  type CashierPerformanceItemDto,
  type CashierPerformanceQuery,
  type CashierPerformanceReportDto,
  type GrossProfitReportDto,
  type GrossProfitReportQuery,
  type GrossProfitTimelinePointDto,
  type PeriodComparisonSummaryDto,
  type ProductPerformanceQuery,
  type SalesExportQuery,
  type SalesSummaryQuery,
  type ShiftPerformanceItemDto,
  type StockCurrentReportQuery,
  type SupplierPurchaseReportDto,
  type SupplierPurchaseReportItemDto,
  type SupplierPurchasesReportQuery,
} from '@istana-buah/shared';

export interface StockCurrentReportServiceQuery {
  categoryId?: string | undefined;
  lowStockOnly?: boolean | undefined;
  search?: string | undefined;
}

export interface SalesExportTransactionRow {
  transactionNo: string;
  transactedAtLabel: string;
  cashierName: string;
  paymentMethod: string;
  status: string;
  discountAmount: string;
  totalAmount: string;
  costOfGoodsSold: string;
  grossProfit: string;
}

export interface SalesExportFileResult {
  filename: string;
  mimeType: string;
  content: Buffer;
}
