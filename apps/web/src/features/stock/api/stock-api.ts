import type {
  ApiSuccess,
  CreateStockOpnameInput,
  LowStockAlertItemDto,
  LowStockAlertQuery,
  PaginationMeta,
  ReceiveStockInput,
  StockMovementDto,
  StockMovementListQuery,
  StockOpnameDto,
  StockOpnameListQuery,
  StockReceiveResultDto,
} from '@istana-buah/shared';
import { apiClient } from '../../../lib/api/http-client';

export interface PaginatedStockResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

function defaultMeta(count: number, page?: number, limit?: number): PaginationMeta {
  return {
    page: page ?? 1,
    limit: limit ?? 20,
    total: count,
  };
}

/**
 * Mencatat penerimaan stok barang (M04-001 / M04-002).
 */
export async function receiveStock(input: ReceiveStockInput): Promise<StockReceiveResultDto> {
  const response = await apiClient.post<ApiSuccess<StockReceiveResultDto>>('/stock/receive', input);
  return response.data.data;
}

/**
 * Membuat dokumen stok opname (langsung final atau draft).
 */
export async function createStockOpname(input: CreateStockOpnameInput): Promise<StockOpnameDto> {
  const response = await apiClient.post<ApiSuccess<StockOpnameDto>>('/stock/opname', input);
  return response.data.data;
}

/**
 * Memfinalisasi dokumen stok opname DRAFT di server.
 */
export async function finalizeStockOpname(id: string): Promise<StockOpnameDto> {
  const response = await apiClient.put<ApiSuccess<StockOpnameDto>>(`/stock/opname/${id}/finalize`);
  return response.data.data;
}

/**
 * Mengambil daftar dokumen stok opname berpaginasi.
 */
export async function getStockOpnames(
  params?: Partial<StockOpnameListQuery>,
): Promise<PaginatedStockResponse<StockOpnameDto>> {
  const queryParams: Record<string, string | number> = {};
  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;
  if (params?.status) queryParams.status = params.status;
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.search) queryParams.search = params.search;

  const response = await apiClient.get<ApiSuccess<StockOpnameDto[]>>('/stock/opnames', {
    params: queryParams,
  });

  return {
    items: response.data.data,
    meta: response.data.meta ?? defaultMeta(response.data.data.length, params?.page, params?.limit),
  };
}

/**
 * Mengambil detail satu dokumen stok opname.
 */
export async function getStockOpnameById(id: string): Promise<StockOpnameDto> {
  const response = await apiClient.get<ApiSuccess<StockOpnameDto>>(`/stock/opnames/${id}`);
  return response.data.data;
}

/**
 * Mengambil riwayat mutasi stok berpaginasi dengan filter produk, tipe, & tanggal.
 */
export async function getStockMovements(
  params?: Partial<StockMovementListQuery>,
): Promise<PaginatedStockResponse<StockMovementDto>> {
  const queryParams: Record<string, string | number> = {};
  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;
  if (params?.productId) queryParams.productId = params.productId;
  if (params?.type) queryParams.type = params.type;
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.search) queryParams.search = params.search;

  const response = await apiClient.get<ApiSuccess<StockMovementDto[]>>('/stock/movements', {
    params: queryParams,
  });

  return {
    items: response.data.data,
    meta: response.data.meta ?? defaultMeta(response.data.data.length, params?.page, params?.limit),
  };
}

/**
 * Mengambil daftar produk aktif dengan stok <= batas peringatan minimum.
 */
export async function getLowStockAlerts(
  params?: Partial<LowStockAlertQuery>,
): Promise<PaginatedStockResponse<LowStockAlertItemDto>> {
  const queryParams: Record<string, string | number> = {};
  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;
  if (params?.categoryId) queryParams.categoryId = params.categoryId;
  if (params?.search) queryParams.search = params.search;

  const response = await apiClient.get<ApiSuccess<LowStockAlertItemDto[]>>('/stock/low-alert', {
    params: queryParams,
  });

  return {
    items: response.data.data,
    meta: response.data.meta ?? defaultMeta(response.data.data.length, params?.page, params?.limit),
  };
}
