import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import { closeShift, getActiveShift, getShiftById, getShifts, openShift } from './shift-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe('shift-api (M06-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memanggil endpoint open, active, close, list, dan detail shift dengan benar', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: { id: 'sh-1', shiftNo: 'SHIFT-20261117-001' } },
    });
    const opened = await openShift({ openingCash: 500000, notes: 'Pagi' });
    expect(apiClient.post).toHaveBeenCalledWith('/shifts/open', {
      openingCash: 500000,
      notes: 'Pagi',
    });
    expect(opened.shiftNo).toBe('SHIFT-20261117-001');

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: null },
    });
    expect(await getActiveShift()).toBeNull();
    expect(apiClient.get).toHaveBeenCalledWith('/shifts/active');

    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, data: { id: 'sh-1', status: 'CLOSED' } },
    });
    const closed = await closeShift('sh-1', { closingCash: 750000 });
    expect(apiClient.put).toHaveBeenCalledWith('/shifts/sh-1/close', { closingCash: 750000 });
    expect(closed.status).toBe('CLOSED');

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } },
    });
    await getShifts({ status: 'CLOSED', search: 'SHIFT', page: 1, limit: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/shifts', {
      params: { status: 'CLOSED', search: 'SHIFT', page: 1, limit: 20 },
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { id: 'sh-1' } },
    });
    await getShiftById('sh-1');
    expect(apiClient.get).toHaveBeenCalledWith('/shifts/sh-1');
  });
});
