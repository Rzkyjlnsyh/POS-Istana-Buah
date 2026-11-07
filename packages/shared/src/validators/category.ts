import { z } from 'zod';
import { paginationQuerySchema } from './pagination';

export const CATEGORY_NAME_MIN_LENGTH = 2;
export const CATEGORY_NAME_MAX_LENGTH = 100;
export const CATEGORY_DESCRIPTION_MAX_LENGTH = 500;
export const CATEGORY_SORT_ORDER_MAX = 9999;
export const CATEGORY_SEARCH_MAX_LENGTH = 100;

const categoryNameSchema = z
  .string()
  .trim()
  .min(
    CATEGORY_NAME_MIN_LENGTH,
    `Nama kategori minimal ${String(CATEGORY_NAME_MIN_LENGTH)} karakter`,
  )
  .max(
    CATEGORY_NAME_MAX_LENGTH,
    `Nama kategori maksimal ${String(CATEGORY_NAME_MAX_LENGTH)} karakter`,
  );

const categoryDescriptionSchema = z
  .string()
  .trim()
  .max(
    CATEGORY_DESCRIPTION_MAX_LENGTH,
    `Deskripsi maksimal ${String(CATEGORY_DESCRIPTION_MAX_LENGTH)} karakter`,
  )
  .transform((value) => (value.length === 0 ? null : value));

const categorySortOrderSchema = z
  .number()
  .int('Urutan harus bilangan bulat')
  .min(0, 'Urutan tidak boleh negatif')
  .max(CATEGORY_SORT_ORDER_MAX, `Urutan maksimal ${String(CATEGORY_SORT_ORDER_MAX)}`);

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  description: categoryDescriptionSchema.nullish(),
  sortOrder: categorySortOrderSchema.optional(),
  isActive: z.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: categoryNameSchema.optional(),
    description: categoryDescriptionSchema.nullish(),
    sortOrder: categorySortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Minimal satu field kategori harus diubah',
  });

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const categoryIdParamSchema = z.object({
  id: z.string().uuid('ID kategori tidak valid'),
});

export type CategoryIdParam = z.infer<typeof categoryIdParamSchema>;

export const categoryListQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(CATEGORY_SEARCH_MAX_LENGTH)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});

export type CategoryListQuery = z.infer<typeof categoryListQuerySchema>;
