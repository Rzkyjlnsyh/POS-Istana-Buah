/**
 * Enum domain bersama (sumber: Bagian 6.2 schema Prisma).
 * Dipakai sebagai nilai literal agar FE & BE sepakat tanpa bergantung pada Prisma Client.
 */

export const USER_ROLES = ['OWNER', 'MANAGER', 'CASHIER'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PRODUCT_TYPES = ['WEIGHT', 'UNIT'] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PAYMENT_METHODS = ['CASH', 'QRIS', 'BANK_TRANSFER', 'MIXED'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const TRANSACTION_STATUSES = ['PENDING', 'COMPLETED', 'VOIDED', 'PENDING_SYNC'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const STOCK_MOVEMENT_TYPES = [
  'PURCHASE_IN',
  'SALE_OUT',
  'WASTE_OUT',
  'OPNAME_ADJUST',
  'RETURN_IN',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'INITIAL',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const WASTE_TYPES = ['ROTTEN', 'EXPIRED', 'SHRINKAGE', 'DAMAGED', 'OTHER'] as const;
export type WasteType = (typeof WASTE_TYPES)[number];

export const SHIFT_STATUSES = ['OPEN', 'CLOSED'] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];
