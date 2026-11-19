import { z } from 'zod';
import { rangeBoundarySchema } from './date-range';

export const REPORT_GROUP_BY_VALUES = ['day', 'week', 'month'] as const;
export const PRODUCT_PERFORMANCE_SORT_VALUES = ['revenue', 'qty'] as const;
export const SALES_EXPORT_FORMATS = ['csv', 'excel', 'pdf'] as const;
export const REPORT_EXPORT_TYPES = [
  'sales',
  'gross-profit',
  'cashier-performance',
  'supplier-purchases',
  'stock-current',
  'waste-summary',
] as const;

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

export const grossProfitReportQuerySchema = z.object({
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  groupBy: z.enum(REPORT_GROUP_BY_VALUES).default('day'),
});

export type GrossProfitReportQuery = z.infer<typeof grossProfitReportQuerySchema>;

export const cashierPerformanceQuerySchema = z.object({
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  cashierId: z.string().uuid('ID kasir tidak valid').optional(),
});

export type CashierPerformanceQuery = z.infer<typeof cashierPerformanceQuerySchema>;

export const supplierPurchasesReportQuerySchema = z.object({
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  supplierId: z.string().uuid('ID supplier tidak valid').optional(),
});

export type SupplierPurchasesReportQuery = z.infer<typeof supplierPurchasesReportQuerySchema>;

export const reportExportTypeParamSchema = z.object({
  reportType: z.enum(REPORT_EXPORT_TYPES),
});

export type ReportExportTypeParam = z.infer<typeof reportExportTypeParamSchema>;

export const reportExportQuerySchema = z.object({
  format: z.enum(SALES_EXPORT_FORMATS).default('pdf'),
  startDate: rangeBoundarySchema,
  endDate: rangeBoundarySchema,
  groupBy: z.enum(REPORT_GROUP_BY_VALUES).optional(),
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
  cashierId: z.string().uuid('ID kasir tidak valid').optional(),
  supplierId: z.string().uuid('ID supplier tidak valid').optional(),
});

export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
