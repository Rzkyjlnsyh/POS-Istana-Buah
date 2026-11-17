import type {
  CreatePurchaseOrderInput,
  PaginationMeta,
  PayPurchaseOrderInput,
  PurchaseOrderDto,
  PurchaseOrderIdParam,
  PurchaseOrderItemDto,
  PurchaseOrderListQuery,
} from '@istana-buah/shared';

export {
  createPurchaseOrderItemSchema,
  createPurchaseOrderSchema,
  payPurchaseOrderSchema,
  purchaseOrderIdParamSchema,
  purchaseOrderListQuerySchema,
} from '@istana-buah/shared';

export type {
  CreatePurchaseOrderInput,
  PayPurchaseOrderInput,
  PurchaseOrderDto,
  PurchaseOrderIdParam,
  PurchaseOrderItemDto,
  PurchaseOrderListQuery,
};

export interface PurchaseOrderActorContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface PurchaseOrderListResult {
  items: PurchaseOrderDto[];
  meta: PaginationMeta;
}
