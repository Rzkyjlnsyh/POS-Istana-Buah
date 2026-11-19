import type {
  CreateSupplierInput,
  PaginationMeta,
  SupplierDetailDto,
  SupplierDto,
  SupplierIdParam,
  SupplierListQuery,
  UpdateSupplierInput,
} from '@istana-buah/shared';

export {
  createSupplierSchema,
  supplierIdParamSchema,
  supplierListQuerySchema,
  updateSupplierSchema,
} from '@istana-buah/shared';

export type {
  CreateSupplierInput,
  SupplierDetailDto,
  SupplierDto,
  SupplierIdParam,
  SupplierListQuery,
  UpdateSupplierInput,
};

export interface SupplierActorContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SupplierListResult {
  items: SupplierDto[];
  meta: PaginationMeta;
}
