import type { ProductType, PurchaseOrderStatus } from '../constants/enums';

export interface PurchaseOrderItemDto {
  id: string;
  productId: string;
  productName: string;
  productType: ProductType;
  quantity: string;
  unitCost: string;
  totalCost: string;
  createdAt: string;
}

export interface PurchaseOrderDto {
  id: string;
  supplierId: string;
  supplierName: string;
  referenceNo: string | null;
  totalAmount: string;
  paidAmount: string;
  remainingDebt: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  deliveredAt: string | null;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseOrderItemDto[];
}
