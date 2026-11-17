import { z } from 'zod';
import { SHIFT_STATUSES } from '../constants/enums';
import { rangeBoundarySchema } from './date-range';
import { paginationQuerySchema } from './pagination';

export const openShiftSchema = z.object({
  openingCash: z.number().finite().min(0, 'Kas awal shift tidak boleh negatif'),
  notes: z.string().trim().max(500, 'Catatan maksimal 500 karakter').nullish(),
});

export type OpenShiftInput = z.infer<typeof openShiftSchema>;

export const closeShiftSchema = z.object({
  closingCash: z.number().finite().min(0, 'Kas akhir shift tidak boleh negatif'),
  notes: z.string().trim().max(500, 'Catatan maksimal 500 karakter').nullish(),
});

export type CloseShiftInput = z.infer<typeof closeShiftSchema>;

export const shiftIdParamSchema = z.object({
  id: z.string().uuid('ID shift tidak valid'),
});

export type ShiftIdParam = z.infer<typeof shiftIdParamSchema>;

export const shiftListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(SHIFT_STATUSES).optional(),
  userId: z.string().uuid('ID user tidak valid').optional(),
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type ShiftListQuery = z.infer<typeof shiftListQuerySchema>;
