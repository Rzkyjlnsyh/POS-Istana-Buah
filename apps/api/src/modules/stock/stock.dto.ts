import type {
  CreateStockOpnameInput,
  LowStockAlertItemDto,
  LowStockAlertQuery,
  PaginationMeta,
  ReceiveStockInput,
  StockMovementDto,
  StockMovementListQuery,
  StockOpnameDto,
  StockOpnameIdParam,
  StockOpnameItemDto,
  StockOpnameListQuery,
  StockReceiveResultDto,
  UserRole,
} from '@istana-buah/shared';

export {
  createStockOpnameSchema,
  lowStockAlertQuerySchema,
  receiveStockItemSchema,
  receiveStockSchema,
  stockMovementListQuerySchema,
  stockOpnameIdParamSchema,
  stockOpnameItemInputSchema,
  stockOpnameListQuerySchema,
} from '@istana-buah/shared';

export type {
  CreateStockOpnameInput,
  LowStockAlertItemDto,
  LowStockAlertQuery,
  ReceiveStockInput,
  StockMovementDto,
  StockMovementListQuery,
  StockOpnameDto,
  StockOpnameIdParam,
  StockOpnameItemDto,
  StockOpnameListQuery,
  StockReceiveResultDto,
};

export interface StockActorContext {
  userId: string;
  role: UserRole;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface StockMovementListResult {
  items: StockMovementDto[];
  meta: PaginationMeta;
}

export interface StockOpnameListResult {
  items: StockOpnameDto[];
  meta: PaginationMeta;
}

export interface LowStockAlertListResult {
  items: LowStockAlertItemDto[];
  meta: PaginationMeta;
}
