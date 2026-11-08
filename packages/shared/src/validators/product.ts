import { z } from 'zod';
import { PRODUCT_TYPES } from '../constants/enums';
import { paginationQuerySchema } from './pagination';

export const PRODUCT_NAME_MIN_LENGTH = 2;
export const PRODUCT_NAME_MAX_LENGTH = 150;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 1000;
export const PRODUCT_SEARCH_MAX_LENGTH = 100;
export const BARCODE_MIN_LENGTH = 3;
export const BARCODE_MAX_LENGTH = 50;
export const MAX_BARCODES_PER_PRODUCT = 10;

const productNameSchema = z
  .string()
  .trim()
  .min(PRODUCT_NAME_MIN_LENGTH, `Nama produk minimal ${String(PRODUCT_NAME_MIN_LENGTH)} karakter`)
  .max(PRODUCT_NAME_MAX_LENGTH, `Nama produk maksimal ${String(PRODUCT_NAME_MAX_LENGTH)} karakter`);

const productDescriptionSchema = z
  .string()
  .trim()
  .max(
    PRODUCT_DESCRIPTION_MAX_LENGTH,
    `Deskripsi maksimal ${String(PRODUCT_DESCRIPTION_MAX_LENGTH)} karakter`,
  )
  .transform((value) => (value.length === 0 ? null : value));

export const barcodeStringSchema = z
  .string()
  .trim()
  .min(BARCODE_MIN_LENGTH, `Barcode minimal ${String(BARCODE_MIN_LENGTH)} karakter`)
  .max(BARCODE_MAX_LENGTH, `Barcode maksimal ${String(BARCODE_MAX_LENGTH)} karakter`)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    'Barcode hanya boleh berisi alfanumerik, dash (-), atau underscore (_)',
  );

const baseProductFields = {
  name: productNameSchema,
  categoryId: z.string().uuid('ID kategori tidak valid'),
  description: productDescriptionSchema.nullish(),
  minStockAlert: z.number().min(0, 'Peringatan stok minimum tidak boleh negatif').nullish(),
  barcodes: z
    .array(barcodeStringSchema)
    .max(MAX_BARCODES_PER_PRODUCT, 'Maksimal 10 barcode per produk')
    .optional(),
  imageUrl: z.string().trim().max(500).nullish(),
  isActive: z.boolean().optional(),
};

export const createProductSchema = z
  .object({
    ...baseProductFields,
    productType: z.enum(PRODUCT_TYPES),
    pricePerKg: z.number().positive('Harga per kg harus lebih besar dari 0').nullish(),
    pricePerUnit: z.number().positive('Harga per satuan harus lebih besar dari 0').nullish(),
    costPerKg: z.number().min(0, 'HPP per kg tidak boleh negatif').nullish(),
    costPerUnit: z.number().min(0, 'HPP per satuan tidak boleh negatif').nullish(),
  })
  .superRefine((data, ctx) => {
    if (data.productType === 'WEIGHT') {
      if (data.pricePerKg === undefined || data.pricePerKg === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricePerKg'],
          message: 'Produk bertipe WEIGHT wajib memiliki harga per kg (pricePerKg)',
        });
      }
      if (data.pricePerUnit !== undefined && data.pricePerUnit !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricePerUnit'],
          message: 'Produk bertipe WEIGHT tidak boleh memiliki harga per unit (pricePerUnit)',
        });
      }
      if (data.costPerUnit !== undefined && data.costPerUnit !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['costPerUnit'],
          message: 'Produk bertipe WEIGHT tidak boleh memiliki HPP per unit (costPerUnit)',
        });
      }
    } else if (data.productType === 'UNIT') {
      if (data.pricePerUnit === undefined || data.pricePerUnit === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricePerUnit'],
          message: 'Produk bertipe UNIT wajib memiliki harga per unit (pricePerUnit)',
        });
      }
      if (data.pricePerKg !== undefined && data.pricePerKg !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricePerKg'],
          message: 'Produk bertipe UNIT tidak boleh memiliki harga per kg (pricePerKg)',
        });
      }
      if (data.costPerKg !== undefined && data.costPerKg !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['costPerKg'],
          message: 'Produk bertipe UNIT tidak boleh memiliki HPP per kg (costPerKg)',
        });
      }
    }
  });

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    name: productNameSchema.optional(),
    categoryId: z.string().uuid('ID kategori tidak valid').optional(),
    description: productDescriptionSchema.nullish(),
    productType: z.enum(PRODUCT_TYPES).optional(),
    pricePerKg: z.number().positive('Harga per kg harus lebih besar dari 0').nullish(),
    pricePerUnit: z.number().positive('Harga per satuan harus lebih besar dari 0').nullish(),
    costPerKg: z.number().min(0, 'HPP per kg tidak boleh negatif').nullish(),
    costPerUnit: z.number().min(0, 'HPP per satuan tidak boleh negatif').nullish(),
    minStockAlert: z.number().min(0, 'Peringatan stok minimum tidak boleh negatif').nullish(),
    barcodes: z
      .array(barcodeStringSchema)
      .max(MAX_BARCODES_PER_PRODUCT, 'Maksimal 10 barcode per produk')
      .optional(),
    imageUrl: z.string().trim().max(500).nullish(),
    isActive: z.boolean().optional(),
    priceChangeReason: z.string().trim().max(255).optional(),
  })
  .refine((data) => Object.values(data).some((val) => val !== undefined), {
    message: 'Minimal satu field produk harus diubah',
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productIdParamSchema = z.object({
  id: z.string().uuid('ID produk tidak valid'),
});

export type ProductIdParam = z.infer<typeof productIdParamSchema>;

export const productBarcodeParamSchema = z.object({
  barcode: barcodeStringSchema,
});

export type ProductBarcodeParam = z.infer<typeof productBarcodeParamSchema>;

export const addProductBarcodeSchema = z.object({
  barcode: barcodeStringSchema,
  isPrimary: z.boolean().optional(),
});

export type AddProductBarcode = z.infer<typeof addProductBarcodeSchema>;

export const productBarcodeIdParamSchema = z.object({
  id: z.string().uuid('ID produk tidak valid'),
  barcodeId: z.string().uuid('ID barcode tidak valid'),
});

export type ProductBarcodeIdParam = z.infer<typeof productBarcodeIdParamSchema>;

export const generateBarcodeQuerySchema = z.object({
  prefix: z
    .string()
    .trim()
    .regex(/^\d{2,4}$/, 'Prefix barcode harus berupa 2-4 digit angka')
    .optional(),
});

export type GenerateBarcodeQuery = z.infer<typeof generateBarcodeQuerySchema>;

export const productListQuerySchema = paginationQuerySchema.extend({
  search: z
    .string()
    .trim()
    .max(PRODUCT_SEARCH_MAX_LENGTH)
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
  categoryId: z.string().uuid('ID kategori filter tidak valid').optional(),
  type: z.enum(PRODUCT_TYPES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
});

export type ProductListQuery = z.infer<typeof productListQuerySchema>;
