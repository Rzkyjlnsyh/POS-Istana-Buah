import type {
  ApiSuccess,
  CreatePurchaseOrderInput,
  CreateSupplierInput,
  PaginationMeta,
  PayPurchaseOrderInput,
  PurchaseOrderDto,
  PurchaseOrderListQuery,
  SupplierDetailDto,
  SupplierDto,
  SupplierListQuery,
  UpdateSupplierInput,
} from '@istana-buah/shared';
import { apiClient } from '../../../lib/api/http-client';

export interface PaginatedSupplierResult<T> {
  items: T[];
  meta: PaginationMeta;
}

function fallbackMeta(count: number, page?: number, limit?: number): PaginationMeta {
  return { page: page ?? 1, limit: limit ?? 20, total: count };
}

export async function getSuppliers(
  params?: Partial<SupplierListQuery>,
): Promise<PaginatedSupplierResult<SupplierDto>> {
  const queryParams: Record<string, string | number | boolean> = {};
  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;
  if (params?.search) queryParams.search = params.search;
  if (params?.isActive !== undefined) queryParams.isActive = String(params.isActive);

  const res = await apiClient.get<ApiSuccess<SupplierDto[]>>('/suppliers', { params: queryParams });
  return {
    items: res.data.data,
    meta: res.data.meta ?? fallbackMeta(res.data.data.length, params?.page, params?.limit),
  };
}

export async function getSupplierById(id: string): Promise<SupplierDetailDto> {
  const res = await apiClient.get<ApiSuccess<SupplierDetailDto>>(`/suppliers/${id}`);
  return res.data.data;
}

export async function createSupplier(input: CreateSupplierInput): Promise<SupplierDto> {
  const res = await apiClient.post<ApiSuccess<SupplierDto>>('/suppliers', input);
  return res.data.data;
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<SupplierDto> {
  const res = await apiClient.put<ApiSuccess<SupplierDto>>(`/suppliers/${id}`, input);
  return res.data.data;
}

export async function deleteSupplier(id: string): Promise<void> {
  await apiClient.delete(`/suppliers/${id}`);
}

export async function getPurchaseOrders(
  params?: Partial<PurchaseOrderListQuery>,
): Promise<PaginatedSupplierResult<PurchaseOrderDto>> {
  const queryParams: Record<string, string | number | boolean> = {};
  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;
  if (params?.supplierId) queryParams.supplierId = params.supplierId;
  if (params?.status) queryParams.status = params.status;
  if (params?.unpaidOnly !== undefined) queryParams.unpaidOnly = String(params.unpaidOnly);
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.search) queryParams.search = params.search;

  const res = await apiClient.get<ApiSuccess<PurchaseOrderDto[]>>('/purchase-orders', {
    params: queryParams,
  });
  return {
    items: res.data.data,
    meta: res.data.meta ?? fallbackMeta(res.data.data.length, params?.page, params?.limit),
  };
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrderDto> {
  const res = await apiClient.get<ApiSuccess<PurchaseOrderDto>>(`/purchase-orders/${id}`);
  return res.data.data;
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrderDto> {
  const res = await apiClient.post<ApiSuccess<PurchaseOrderDto>>('/purchase-orders', input);
  return res.data.data;
}

export async function payPurchaseOrder(
  id: string,
  input: PayPurchaseOrderInput,
): Promise<PurchaseOrderDto> {
  const res = await apiClient.put<ApiSuccess<PurchaseOrderDto>>(
    `/purchase-orders/${id}/payment`,
    input,
  );
  return res.data.data;
}

export async function cancelPurchaseOrder(id: string): Promise<PurchaseOrderDto> {
  const res = await apiClient.put<ApiSuccess<PurchaseOrderDto>>(`/purchase-orders/${id}/cancel`);
  return res.data.data;
}
