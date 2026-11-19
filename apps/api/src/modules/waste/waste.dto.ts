import { z } from 'zod';

export {
  WASTE_SUMMARY_GROUP_BY_VALUES,
  createWasteRecordSchema,
  wasteRecordListQuerySchema,
  wasteSummaryQuerySchema,
  type CreateWasteRecordInput,
  type WasteRecordListQuery,
  type WasteSummaryQuery,
} from '@istana-buah/shared';

export const wasteRecordIdParamSchema = z.object({
  id: z.string().uuid('ID catatan penyusutan tidak valid'),
});

export type WasteRecordIdParam = z.infer<typeof wasteRecordIdParamSchema>;

export interface WasteActorContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface WasteRecordListServiceQuery {
  page?: number | undefined;
  limit?: number | undefined;
  productId?: string | undefined;
  wasteType?: 'ROTTEN' | 'EXPIRED' | 'SHRINKAGE' | 'DAMAGED' | 'OTHER' | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  search?: string | undefined;
}
