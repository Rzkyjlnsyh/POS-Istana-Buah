import type { PaymentMethod, ProductType, TransactionStatus } from '../constants/enums';
import type { PaginationMeta } from './api';

export interface TransactionItemDto {
  id: string;
  transactionId: string;
  productId: string;
  productName: string;
  productType: ProductType;
  quantity: string; // Decimal string (kg atau pcs)
  unitPrice: string; // Decimal string
  unitCost?: string | null; // Hanya jika diizinkan (OWNER/MANAGER)
  discountAmount: string; // Decimal string
  lineTotal: string; // Decimal string
  createdAt: string;
}

export interface ReceiptDataDto {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  transactionNo: string;
  cashierName: string;
  transactedAt: string;
  paymentMethod: PaymentMethod;
  items: Array<{
    name: string;
    quantity: string;
    productType: ProductType;
    unitPrice: string;
    lineTotal: string;
  }>;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  changeAmount: string;
  footerMessage: string;
}

export interface TransactionDto {
  id: string;
  transactionNo: string;
  shiftId: string | null;
  cashierId: string;
  cashierName: string;
  status: TransactionStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paymentMethod: PaymentMethod;
  amountPaid: string;
  changeAmount: string;
  notes: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  clientId: string | null;
  syncedAt: string | null;
  transactedAt: string;
  createdAt: string;
  updatedAt: string;
  items: TransactionItemDto[];
  receiptData?: ReceiptDataDto;
}

export interface TransactionListResponse {
  items: TransactionDto[];
  meta: PaginationMeta;
}
