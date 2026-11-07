import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { ProductController } from './product.controller';
import {
  createProductSchema,
  productBarcodeParamSchema,
  productIdParamSchema,
  productListQuerySchema,
  updateProductSchema,
} from './product.dto';
import type { ProductService } from './product.service';

export interface ProductRouterDependencies {
  productService: ProductService;
  authenticate: RequestHandler;
}

/**
 * Rute produk (M02-002).
 * - Baca (list, barcode, detail): semua peran terautentikasi (POS kasir, manajer, owner).
 * - Tulis (create, update, delete): hanya MANAGER & OWNER (RBAC fail-closed).
 */
export function createProductRouter(deps: ProductRouterDependencies): Router {
  const router = Router();
  const controller = new ProductController(deps.productService);
  const canWrite = authorize('MANAGER', 'OWNER');

  router.use(deps.authenticate);

  router.get('/', validateQuery(productListQuerySchema), asyncHandler(controller.list));
  router.get(
    '/barcode/:barcode',
    validateParams(productBarcodeParamSchema),
    asyncHandler(controller.getByBarcode),
  );
  router.get('/:id', validateParams(productIdParamSchema), asyncHandler(controller.getById));

  router.post('/', canWrite, validateBody(createProductSchema), asyncHandler(controller.create));
  router.put(
    '/:id',
    canWrite,
    validateParams(productIdParamSchema),
    validateBody(updateProductSchema),
    asyncHandler(controller.update),
  );
  router.delete(
    '/:id',
    canWrite,
    validateParams(productIdParamSchema),
    asyncHandler(controller.remove),
  );

  return router;
}
