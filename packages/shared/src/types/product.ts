import type { ProductType } from '../constants/enums';

export interface ProductBarcodeDto {
  id: string;
  barcode: string;
  isPrimary: boolean;
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
