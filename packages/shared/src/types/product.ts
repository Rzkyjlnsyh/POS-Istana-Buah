import type { ProductType } from '../constants/enums';

export interface ProductBarcodeDto {
  id: string;
  barcode: string;
  isPrimary: boolean;
}

export interface AddProductBarcodeDto {
  barcode: string;
  isPrimary?: boolean;
}

export interface GenerateBarcodeResult {
  barcode: string;
}

export interface ProductCategoryRef {
  id: string;
  name: string;
}

export interface ProductDto {
  id: string;
  categoryId: string;
  category: ProductCategoryRef;
  name: string;
  description: string | null;
  productType: ProductType;
  pricePerKg: string | null;
  pricePerUnit: string | null;
  /** HPP per kg (disembunyikan dari CASHIER, hanya tampak bagi OWNER/MANAGER per NFR-SEC-09). */
  costPerKg: string | null;
  /** HPP per pcs (disembunyikan dari CASHIER, hanya tampak bagi OWNER/MANAGER per NFR-SEC-09). */
  costPerUnit: string | null;
  stockQty: string;
  minStockAlert: string | null;
  imageUrl: string | null;
  isActive: boolean;
  barcodes: ProductBarcodeDto[];
  createdAt: string;
  updatedAt: string;
}

export interface BatchImportProductItem {
  name: string;
  categoryName: string;
  productType: ProductType;
  price: number;
  cost?: number | null;
  stockQty?: number | null;
  minStockAlert?: number | null;
  barcode?: string | null;
  description?: string | null;
}

export interface BatchImportProductsInput {
  items: BatchImportProductItem[];
}

export interface BatchImportRowError {
  row: number;
  name?: string;
  message: string;
}

export interface BatchImportProductResult {
  totalProcessed: number;
  importedCount: number;
  failedCount: number;
  errors: BatchImportRowError[];
  createdProductIds: string[];
}
