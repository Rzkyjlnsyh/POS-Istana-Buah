import { z } from 'zod';

export const DASHBOARD_CHART_PRESETS = [7, 14, 30] as const;

export const dashboardSummaryQuerySchema = z.object({
  topLimit: z.coerce.number().int().min(1).max(20).default(5),
  lowStockLimit: z.coerce.number().int().min(1).max(20).default(5),
});

export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;

export const dashboardChartsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});

export type DashboardChartsQuery = z.infer<typeof dashboardChartsQuerySchema>;
