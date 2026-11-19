import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { DashboardController } from './dashboard.controller';
import { dashboardChartsQuerySchema, dashboardSummaryQuerySchema } from './dashboard.dto';
import type { DashboardService } from './dashboard.service';

export interface DashboardRouterDependencies {
  dashboardService: DashboardService;
  authenticate: RequestHandler;
}

/**
 * Rute Dashboard Owner & Manajer (M08-001).
 * Akses terbatas untuk OWNER & MANAGER (memuat margin laba kotor, omzet harian & valuasi).
 */
export function createDashboardRouter(deps: DashboardRouterDependencies): Router {
  const router = Router();
  const controller = new DashboardController(deps.dashboardService);

  router.use(deps.authenticate, authorize('OWNER', 'MANAGER'));

  router.get(
    '/summary',
    validateQuery(dashboardSummaryQuerySchema),
    asyncHandler(controller.summary),
  );
  router.get('/charts', validateQuery(dashboardChartsQuerySchema), asyncHandler(controller.charts));

  return router;
}
