import type {
  CloseShiftInput,
  OpenShiftInput,
  PaginationMeta,
  ShiftDto,
  ShiftIdParam,
  ShiftListQuery,
  ShiftPaymentSummaryDto,
  UserRole,
} from '@istana-buah/shared';

export {
  closeShiftSchema,
  openShiftSchema,
  shiftIdParamSchema,
  shiftListQuerySchema,
} from '@istana-buah/shared';

export type {
  CloseShiftInput,
  OpenShiftInput,
  ShiftDto,
  ShiftIdParam,
  ShiftListQuery,
  ShiftPaymentSummaryDto,
};

export interface ShiftActorContext {
  userId: string;
  role: UserRole;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ShiftListResult {
  items: ShiftDto[];
  meta: PaginationMeta;
}
