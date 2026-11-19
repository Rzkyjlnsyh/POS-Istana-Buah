import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { PurchaseOrderController } from './purchase-order.controller';
import {
  createPurchaseOrderSchema,
  payPurchaseOrderSchema,
  purchaseOrderIdParamSchema,
  purchaseOrderListQuerySchema,
} from './purchase-order.dto';
import type { PurchaseOrderService } from './purchase-order.service';

export interface PurchaseOrderRouterDependencies {
  purchaseOrderService: PurchaseOrderService;
  authenticate: RequestHandler;
}

/**
 * Rute Purchase Order Supplier (M05-002).
 * Akses terbatas untuk MANAGER & OWNER.
 */
export function createPurchaseOrderRouter(deps: PurchaseOrderRouterDependencies): Router {
  const router = Router();
  const controller = new PurchaseOrderController(deps.purchaseOrderService);

  router.use(deps.authenticate, authorize('MANAGER', 'OWNER'));

  router.post('/', validateBody(createPurchaseOrderSchema), asyncHandler(controller.create));
  router.get('/', validateQuery(purchaseOrderListQuerySchema), asyncHandler(controller.list));
  router.get('/:id', validateParams(purchaseOrderIdParamSchema), asyncHandler(controller.getById));
  router.put(
    '/:id/payment',
    validateParams(purchaseOrderIdParamSchema),
    validateBody(payPurchaseOrderSchema),
    asyncHandler(controller.pay),
  );
  router.put(
    '/:id/cancel',
    validateParams(purchaseOrderIdParamSchema),
    asyncHandler(controller.cancel),
  );

  return router;
}
