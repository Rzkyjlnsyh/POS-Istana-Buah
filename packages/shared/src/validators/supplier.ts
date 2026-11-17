import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

export const SUPPLIER_NAME_MIN_LENGTH = 2;
export const SUPPLIER_NAME_MAX_LENGTH = 120;

const optionalTrimmedText = (maxLen: number, label: string) =>
  z
    .string()
    .trim()
    .max(maxLen, `${label} maksimal ${String(maxLen)} karakter`)
    .transform((v) => (v.length === 0 ? null : v))
    .nullish();

export const createSupplierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(
      SUPPLIER_NAME_MIN_LENGTH,
      `Nama supplier minimal ${String(SUPPLIER_NAME_MIN_LENGTH)} karakter`,
    )
    .max(
      SUPPLIER_NAME_MAX_LENGTH,
      `Nama supplier maksimal ${String(SUPPLIER_NAME_MAX_LENGTH)} karakter`,
    ),
  contactPerson: optionalTrimmedText(120, 'Nama kontak'),
  phoneNumber: optionalTrimmedText(30, 'Nomor telepon'),
  address: optionalTrimmedText(500, 'Alamat'),
  notes: optionalTrimmedText(1000, 'Catatan'),
  isActive: z.boolean().optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema
  .partial()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Minimal satu field supplier harus diubah',
  });

export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const supplierIdParamSchema = z.object({
  id: z.string().uuid('ID supplier tidak valid'),
});

export type SupplierIdParam = z.infer<typeof supplierIdParamSchema>;

export const supplierListQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});

export type SupplierListQuery = z.infer<typeof supplierListQuerySchema>;
