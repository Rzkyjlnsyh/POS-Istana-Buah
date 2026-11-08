import type {
  ApiSuccess,
  BatchImportProductItem,
  BatchImportProductResult,
  CreateProductInput,
  GenerateBarcodeResult,
  PaginationMeta,
  ProductDto,
  ProductType,
  UpdateProductInput,
} from '@istana-buah/shared';
import { apiClient } from '../../../lib/api/http-client';

export interface ProductListParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  type?: ProductType;
  isActive?: boolean;
  lowStock?: boolean;
}

export interface ProductListResponse {
  items: ProductDto[];
  meta: PaginationMeta;
}

/**
 * Mengambil daftar produk terfilter & berpaginasi dari API (M02-002 / M02-005).
 */
export async function getProducts(params?: ProductListParams): Promise<ProductListResponse> {
  const queryParams: Record<string, string | number> = {};

  if (params?.page) {
    queryParams.page = params.page;
  }
  if (params?.limit) {
    queryParams.limit = params.limit;
  }
  if (params?.search) {
    queryParams.search = params.search;
  }
  if (params?.categoryId) {
    queryParams.categoryId = params.categoryId;
  }
  if (params?.type) {
    queryParams.type = params.type;
  }
  if (params?.isActive !== undefined) {
    queryParams.isActive = String(params.isActive);
  }
  if (params?.lowStock !== undefined) {
    queryParams.lowStock = String(params.lowStock);
  }

  const response = await apiClient.get<ApiSuccess<ProductDto[]>>('/products', {
    params: queryParams,
  });

  return {
    items: response.data.data,
    meta: response.data.meta ?? {
      page: params?.page ?? 1,
      limit: params?.limit ?? 20,
      total: response.data.data.length,
    },
  };
}

/**
 * Mengambil satu produk berdasarkan ID (M02-005).
 */
export async function getProductById(id: string): Promise<ProductDto> {
  const response = await apiClient.get<ApiSuccess<ProductDto>>(`/products/${id}`);
  return response.data.data;
}

/**
 * Mengambil satu produk berdasarkan Barcode lookup cepat (M02-002 / M02-005).
 */
export async function getProductByBarcode(barcode: string): Promise<ProductDto> {
  const response = await apiClient.get<ApiSuccess<ProductDto>>(`/products/barcode/${barcode}`);
  return response.data.data;
}

/**
 * Membuat produk baru (M02-002 / M02-005).
 */
export async function createProduct(input: CreateProductInput): Promise<ProductDto> {
  const response = await apiClient.post<ApiSuccess<ProductDto>>('/products', input);
  return response.data.data;
}

/**
 * Memperbarui produk yang ada (M02-002 / M02-005).
 */
export async function updateProduct(id: string, input: UpdateProductInput): Promise<ProductDto> {
  const response = await apiClient.put<ApiSuccess<ProductDto>>(`/products/${id}`, input);
  return response.data.data;
}

/**
 * Menghapus produk (soft delete) (M02-002 / M02-005).
 */
export async function deleteProduct(id: string): Promise<string> {
  const response = await apiClient.delete<ApiSuccess<null>>(`/products/${id}`);
  return response.data.message ?? 'Produk berhasil dihapus';
}

/**
 * Generate barcode EAN-13 acak yang valid dan unik dari server (M02-003 / M02-005).
 */
export async function generateProductBarcode(prefix?: string): Promise<string> {
  const queryParams: Record<string, string> = {};
  if (prefix) {
    queryParams.prefix = prefix;
  }
  const response = await apiClient.get<ApiSuccess<GenerateBarcodeResult>>(
    '/products/generate-barcode',
    { params: queryParams },
  );
  return response.data.data.barcode;
}

/**
 * Mengimpor produk massal melalui batch endpoint (M02-007).
 */
export async function batchImportProducts(
  items: BatchImportProductItem[],
): Promise<BatchImportProductResult> {
  const response = await apiClient.post<ApiSuccess<BatchImportProductResult>>(
    '/products/batch-import',
    { items },
  );
  return response.data.data;
}
