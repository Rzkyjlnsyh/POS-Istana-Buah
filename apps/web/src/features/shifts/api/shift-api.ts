import type {
  ApiSuccess,
  CloseShiftInput,
  OpenShiftInput,
  PaginationMeta,
  ShiftDto,
  ShiftListQuery,
} from '@istana-buah/shared';
import { apiClient } from '../../../lib/api/http-client';

export interface PaginatedShiftResponse {
  items: ShiftDto[];
  meta: PaginationMeta;
}

export async function openShift(input: OpenShiftInput): Promise<ShiftDto> {
  const res = await apiClient.post<ApiSuccess<ShiftDto>>('/shifts/open', input);
  return res.data.data;
}

export async function getActiveShift(): Promise<ShiftDto | null> {
  const res = await apiClient.get<ApiSuccess<ShiftDto | null>>('/shifts/active');
  return res.data.data ?? null;
}

export async function closeShift(id: string, input: CloseShiftInput): Promise<ShiftDto> {
  const res = await apiClient.put<ApiSuccess<ShiftDto>>(`/shifts/${id}/close`, input);
  return res.data.data;
}

export async function getShifts(params?: Partial<ShiftListQuery>): Promise<PaginatedShiftResponse> {
  const queryParams: Record<string, string | number> = {};
  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;
  if (params?.status) queryParams.status = params.status;
  if (params?.userId) queryParams.userId = params.userId;
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.search) queryParams.search = params.search;

  const res = await apiClient.get<ApiSuccess<ShiftDto[]>>('/shifts', { params: queryParams });
  return {
    items: res.data.data,
    meta: res.data.meta ?? {
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
      total: res.data.data.length,
    },
  };
}

export async function getShiftById(id: string): Promise<ShiftDto> {
  const res = await apiClient.get<ApiSuccess<ShiftDto>>(`/shifts/${id}`);
  return res.data.data;
}
