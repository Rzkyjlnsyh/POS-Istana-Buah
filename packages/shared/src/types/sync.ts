import type { CreateTransactionInput } from '../validators/transaction';
import type { CategoryDto } from './category';
import type { ProductDto } from './product';

export type SyncOperationType = 'TRANSACTION';

export type SyncPullEntityType = 'products' | 'categories';

export interface SyncBatchOperationDto {
  type: SyncOperationType;
  clientId: string;
  data: CreateTransactionInput;
  timestamp: string;
}

export interface SyncBatchRequestDto {
  deviceId: string;
  operations: SyncBatchOperationDto[];
}

export interface SyncBatchSuccessItemDto {
  clientId: string;
  serverId: string;
  transactionNo: string;
}

export interface SyncBatchConflictItemDto {
  clientId: string;
  reason: string;
  code: string;
}

export interface SyncBatchErrorItemDto {
  clientId: string;
  message: string;
  code: string;
}

export interface SyncBatchResponseDto {
  processed: number;
  success: SyncBatchSuccessItemDto[];
  conflicts: SyncBatchConflictItemDto[];
  errors: SyncBatchErrorItemDto[];
}

export interface SyncPullResponseDto {
  serverTime: string;
  products: ProductDto[];
  categories: CategoryDto[];
}
