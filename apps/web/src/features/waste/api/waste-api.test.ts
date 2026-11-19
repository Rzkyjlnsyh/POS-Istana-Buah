import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import { createWasteRecord, getWasteRecords, getWasteSummary } from './waste-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('waste-api (M09-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memanggil POST /waste-records, GET /waste-records & GET /reports/waste-summary dengan parameter benar', async () => {
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: { id: 'w-1', estimatedCost: '50000.00' } },
    });
    const created = await createWasteRecord({
      productId: '550e8400-e29b-41d4-a716-446655440000',
      wasteType: 'ROTTEN',
      quantity: 2,
      reason: 'Buah busuk lembek',
    });
    expect(apiClient.post).toHaveBeenCalledWith('/waste-records', {
      productId: '550e8400-e29b-41d4-a716-446655440000',
      wasteType: 'ROTTEN',
      quantity: 2,
      reason: 'Buah busuk lembek',
    });
    expect(created.id).toBe('w-1');

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } },
    });
    await getWasteRecords({ wasteType: 'SHRINKAGE', search: 'Mangga', page: 1, limit: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/waste-records', {
      params: { wasteType: 'SHRINKAGE', search: 'Mangga', page: 1, limit: 20 },
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { totalRecords: 3 } },
    });
    const summary = await getWasteSummary({ groupBy: 'month' });
    expect(apiClient.get).toHaveBeenCalledWith('/reports/waste-summary', {
      params: { groupBy: 'month' },
    });
    expect(summary.totalRecords).toBe(3);
  });
});
