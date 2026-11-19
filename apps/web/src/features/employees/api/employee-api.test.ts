import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import {
  createEmployee,
  deleteEmployee,
  getEmployeeShifts,
  getEmployees,
  updateEmployee,
} from './employee-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('employee-api (M10-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memanggil endpoint CRUD pegawai dan riwayat shift dengan parameter benar', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } },
    });
    await getEmployees({ role: 'CASHIER', isActive: true, search: 'Dewi', page: 1, limit: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/users', {
      params: { role: 'CASHIER', isActive: 'true', search: 'Dewi', page: 1, limit: 20 },
    });

    vi.mocked(apiClient.post).mockResolvedValueOnce({
      data: { success: true, data: { id: 'u-1', username: 'kasir_1' } },
    });
    const created = await createEmployee({
      username: 'kasir_1',
      fullName: 'Dewi',
      password: 'Password123',
      role: 'CASHIER',
      isActive: true,
    });
    expect(created.id).toBe('u-1');

    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, data: { id: 'u-1', isActive: false } },
    });
    const updated = await updateEmployee('u-1', { isActive: false, unlockAccount: true });
    expect(apiClient.put).toHaveBeenCalledWith('/users/u-1', {
      isActive: false,
      unlockAccount: true,
    });
    expect(updated.isActive).toBe(false);

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: [], meta: { page: 1, limit: 20, total: 0 } },
    });
    await getEmployeeShifts('u-1', { status: 'CLOSED', page: 1, limit: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/users/u-1/shifts', {
      params: { status: 'CLOSED', page: 1, limit: 20 },
    });

    vi.mocked(apiClient.delete).mockResolvedValueOnce({ data: { success: true } });
    await deleteEmployee('u-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/users/u-1');
  });
});
