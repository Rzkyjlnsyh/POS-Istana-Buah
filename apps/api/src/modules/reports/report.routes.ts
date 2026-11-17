import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { ReportController } from './report.controller';
import {
  productPerformanceQuerySchema,
  salesExportQuerySchema,
  salesSummaryQuerySchema,
  stockCurrentReportQuerySchema,
} from './report.dto';
import type { ReportService } from './report.service';

export interface ReportRouterDependencies {
  reportService: ReportService;
  authenticate: RequestHandler;
}

/**
 * Rute Laporan Penjualan, Valuasi Stok & Ekspor (M07-001).
 * Akses terbatas untuk MANAGER & OWNER (memuat data HPP & margin profitabilitas).
 */
export function createReportRouter(deps: ReportRouterDependencies): Router {
  const router = Router();
  const controller = new ReportController(deps.reportService);

  router.use(deps.authenticate, authorize('OWNER', 'MANAGER'));

  router.get(
    '/sales-summary',
    validateQuery(salesSummaryQuerySchema),
    asyncHandler(controller.salesSummary),
  );
  router.get(
    '/product-performance',
    validateQuery(productPerformanceQuerySchema),
    asyncHandler(controller.productPerformance),
  );
  router.get(
    '/stock-current',
    validateQuery(stockCurrentReportQuerySchema),
    asyncHandler(controller.stockCurrent),
  );
  router.get(
    '/export/sales',
    validateQuery(salesExportQuerySchema),
    asyncHandler(controller.exportSales),
  );

  return router;
}
