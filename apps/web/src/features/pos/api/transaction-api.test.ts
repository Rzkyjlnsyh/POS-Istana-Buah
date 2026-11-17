import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import {
  createTransaction,
  getTransactionById,
  getTransactions,
  voidTransaction,
} from './transaction-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe('transaction-api (M03-006)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memanggil POST /transactions dengan input yang sesuai', async () => {
    const mockTx = { id: 'tx-1', transactionNo: 'TRX-20261108-0001' };
    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: mockTx },
    });

    const input = {
      items: [{ productId: 'prod-1', quantity: 2, unitPrice: 15000 }],
      paymentMethod: 'CASH' as const,
      amountPaid: 50000,
    };

    const result = await createTransaction(input);

    expect(apiClient.post).toHaveBeenCalledWith('/transactions', input);
    expect(result).toEqual(mockTx);
  });

  it('memanggil GET /transactions dengan query params yang sesuai', async () => {
    const mockList = [{ id: 'tx-1' }];
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        success: true,
        data: mockList,
        meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
      },
    });

    const result = await getTransactions({ page: 1, limit: 10, paymentMethod: 'QRIS' });

    expect(apiClient.get).toHaveBeenCalledWith('/transactions', {
      params: { page: '1', limit: '10', paymentMethod: 'QRIS' },
    });
    expect(result.items).toEqual(mockList);
    expect(result.meta.total).toBe(1);
  });

  it('memanggil GET /transactions/:id untuk mengambil detail transaksi', async () => {
    const mockTx = { id: 'tx-123', transactionNo: 'TRX-001' };
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: mockTx },
    });

    const result = await getTransactionById('tx-123');

    expect(apiClient.get).toHaveBeenCalledWith('/transactions/tx-123');
    expect(result).toEqual(mockTx);
  });

  it('memanggil PUT /transactions/:id/void dengan alasan pembatalan', async () => {
    const mockTx = { id: 'tx-123', status: 'VOIDED' };
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, data: mockTx },
    });

    const result = await voidTransaction('tx-123', 'Salah input item kasir');

    expect(apiClient.put).toHaveBeenCalledWith('/transactions/tx-123/void', {
      reason: 'Salah input item kasir',
    });
    expect(result).toEqual(mockTx);
  });
});
