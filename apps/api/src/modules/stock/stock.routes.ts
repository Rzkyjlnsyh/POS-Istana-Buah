import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { StockController } from './stock.controller';
import {
  createStockOpnameSchema,
  lowStockAlertQuerySchema,
  receiveStockSchema,
  stockMovementListQuerySchema,
  stockOpnameIdParamSchema,
  stockOpnameListQuerySchema,
} from './stock.dto';
import type { StockService } from './stock.service';

export interface StockRouterDependencies {
  stockService: StockService;
  authenticate: RequestHandler;
}

/**
 * Rute Manajemen Stok & Inventori (M04-001).
 * - Operasi penerimaan, opname & audit mutasi stok: khusus MANAGER & OWNER.
 * - Peringatan stok menipis (`GET /low-alert`): seluruh peran terautentikasi (tanpa data HPP).
 */
export function createStockRouter(deps: StockRouterDependencies): Router {
  const router = Router();
  const controller = new StockController(deps.stockService);
  const canManageStock = authorize('MANAGER', 'OWNER');

  router.use(deps.authenticate);

  router.post(
    '/receive',
    canManageStock,
    validateBody(receiveStockSchema),
    asyncHandler(controller.receive),
  );

  router.post(
    '/opname',
    canManageStock,
    validateBody(createStockOpnameSchema),
    asyncHandler(controller.createOpname),
  );

  router.put(
    '/opname/:id/finalize',
    canManageStock,
    validateParams(stockOpnameIdParamSchema),
    asyncHandler(controller.finalizeOpname),
  );

  router.get(
    '/opnames',
    canManageStock,
    validateQuery(stockOpnameListQuerySchema),
    asyncHandler(controller.listOpnames),
  );

  router.get(
    '/opnames/:id',
    canManageStock,
    validateParams(stockOpnameIdParamSchema),
    asyncHandler(controller.getOpnameById),
  );

  router.get(
    '/movements',
    canManageStock,
    validateQuery(stockMovementListQuerySchema),
    asyncHandler(controller.listMovements),
  );

  router.get(
    '/low-alert',
    validateQuery(lowStockAlertQuerySchema),
    asyncHandler(controller.listLowAlert),
  );

  return router;
}
