import type {
  ApiSuccess,
  CashierPerformanceReportDto,
  CurrentStockReportDto,
  GrossProfitReportDto,
  ProductPerformanceReportDto,
  ProductPerformanceSortBy,
  ReportExportType,
  ReportGroupBy,
  SalesExportFormat,
  SalesSummaryReportDto,
  SupplierPurchaseReportDto,
} from '@istana-buah/shared';
import { apiClient } from '../../../lib/api/http-client';

export interface SalesSummaryRequestParams {
  startDate?: string;
  endDate?: string;
  groupBy?: ReportGroupBy;
}

export interface ProductPerformanceRequestParams {
  startDate?: string;
  endDate?: string;
  sortBy?: ProductPerformanceSortBy;
  limit?: number;
}

export interface StockCurrentRequestParams {
  categoryId?: string;
  lowStockOnly?: boolean;
  search?: string;
}

export interface SalesExportRequestParams {
  format: SalesExportFormat;
  startDate?: string;
  endDate?: string;
}

export interface ReportExportRequestParams {
  format: SalesExportFormat;
  startDate?: string;
  endDate?: string;
  groupBy?: ReportGroupBy;
  categoryId?: string;
  lowStockOnly?: boolean;
  search?: string;
  cashierId?: string;
  supplierId?: string;
}

export interface GrossProfitRequestParams {
  startDate?: string;
  endDate?: string;
  groupBy?: ReportGroupBy;
}

export interface CashierPerformanceRequestParams {
  startDate?: string;
  endDate?: string;
  cashierId?: string;
}

export interface SupplierPurchasesRequestParams {
  startDate?: string;
  endDate?: string;
  supplierId?: string;
}

const EXPORT_EXTENSION_MAP: Record<SalesExportFormat, string> = {
  csv: 'csv',
  excel: 'xlsx',
  pdf: 'pdf',
};

function parseFilenameFromDisposition(
  headerValue: string | undefined,
  fallbackFormat: SalesExportFormat,
  fallbackSlug = 'laporan-penjualan',
): string {
  if (headerValue) {
    const match = /filename="?([^";]+)"?/i.exec(headerValue);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return `${fallbackSlug}.${EXPORT_EXTENSION_MAP[fallbackFormat]}`;
}

export async function getSalesSummary(
  params?: SalesSummaryRequestParams,
): Promise<SalesSummaryReportDto> {
  const queryParams: Record<string, string> = {};
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.groupBy) queryParams.groupBy = params.groupBy;

  const response = await apiClient.get<ApiSuccess<SalesSummaryReportDto>>(
    '/reports/sales-summary',
    {
      params: queryParams,
    },
  );
  return response.data.data;
}

export async function getProductPerformance(
  params?: ProductPerformanceRequestParams,
): Promise<ProductPerformanceReportDto> {
  const queryParams: Record<string, string | number> = {};
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.sortBy) queryParams.sortBy = params.sortBy;
  if (params?.limit) queryParams.limit = params.limit;

  const response = await apiClient.get<ApiSuccess<ProductPerformanceReportDto>>(
    '/reports/product-performance',
    { params: queryParams },
  );
  return response.data.data;
}

export async function getCurrentStockReport(
  params?: StockCurrentRequestParams,
): Promise<CurrentStockReportDto> {
  const queryParams: Record<string, string> = {};
  if (params?.categoryId) queryParams.categoryId = params.categoryId;
  if (params?.lowStockOnly !== undefined) queryParams.lowStockOnly = String(params.lowStockOnly);
  if (params?.search) queryParams.search = params.search;

  const response = await apiClient.get<ApiSuccess<CurrentStockReportDto>>(
    '/reports/stock-current',
    {
      params: queryParams,
    },
  );
  return response.data.data;
}

export async function getGrossProfitReport(
  params?: GrossProfitRequestParams,
): Promise<GrossProfitReportDto> {
  const queryParams: Record<string, string> = {};
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.groupBy) queryParams.groupBy = params.groupBy;

  const response = await apiClient.get<ApiSuccess<GrossProfitReportDto>>('/reports/gross-profit', {
    params: queryParams,
  });
  return response.data.data;
}

export async function getCashierPerformanceReport(
  params?: CashierPerformanceRequestParams,
): Promise<CashierPerformanceReportDto> {
  const queryParams: Record<string, string> = {};
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.cashierId) queryParams.cashierId = params.cashierId;

  const response = await apiClient.get<ApiSuccess<CashierPerformanceReportDto>>(
    '/reports/cashier-performance',
    { params: queryParams },
  );
  return response.data.data;
}

export async function getSupplierPurchasesReport(
  params?: SupplierPurchasesRequestParams,
): Promise<SupplierPurchaseReportDto> {
  const queryParams: Record<string, string> = {};
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.supplierId) queryParams.supplierId = params.supplierId;

  const response = await apiClient.get<ApiSuccess<SupplierPurchaseReportDto>>(
    '/reports/supplier-purchases',
    { params: queryParams },
  );
  return response.data.data;
}

export async function downloadSalesExport(
  params: SalesExportRequestParams,
): Promise<{ blob: Blob; filename: string }> {
  return downloadReportExport('sales', params);
}

export async function downloadReportExport(
  reportType: ReportExportType,
  params: ReportExportRequestParams,
): Promise<{ blob: Blob; filename: string }> {
  const queryParams: Record<string, string> = {
    format: params.format,
  };
  if (params.startDate) queryParams.startDate = params.startDate;
  if (params.endDate) queryParams.endDate = params.endDate;
  if (params.groupBy) queryParams.groupBy = params.groupBy;
  if (params.categoryId) queryParams.categoryId = params.categoryId;
  if (params.lowStockOnly !== undefined) queryParams.lowStockOnly = String(params.lowStockOnly);
  if (params.search) queryParams.search = params.search;
  if (params.cashierId) queryParams.cashierId = params.cashierId;
  if (params.supplierId) queryParams.supplierId = params.supplierId;

  const response = await apiClient.get<Blob>(`/reports/export/${reportType}`, {
    params: queryParams,
    responseType: 'blob',
  });

  const headers = response.headers as Record<string, string | undefined> | undefined;
  const filename = parseFilenameFromDisposition(
    headers?.['content-disposition'],
    params.format,
    `laporan-${reportType}`,
  );

  return {
    blob: response.data,
    filename,
  };
}

export function triggerFileDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
