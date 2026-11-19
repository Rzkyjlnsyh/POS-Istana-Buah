import type { ApiSuccess, DashboardChartsDto, DashboardSummaryDto } from '@istana-buah/shared';
import { apiClient } from '../../../lib/api/http-client';

export interface DashboardSummaryRequestParams {
  topLimit?: number;
  lowStockLimit?: number;
}

export interface DashboardChartsRequestParams {
  days?: number;
}

export async function getDashboardSummary(
  params?: DashboardSummaryRequestParams,
): Promise<DashboardSummaryDto> {
  const queryParams: Record<string, number> = {};
  if (params?.topLimit !== undefined) queryParams.topLimit = params.topLimit;
  if (params?.lowStockLimit !== undefined) queryParams.lowStockLimit = params.lowStockLimit;

  const response = await apiClient.get<ApiSuccess<DashboardSummaryDto>>('/dashboard/summary', {
    params: queryParams,
  });
  return response.data.data;
}

export async function getDashboardCharts(
  params?: DashboardChartsRequestParams,
): Promise<DashboardChartsDto> {
  const queryParams: Record<string, number> = {};
  if (params?.days !== undefined) queryParams.days = params.days;

  const response = await apiClient.get<ApiSuccess<DashboardChartsDto>>('/dashboard/charts', {
    params: queryParams,
  });
  return response.data.data;
}
