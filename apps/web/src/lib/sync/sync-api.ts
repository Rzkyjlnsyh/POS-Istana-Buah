import type {
  ApiSuccess,
  SyncBatchRequestDto,
  SyncBatchResponseDto,
  SyncPullEntityType,
  SyncPullResponseDto,
} from '@istana-buah/shared';
import { apiClient } from '../api/http-client';

export interface SyncPullParams {
  since?: string;
  types?: SyncPullEntityType[];
}

/**
 * Mengirim batch transaksi offline ke server untuk diproses secara idempoten (M11-002).
 */
export async function submitSyncBatch(payload: SyncBatchRequestDto): Promise<SyncBatchResponseDto> {
  const response = await apiClient.post<ApiSuccess<SyncBatchResponseDto>>('/sync/batch', payload);
  return response.data.data;
}

/**
 * Mengambil delta pembaruan produk dan kategori dari server sejak timestamp terakhir (M11-002).
 */
export async function pullSyncDelta(params?: SyncPullParams): Promise<SyncPullResponseDto> {
  const queryParams: Record<string, string> = {};
  if (params?.since) {
    queryParams.since = params.since;
  }
  if (params?.types?.length) {
    queryParams.types = params.types.join(',');
  }

  const response = await apiClient.get<ApiSuccess<SyncPullResponseDto>>('/sync/pull', {
    params: queryParams,
  });
  return response.data.data;
}
