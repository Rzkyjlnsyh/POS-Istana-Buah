import { z } from 'zod';
import { WASTE_TYPES } from '../constants/enums';
import { rangeBoundarySchema } from './date-range';
import { paginationQuerySchema } from './pagination';

export const WASTE_SUMMARY_GROUP_BY_VALUES = ['day', 'month'] as const;

const SAFE_PHOTO_URL_RE = /^(https?:\/\/[^\s]+|\/[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=-]+)$/;

export const createWasteRecordSchema = z.object({
  productId: z.string().uuid('ID produk tidak valid'),
  wasteType: z.enum(WASTE_TYPES, {
    message: 'Jenis penyusutan harus ROTTEN, EXPIRED, SHRINKAGE, DAMAGED, atau OTHER',
  }),
  quantity: z
    .number()
    .positive('Jumlah penyusutan harus lebih besar dari 0')
    .max(100000, 'Jumlah penyusutan melebihi batas maksimum'),
  reason: z
    .string()
    .trim()
    .min(3, 'Alasan penyusutan minimal 3 karakter')
    .max(500, 'Alasan penyusutan maksimal 500 karakter'),
  photoUrl: z
    .string()
    .trim()
    .max(500, 'URL foto maksimal 500 karakter')
    .refine(
      (val) => SAFE_PHOTO_URL_RE.test(val),
      'URL foto harus berupa URL http(s) atau path internal yang valid',
    )
    .optional()
    .nullable(),
  recordedAt: z
    .string()
    .datetime({ offset: true, message: 'Format waktu pencatatan harus ISO-8601' })
    .optional(),
});

export type CreateWasteRecordInput = z.infer<typeof createWasteRecordSchema>;

export const wasteRecordListQuerySchema = paginationQuerySchema.extend({
  productId: z.string().uuid('ID produk tidak valid').optional(),
  wasteType: z.enum(WASTE_TYPES).optional(),
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type WasteRecordListQuery = z.infer<typeof wasteRecordListQuerySchema>;

export const wasteSummaryQuerySchema = z.object({
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  groupBy: z.enum(WASTE_SUMMARY_GROUP_BY_VALUES).default('day'),
});

export type WasteSummaryQuery = z.infer<typeof wasteSummaryQuerySchema>;
