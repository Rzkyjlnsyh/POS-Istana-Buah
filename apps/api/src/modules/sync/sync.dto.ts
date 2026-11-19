import type { TransactionActorContext } from '../transactions/transaction.dto';

export {
  SYNC_OPERATION_TYPES,
  SYNC_PULL_ENTITY_TYPES,
  syncBatchBodySchema,
  syncBatchOperationSchema,
  syncPullQuerySchema,
  type SyncBatchBodyInput,
  type SyncBatchConflictItemDto,
  type SyncBatchErrorItemDto,
  type SyncBatchOperationInput,
  type SyncBatchResponseDto,
  type SyncBatchSuccessItemDto,
  type SyncPullQueryInput,
  type SyncPullResponseDto,
} from '@istana-buah/shared';

export type SyncActorContext = TransactionActorContext;
