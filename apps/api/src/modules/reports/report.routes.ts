import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { wasteSummaryQuerySchema } from '../waste/waste.dto';
import type { WasteService } from '../waste/waste.service';
import { ReportController } from './report.controller';
import {
  cashierPerformanceQuerySchema,
  grossProfitReportQuerySchema,
  productPerformanceQuerySchema,
  reportExportQuerySchema,
  reportExportTypeParamSchema,
  salesExportQuerySchema,
  salesSummaryQuerySchema,
  stockCurrentReportQuerySchema,
  supplierPurchasesReportQuerySchema,
} from './report.dto';
import type { ReportService } from './report.service';

export interface ReportRouterDependencies {
  reportService: ReportService;
  wasteService?: WasteService;
  authenticate: RequestHandler;
}

/**
 * Rute Laporan Penjualan, Valuasi Stok & Ekspor (M07-001).
 * Akses terbatas untuk MANAGER & OWNER (memuat data HPP & margin profitabilitas).
 */
export function createReportRouter(deps: ReportRouterDependencies): Router {
  const router = Router();
  const controller = new ReportController(deps.reportService, deps.wasteService);

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
  router.get(
    '/export/:reportType',
    validateParams(reportExportTypeParamSchema),
    validateQuery(reportExportQuerySchema),
    asyncHandler(controller.exportByType),
  );
  router.get(
    '/waste-summary',
    validateQuery(wasteSummaryQuerySchema),
    asyncHandler(controller.wasteSummary),
  );
  router.get(
    '/gross-profit',
    validateQuery(grossProfitReportQuerySchema),
    asyncHandler(controller.grossProfit),
  );
  router.get(
    '/cashier-performance',
    validateQuery(cashierPerformanceQuerySchema),
    asyncHandler(controller.cashierPerformance),
  );
  router.get(
    '/supplier-purchases',
    validateQuery(supplierPurchasesReportQuerySchema),
    asyncHandler(controller.supplierPurchases),
  );

  return router;
}
