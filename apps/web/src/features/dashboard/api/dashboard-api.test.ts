import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import { getDashboardCharts, getDashboardSummary } from './dashboard-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('dashboard-api (M08-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memanggil endpoint GET /dashboard/summary dan /dashboard/charts dengan parameter', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { todayDate: '2026-11-19' } },
    });
    const summary = await getDashboardSummary({ topLimit: 5, lowStockLimit: 5 });
    expect(apiClient.get).toHaveBeenCalledWith('/dashboard/summary', {
      params: { topLimit: 5, lowStockLimit: 5 },
    });
    expect(summary.todayDate).toBe('2026-11-19');

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { days: 30, timeline: [] } },
    });
    const charts = await getDashboardCharts({ days: 30 });
    expect(apiClient.get).toHaveBeenCalledWith('/dashboard/charts', {
      params: { days: 30 },
    });
    expect(charts.days).toBe(30);
  });
});
