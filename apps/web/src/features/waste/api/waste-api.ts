import type {
  ApiSuccess,
  CreateWasteRecordInput,
  PaginationMeta,
  WasteRecordDto,
  WasteRecordListQuery,
  WasteSummaryQuery,
  WasteSummaryReportDto,
} from '@istana-buah/shared';
import { apiClient } from '../../../lib/api/http-client';

export interface PaginatedWasteResponse {
  items: WasteRecordDto[];
  meta: PaginationMeta;
}

export async function createWasteRecord(input: CreateWasteRecordInput): Promise<WasteRecordDto> {
  const response = await apiClient.post<ApiSuccess<WasteRecordDto>>('/waste-records', input);
  return response.data.data;
}

export async function getWasteRecords(
  params?: Partial<WasteRecordListQuery>,
): Promise<PaginatedWasteResponse> {
  const queryParams: Record<string, string | number> = {};
  if (params?.page !== undefined) queryParams.page = params.page;
  if (params?.limit !== undefined) queryParams.limit = params.limit;
  if (params?.productId) queryParams.productId = params.productId;
  if (params?.wasteType) queryParams.wasteType = params.wasteType;
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.search) queryParams.search = params.search;

  const response = await apiClient.get<ApiSuccess<WasteRecordDto[]>>('/waste-records', {
    params: queryParams,
  });

  return {
    items: response.data.data,
    meta: response.data.meta ?? {
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
      total: response.data.data.length,
    },
  };
}

export async function getWasteSummary(
  params?: Partial<WasteSummaryQuery>,
): Promise<WasteSummaryReportDto> {
  const queryParams: Record<string, string> = {};
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.groupBy) queryParams.groupBy = params.groupBy;

  const response = await apiClient.get<ApiSuccess<WasteSummaryReportDto>>(
    '/reports/waste-summary',
    { params: queryParams },
  );
  return response.data.data;
}
