import type {
  ApiSuccess,
  CategoryDto,
  CategoryListQuery,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@istana-buah/shared';
import { apiClient } from '../../../lib/api/http-client';

export interface CategoryListResponseData {
  items: CategoryDto[];
}

/**
 * Mengambil daftar kategori dari backend API (M02-001 / M02-004).
 */
export async function getCategories(params?: Partial<CategoryListQuery>): Promise<CategoryDto[]> {
  const queryParams: Record<string, string | number> = {};

  if (params?.search) {
    queryParams.search = params.search;
  }
  if (params?.isActive !== undefined) {
    queryParams.isActive = String(params.isActive);
  }
  if (params?.page) {
    queryParams.page = params.page;
  }
  if (params?.limit) {
    queryParams.limit = params.limit;
  }

  const response = await apiClient.get<ApiSuccess<CategoryDto[]>>('/categories', {
    params: queryParams,
  });

  return response.data.data;
}

/**
 * Mengambil satu kategori berdasarkan ID (M02-004).
 */
export async function getCategoryById(id: string): Promise<CategoryDto> {
  const response = await apiClient.get<ApiSuccess<CategoryDto>>(`/categories/${id}`);
  return response.data.data;
}

/**
 * Menambahkan kategori baru (M02-004).
 */
export async function createCategory(input: CreateCategoryInput): Promise<CategoryDto> {
  const response = await apiClient.post<ApiSuccess<CategoryDto>>('/categories', input);
  return response.data.data;
}

/**
 * Memperbarui data kategori (M02-004).
 */
export async function updateCategory(id: string, input: UpdateCategoryInput): Promise<CategoryDto> {
  const response = await apiClient.put<ApiSuccess<CategoryDto>>(`/categories/${id}`, input);
  return response.data.data;
}

/**
 * Menghapus kategori (soft delete) (M02-004).
 */
export async function deleteCategory(id: string): Promise<string> {
  const response = await apiClient.delete<ApiSuccess<null>>(`/categories/${id}`);
  return response.data.message ?? 'Kategori berhasil dihapus';
}
