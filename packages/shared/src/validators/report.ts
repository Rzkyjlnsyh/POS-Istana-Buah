import { z } from 'zod';
import { rangeBoundarySchema } from './date-range';

export const REPORT_GROUP_BY_VALUES = ['day', 'week', 'month'] as const;
export const PRODUCT_PERFORMANCE_SORT_VALUES = ['revenue', 'qty'] as const;
export const SALES_EXPORT_FORMATS = ['csv', 'excel', 'pdf'] as const;

export const salesSummaryQuerySchema = z.object({
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  groupBy: z.enum(REPORT_GROUP_BY_VALUES).default('day'),
});

export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;

export const productPerformanceQuerySchema = z.object({
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  sortBy: z.enum(PRODUCT_PERFORMANCE_SORT_VALUES).default('revenue'),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type ProductPerformanceQuery = z.infer<typeof productPerformanceQuerySchema>;

export const stockCurrentReportQuerySchema = z.object({
  categoryId: z.string().uuid('ID kategori tidak valid').optional(),
  lowStockOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type StockCurrentReportQuery = z.infer<typeof stockCurrentReportQuerySchema>;

export const salesExportQuerySchema = z.object({
  format: z.enum(SALES_EXPORT_FORMATS).default('csv'),
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
});

export type SalesExportQuery = z.infer<typeof salesExportQuerySchema>;
