import type {
  CreateTransactionInput,
  CreateTransactionItemInput,
  ReceiptDataDto,
  TransactionDto,
  TransactionIdParam,
  TransactionItemDto,
  TransactionListQuery,
  TransactionListResponse,
  UserRole,
  VoidTransactionInput,
} from '@istana-buah/shared';

export {
  createTransactionItemSchema,
  createTransactionSchema,
  transactionIdParamSchema,
  transactionListQuerySchema,
  voidTransactionSchema,
} from '@istana-buah/shared';

export type {
  CreateTransactionInput,
  CreateTransactionItemInput,
  ReceiptDataDto,
  TransactionDto,
  TransactionIdParam,
  TransactionItemDto,
  TransactionListQuery,
  TransactionListResponse,
  VoidTransactionInput,
};

export interface TransactionActorContext {
  userId: string;
  role: UserRole;
  fullName?: string;
  ipAddress: string | null;
  userAgent: string | null;
}
