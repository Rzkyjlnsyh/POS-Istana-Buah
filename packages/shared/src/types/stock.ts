import type { ProductType, StockMovementType, StockOpnameStatus } from '../constants/enums';

export interface StockMovementDto {
  id: string;
  productId: string;
  productName: string;
  productType: ProductType;
  movementType: StockMovementType;
  quantity: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceId: string | null;
  referenceType: string | null;
  notes: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
}

export interface StockReceiveResultDto {
  purchaseOrderId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  totalItems: number;
  movements: StockMovementDto[];
}

export interface StockOpnameItemDto {
  id: string;
  productId: string;
  productName: string;
  productType: ProductType;
  systemQty: string;
  physicalQty: string;
  difference: string;
  notes: string | null;
  createdAt: string;
}

export interface StockOpnameDto {
  id: string;
  referenceNo: string;
  status: StockOpnameStatus;
  conductedBy: string;
  conductorName: string;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  totalItems: number;
  adjustedItemsCount: number;
  items: StockOpnameItemDto[];
}

export interface LowStockAlertItemDto {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  productType: ProductType;
  stockQty: string;
  minStockAlert: string;
  deficit: string;
  isActive: boolean;
}
