export {
  PRODUCT_PERFORMANCE_SORT_VALUES,
  REPORT_GROUP_BY_VALUES,
  SALES_EXPORT_FORMATS,
  productPerformanceQuerySchema,
  salesExportQuerySchema,
  salesSummaryQuerySchema,
  stockCurrentReportQuerySchema,
  type ProductPerformanceQuery,
  type SalesExportQuery,
  type SalesSummaryQuery,
  type StockCurrentReportQuery,
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
