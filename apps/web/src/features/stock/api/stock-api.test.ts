import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import {
  createStockOpname,
  finalizeStockOpname,
  getLowStockAlerts,
  getStockMovements,
  getStockOpnameById,
  getStockOpnames,
  receiveStock,
} from './stock-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe('stock-api (M04-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('receiveStock mengirim payload penerimaan stok dan mengembalikan hasil mutasi', async () => {
    const payload = { items: [{ productId: 'p1', quantity: 20, unitCost: 18000 }], notes: 'Pagi' };
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: {
        success: true,
        data: {
          purchaseOrderId: null,
          supplierId: null,
          supplierName: null,
          totalItems: 1,
          movements: [],
        },
      },
    });

    const result = await receiveStock(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/stock/receive', payload);
    expect(result.totalItems).toBe(1);
  });

  it('createStockOpname, finalizeStockOpname, getStockOpnames, & getStockOpnameById', async () => {
    const opPayload = { items: [{ productId: 'p1', physicalQty: 14.5 }], finalize: false };
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: { id: 'op1', status: 'DRAFT' } },
    });
    const created = await createStockOpname(opPayload);
    expect(apiClient.post).toHaveBeenCalledWith('/stock/opname', opPayload);
    expect(created.id).toBe('op1');

    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, data: { id: 'op1', status: 'COMPLETED' } },
    });
    const finalized = await finalizeStockOpname('op1');
    expect(apiClient.put).toHaveBeenCalledWith('/stock/opname/op1/finalize');
    expect(finalized.status).toBe('COMPLETED');

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: [{ id: 'op1' }] },
    });
    const list = await getStockOpnames({ status: 'COMPLETED', page: 2, limit: 15, search: 'OPN' });
    expect(apiClient.get).toHaveBeenCalledWith('/stock/opnames', {
      params: { status: 'COMPLETED', page: 2, limit: 15, search: 'OPN' },
    });
    expect(list.meta.total).toBe(1);

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { id: 'op1' } },
    });
    const detail = await getStockOpnameById('op1');
    expect(apiClient.get).toHaveBeenCalledWith('/stock/opnames/op1');
    expect(detail.id).toBe('op1');
  });

  it('getStockMovements dan getLowStockAlerts meneruskan parameter filter ke API', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } },
    });
    const movRes = await getStockMovements({
      page: 1,
      limit: 20,
      productId: 'p1',
      type: 'PURCHASE_IN',
      startDate: '2026-11-17T00:00:00+07:00',
      endDate: '2026-11-17T23:59:59.999+07:00',
      search: 'Mangga',
    });
    expect(apiClient.get).toHaveBeenCalledWith('/stock/movements', {
      params: {
        page: 1,
        limit: 20,
        productId: 'p1',
        type: 'PURCHASE_IN',
        startDate: '2026-11-17T00:00:00+07:00',
        endDate: '2026-11-17T23:59:59.999+07:00',
        search: 'Mangga',
      },
    });
    expect(movRes.items).toEqual([]);

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: [], meta: { page: 1, limit: 50, total: 0 } },
    });
    await getLowStockAlerts({ page: 1, limit: 50, categoryId: 'cat-1', search: 'Jeruk' });
    expect(apiClient.get).toHaveBeenCalledWith('/stock/low-alert', {
      params: { page: 1, limit: 50, categoryId: 'cat-1', search: 'Jeruk' },
    });
  });
});
