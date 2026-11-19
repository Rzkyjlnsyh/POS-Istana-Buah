import type {
  ApiSuccess,
  CreateTransactionInput,
  TransactionDto,
  TransactionListQuery,
  TransactionListResponse,
} from '@istana-buah/shared';
import { webConfig } from '../../../config/app.config';
import { apiClient } from '../../../lib/api/http-client';

/**
 * Menyimpan transaksi kasir baru (M03-001 / M03-006).
 */
export async function createTransaction(input: CreateTransactionInput): Promise<TransactionDto> {
  const response = await apiClient.post<ApiSuccess<TransactionDto>>('/transactions', input);
  return response.data.data;
}

/**
 * Mengambil daftar riwayat transaksi dengan filter (M03-001 / M03-008).
 */
export async function getTransactions(
  params?: Partial<TransactionListQuery>,
): Promise<TransactionListResponse> {
  const queryParams: Record<string, string> = {};

  if (params?.page) queryParams.page = String(params.page);
  if (params?.limit) queryParams.limit = String(params.limit);
  if (params?.startDate) queryParams.startDate = params.startDate;
  if (params?.endDate) queryParams.endDate = params.endDate;
  if (params?.status) queryParams.status = params.status;
  if (params?.paymentMethod) queryParams.paymentMethod = params.paymentMethod;
  if (params?.cashierId) queryParams.cashierId = params.cashierId;
  if (params?.shiftId) queryParams.shiftId = params.shiftId;
  if (params?.search?.trim()) queryParams.search = params.search.trim();

  const response = await apiClient.get<ApiSuccess<TransactionDto[]>>('/transactions', {
    params: queryParams,
  });

  return {
    items: response.data.data,
    meta: response.data.meta ?? {
      page: params?.page ?? 1,
      limit: params?.limit ?? webConfig.historyPageSize,
      total: response.data.data.length,
    },
  };
}

/**
 * Mengambil detail transaksi berdasarkan ID (M03-001 / M03-008).
 */
export async function getTransactionById(id: string): Promise<TransactionDto> {
  const response = await apiClient.get<ApiSuccess<TransactionDto>>(`/transactions/${id}`);
  return response.data.data;
}

/**
 * Membatalkan / Void transaksi (M03-001).
 */
export async function voidTransaction(id: string, reason: string): Promise<TransactionDto> {
  const response = await apiClient.put<ApiSuccess<TransactionDto>>(`/transactions/${id}/void`, {
    reason,
  });
  return response.data.data;
}
