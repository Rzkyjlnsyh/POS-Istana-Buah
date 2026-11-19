import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  updateCategory,
} from './category-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('categoryApi (M02-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getCategories mengirimkan query param pencarian dan status jika tersedia', async () => {
    const mockData = [{ id: 'cat-1', name: 'Tropis', sortOrder: 1 }];
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: mockData } });

    const result = await getCategories({ search: 'tropis', isActive: true, page: 1, limit: 10 });
    expect(result).toEqual(mockData);
    expect(apiClient.get).toHaveBeenCalledWith('/categories', {
      params: { search: 'tropis', isActive: 'true', page: 1, limit: 10 },
    });
  });

  it('getCategoryById memanggil endpoint /categories/:id', async () => {
    const mockItem = { id: 'cat-1', name: 'Tropis' };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { success: true, data: mockItem } });

    const result = await getCategoryById('cat-1');
    expect(result).toEqual(mockItem);
    expect(apiClient.get).toHaveBeenCalledWith('/categories/cat-1');
  });

  it('createCategory memanggil POST /categories dengan payload', async () => {
    const payload = { name: 'Buah Segar', sortOrder: 1, isActive: true };
    const mockCreated = { id: 'cat-2', ...payload };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { success: true, data: mockCreated } });

    const result = await createCategory(payload);
    expect(result).toEqual(mockCreated);
    expect(apiClient.post).toHaveBeenCalledWith('/categories', payload);
  });

  it('updateCategory memanggil PUT /categories/:id dengan payload', async () => {
    const payload = { name: 'Buah Segar Baru' };
    const mockUpdated = { id: 'cat-2', name: 'Buah Segar Baru' };
    vi.mocked(apiClient.put).mockResolvedValue({ data: { success: true, data: mockUpdated } });

    const result = await updateCategory('cat-2', payload);
    expect(result).toEqual(mockUpdated);
    expect(apiClient.put).toHaveBeenCalledWith('/categories/cat-2', payload);
  });

  it('deleteCategory memanggil DELETE /categories/:id dan mengembalikan pesan sukses', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({
      data: { success: true, message: 'Kategori berhasil dihapus' },
    });

    const msg = await deleteCategory('cat-2');
    expect(msg).toBe('Kategori berhasil dihapus');
    expect(apiClient.delete).toHaveBeenCalledWith('/categories/cat-2');
  });
});
