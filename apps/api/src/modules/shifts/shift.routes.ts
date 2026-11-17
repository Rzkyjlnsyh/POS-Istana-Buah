import { Router, type RequestHandler } from 'express';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { ShiftController } from './shift.controller';
import {
  closeShiftSchema,
  openShiftSchema,
  shiftIdParamSchema,
  shiftListQuerySchema,
} from './shift.dto';
import type { ShiftService } from './shift.service';

export interface ShiftRouterDependencies {
  shiftService: ShiftService;
  authenticate: RequestHandler;
}

/**
 * Rute Shift Kasir (M06-001).
 * Akses tersedia untuk CASHIER, MANAGER, & OWNER dengan isolasi kepemilikan pada CASHIER.
 */
export function createShiftRouter(deps: ShiftRouterDependencies): Router {
  const router = Router();
  const controller = new ShiftController(deps.shiftService);

  router.use(deps.authenticate);

  router.post('/open', validateBody(openShiftSchema), asyncHandler(controller.open));
  router.get('/active', asyncHandler(controller.getActive));
  router.get('/', validateQuery(shiftListQuerySchema), asyncHandler(controller.list));
  router.get('/:id', validateParams(shiftIdParamSchema), asyncHandler(controller.getById));
  router.put(
    '/:id/close',
    validateParams(shiftIdParamSchema),
    validateBody(closeShiftSchema),
    asyncHandler(controller.close),
  );

  return router;
}
