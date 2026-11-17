import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import {
  cancelPurchaseOrder,
  createPurchaseOrder,
  createSupplier,
  deleteSupplier,
  getPurchaseOrderById,
  getPurchaseOrders,
  getSupplierById,
  getSuppliers,
  payPurchaseOrder,
  updateSupplier,
} from './supplier-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('supplier-api (M05-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memanggil endpoint CRUD supplier secara akurat', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: [{ id: 's1', name: 'CV Agro' }],
        meta: { page: 1, limit: 20, total: 1 },
      },
    });
    const list = await getSuppliers({ search: 'Agro', isActive: true, page: 1, limit: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/suppliers', {
      params: { search: 'Agro', isActive: 'true', page: 1, limit: 20 },
    });
    expect(list.items).toHaveLength(1);

    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { success: true, data: { id: 's1' } } });
    await getSupplierById('s1');
    expect(apiClient.get).toHaveBeenCalledWith('/suppliers/s1');

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: { id: 's1' } },
    });
    await createSupplier({ name: 'CV Agro' });
    expect(apiClient.post).toHaveBeenCalledWith('/suppliers', { name: 'CV Agro' });

    vi.mocked(apiClient.put).mockResolvedValueOnce({ data: { success: true, data: { id: 's1' } } });
    await updateSupplier('s1', { isActive: false });
    expect(apiClient.put).toHaveBeenCalledWith('/suppliers/s1', { isActive: false });

    vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: { success: true } });
    await deleteSupplier('s1');
    expect(apiClient.delete).toHaveBeenCalledWith('/suppliers/s1');
  });

  it('memanggil endpoint Purchase Order secara akurat', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } },
    });
    await getPurchaseOrders({ supplierId: 's1', status: 'PENDING', unpaidOnly: true });
    expect(apiClient.get).toHaveBeenCalledWith('/purchase-orders', {
      params: { supplierId: 's1', status: 'PENDING', unpaidOnly: 'true' },
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { id: 'po1' } },
    });
    await getPurchaseOrderById('po1');
    expect(apiClient.get).toHaveBeenCalledWith('/purchase-orders/po1');

    const poInput = {
      supplierId: 's1',
      items: [{ productId: 'p1', quantity: 10, unitCost: 15000 }],
    };
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: { id: 'po1' } },
    });
    await createPurchaseOrder(poInput);
    expect(apiClient.post).toHaveBeenCalledWith('/purchase-orders', poInput);

    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, data: { id: 'po1' } },
    });
    await payPurchaseOrder('po1', { amount: 50000 });
    expect(apiClient.put).toHaveBeenCalledWith('/purchase-orders/po1/payment', { amount: 50000 });

    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, data: { id: 'po1' } },
    });
    await cancelPurchaseOrder('po1');
    expect(apiClient.put).toHaveBeenCalledWith('/purchase-orders/po1/cancel');
  });
});
