import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { SupplierController } from './supplier.controller';
import {
  createSupplierSchema,
  supplierIdParamSchema,
  supplierListQuerySchema,
  updateSupplierSchema,
} from './supplier.dto';
import type { SupplierService } from './supplier.service';

export interface SupplierRouterDependencies {
  supplierService: SupplierService;
  authenticate: RequestHandler;
}

/**
 * Rute Manajemen Supplier (M05-001).
 * Akses terbatas untuk MANAGER & OWNER (data pemasok dan hutang dagang bersifat rahasia).
 */
export function createSupplierRouter(deps: SupplierRouterDependencies): Router {
  const router = Router();
  const controller = new SupplierController(deps.supplierService);

  router.use(deps.authenticate, authorize('MANAGER', 'OWNER'));

  router.get('/', validateQuery(supplierListQuerySchema), asyncHandler(controller.list));
  router.get('/:id', validateParams(supplierIdParamSchema), asyncHandler(controller.getById));
  router.post('/', validateBody(createSupplierSchema), asyncHandler(controller.create));
  router.put(
    '/:id',
    validateParams(supplierIdParamSchema),
    validateBody(updateSupplierSchema),
    asyncHandler(controller.update),
  );
  router.delete('/:id', validateParams(supplierIdParamSchema), asyncHandler(controller.remove));

  return router;
}
