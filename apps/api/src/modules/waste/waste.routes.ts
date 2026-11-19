import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { WasteController } from './waste.controller';
import {
  createWasteRecordSchema,
  wasteRecordIdParamSchema,
  wasteRecordListQuerySchema,
} from './waste.dto';
import type { WasteService } from './waste.service';

export interface WasteRouterDependencies {
  wasteService: WasteService;
  authenticate: RequestHandler;
}

/**
 * Rute Manajemen Penyusutan & Kerusakan Buah (M09-001).
 * Akses terbatas untuk OWNER & MANAGER (menyimpan kerugian HPP).
 */
export function createWasteRouter(deps: WasteRouterDependencies): Router {
  const router = Router();
  const controller = new WasteController(deps.wasteService);

  router.use(deps.authenticate, authorize('OWNER', 'MANAGER'));

  router.post('/', validateBody(createWasteRecordSchema), asyncHandler(controller.create));
  router.get('/', validateQuery(wasteRecordListQuerySchema), asyncHandler(controller.list));
  router.get('/:id', validateParams(wasteRecordIdParamSchema), asyncHandler(controller.getById));

  return router;
}
