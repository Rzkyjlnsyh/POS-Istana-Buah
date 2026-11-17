import type { PurchaseOrderStatus } from '../constants/enums';

export interface SupplierDto {
  id: string;
  name: string;
  contactPerson: string | null;
  phoneNumber: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  purchaseOrderCount: number;
  totalPurchaseAmount: string;
  outstandingDebt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPurchaseOrderBriefDto {
  id: string;
  referenceNo: string | null;
  status: PurchaseOrderStatus;
  totalAmount: string;
  paidAmount: string;
  remainingDebt: string;
  deliveredAt: string | null;
  createdAt: string;
}

export interface SupplierDetailDto extends SupplierDto {
  recentPurchaseOrders: SupplierPurchaseOrderBriefDto[];
}
