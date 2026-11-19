import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/http-client';
import { pullSyncDelta, submitSyncBatch } from './sync-api';

describe('sync-api', () => {
  it('memanggil endpoint POST /sync/batch dan GET /sync/pull dengan parameter tepat', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        data: { processed: 1, success: [], conflicts: [], errors: [] },
      },
    } as never);
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        data: { serverTime: '2026-11-19T12:00:00.000Z', products: [], categories: [] },
      },
    } as never);

    const batchRes = await submitSyncBatch({ deviceId: 'dev-1', operations: [] });
    expect(postSpy).toHaveBeenCalledWith('/sync/batch', { deviceId: 'dev-1', operations: [] });
    expect(batchRes.processed).toBe(1);

    const pullRes = await pullSyncDelta({
      since: '2026-11-19T00:00:00.000Z',
      types: ['products', 'categories'],
    });
    expect(getSpy).toHaveBeenCalledWith('/sync/pull', {
      params: { since: '2026-11-19T00:00:00.000Z', types: 'products,categories' },
    });
    expect(pullRes.serverTime).toBe('2026-11-19T12:00:00.000Z');

    postSpy.mockRestore();
    getSpy.mockRestore();
  });
});
