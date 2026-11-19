import type {
  ApiSuccess,
  CreateEmployeeInput,
  EmployeeDto,
  EmployeeListQuery,
  PaginationMeta,
  ShiftDto,
  ShiftListQuery,
  UpdateEmployeeInput,
} from '@istana-buah/shared';
import { apiClient } from '../../../lib/api/http-client';

export interface PaginatedEmployeeResponse {
  items: EmployeeDto[];
  meta: PaginationMeta;
}

export interface PaginatedEmployeeShiftsResponse {
  items: ShiftDto[];
  meta: PaginationMeta;
}

export async function getEmployees(
  params?: Partial<EmployeeListQuery>,
): Promise<PaginatedEmployeeResponse> {
  const queryParams: Record<string, string | number> = {};
  if (params?.page !== undefined) queryParams.page = params.page;
  if (params?.limit !== undefined) queryParams.limit = params.limit;
  if (params?.role) queryParams.role = params.role;
  if (params?.isActive !== undefined) queryParams.isActive = String(params.isActive);
  if (params?.search) queryParams.search = params.search;

  const response = await apiClient.get<ApiSuccess<EmployeeDto[]>>('/users', {
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

export async function createEmployee(input: CreateEmployeeInput): Promise<EmployeeDto> {
  const response = await apiClient.post<ApiSuccess<EmployeeDto>>('/users', input);
  return response.data.data;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<EmployeeDto> {
  const response = await apiClient.put<ApiSuccess<EmployeeDto>>(`/users/${id}`, input);
  return response.data.data;
}

export async function deleteEmployee(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}

export async function getEmployeeShifts(
  id: string,
  params?: Partial<ShiftListQuery>,
): Promise<PaginatedEmployeeShiftsResponse> {
  const queryParams: Record<string, string | number> = {};
  if (params?.page !== undefined) queryParams.page = params.page;
  if (params?.limit !== undefined) queryParams.limit = params.limit;
  if (params?.status) queryParams.status = params.status;

  const response = await apiClient.get<ApiSuccess<ShiftDto[]>>(`/users/${id}/shifts`, {
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
