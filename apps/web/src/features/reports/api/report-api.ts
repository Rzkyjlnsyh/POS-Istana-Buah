import type {
  ApiSuccess,
  CurrentStockReportDto,
  ProductPerformanceReportDto,
  ProductPerformanceSortBy,
  ReportGroupBy,
  SalesExportFormat,
  SalesSummaryReportDto,
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

const EXPORT_EXTENSION_MAP: Record<SalesExportFormat, string> = {
  csv: 'csv',
  excel: 'xls',
  pdf: 'pdf',
};

function parseFilenameFromDisposition(
  headerValue: string | undefined,
  fallbackFormat: SalesExportFormat,
): string {
  if (headerValue) {
    const match = /filename="?([^";]+)"?/i.exec(headerValue);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return `laporan-penjualan.${EXPORT_EXTENSION_MAP[fallbackFormat]}`;
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

export async function downloadSalesExport(
  params: SalesExportRequestParams,
): Promise<{ blob: Blob; filename: string }> {
  const queryParams: Record<string, string> = {
    format: params.format,
  };
  if (params.startDate) queryParams.startDate = params.startDate;
  if (params.endDate) queryParams.endDate = params.endDate;

  const response = await apiClient.get<Blob>('/reports/export/sales', {
    params: queryParams,
    responseType: 'blob',
  });

  const headers = response.headers as Record<string, string | undefined> | undefined;
  const filename = parseFilenameFromDisposition(headers?.['content-disposition'], params.format);

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
