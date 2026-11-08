import type { ProductDto } from '@istana-buah/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import {
  createProduct,
  deleteProduct,
  generateProductBarcode,
  getProductByBarcode,
  getProductById,
  getProducts,
  updateProduct,
} from './product-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockProduct: ProductDto = {
  id: 'prod-123',
  categoryId: 'cat-456',
  category: {
    id: 'cat-456',
    name: 'Buah Lokal',
  },
  name: 'Mangga Harum Manis Super',
  description: 'Mangga manis matang pohon',
  productType: 'WEIGHT',
  pricePerKg: '35000.00',
  pricePerUnit: null,
  costPerKg: '25000.00',
  costPerUnit: null,
  stockQty: '120.500',
  minStockAlert: '20.000',
  imageUrl: 'https://example.com/mangga.jpg',
  isActive: true,
  barcodes: [
    {
      id: 'bc-1',
      barcode: '2001234567890',
      isPrimary: true,
    },
  ],
  createdAt: '2026-03-01T08:00:00.000Z',
  updatedAt: '2026-03-01T08:00:00.000Z',
};

describe('product-api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProducts', () => {
    it('mengirim query parameter lengkap dan mengembalikan data produk berpaginasi', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: [mockProduct],
          meta: {
            page: 1,
            limit: 10,
            total: 1,
          },
        },
      });

      const result = await getProducts({
        page: 1,
        limit: 10,
        search: 'mangga',
        categoryId: 'cat-456',
        type: 'WEIGHT',
        isActive: true,
        lowStock: false,
      });

      expect(apiClient.get).toHaveBeenCalledWith('/products', {
        params: {
          page: 1,
          limit: 10,
          search: 'mangga',
          categoryId: 'cat-456',
          type: 'WEIGHT',
          isActive: 'true',
          lowStock: 'false',
        },
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.name).toBe('Mangga Harum Manis Super');
      expect(result.meta.total).toBe(1);
    });

    it('menggunakan fallback default pagination saat meta tidak diberikan oleh server', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: [mockProduct],
        },
      });

      const result = await getProducts();
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
      });
    });
  });

  describe('getProductById', () => {
    it('memanggil GET /products/:id dan mengembalikan detail produk', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockProduct,
        },
      });

      const result = await getProductById('prod-123');
      expect(apiClient.get).toHaveBeenCalledWith('/products/prod-123');
      expect(result.id).toBe('prod-123');
    });
  });

  describe('getProductByBarcode', () => {
    it('memanggil GET /products/barcode/:barcode dan mengembalikan produk', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockProduct,
        },
      });

      const result = await getProductByBarcode('2001234567890');
      expect(apiClient.get).toHaveBeenCalledWith('/products/barcode/2001234567890');
      expect(result.barcodes[0]?.barcode).toBe('2001234567890');
    });
  });

  describe('createProduct', () => {
    it('memanggil POST /products dengan payload input', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: mockProduct,
        },
      });

      const payload = {
        name: 'Mangga Harum Manis Super',
        categoryId: 'cat-456',
        productType: 'WEIGHT' as const,
        pricePerKg: 35000,
        costPerKg: 25000,
      };

      const result = await createProduct(payload);
      expect(apiClient.post).toHaveBeenCalledWith('/products', payload);
      expect(result.name).toBe('Mangga Harum Manis Super');
    });
  });

  describe('updateProduct', () => {
    it('memanggil PUT /products/:id dengan data perubahan', async () => {
      vi.mocked(apiClient.put).mockResolvedValueOnce({
        data: {
          success: true,
          data: { ...mockProduct, pricePerKg: '38000.00' },
        },
      });

      const result = await updateProduct('prod-123', {
        pricePerKg: 38000,
        priceChangeReason: 'Penyesuaian harga supplier',
      });

      expect(apiClient.put).toHaveBeenCalledWith('/products/prod-123', {
        pricePerKg: 38000,
        priceChangeReason: 'Penyesuaian harga supplier',
      });
      expect(result.pricePerKg).toBe('38000.00');
    });
  });

  describe('deleteProduct', () => {
    it('memanggil DELETE /products/:id dan mengembalikan pesan sukses', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Produk berhasil dinonaktifkan',
        },
      });

      const message = await deleteProduct('prod-123');
      expect(apiClient.delete).toHaveBeenCalledWith('/products/prod-123');
      expect(message).toBe('Produk berhasil dinonaktifkan');
    });
  });

  describe('generateProductBarcode', () => {
    it('memanggil GET /products/generate-barcode dengan prefix opsional', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        data: {
          success: true,
          data: { barcode: '2001234567890' },
        },
      });

      const barcode = await generateProductBarcode('20');
      expect(apiClient.get).toHaveBeenCalledWith('/products/generate-barcode', {
        params: { prefix: '20' },
      });
      expect(barcode).toBe('2001234567890');
    });
  });
});
