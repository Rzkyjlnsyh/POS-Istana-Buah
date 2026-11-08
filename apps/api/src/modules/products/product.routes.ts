import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { ProductController } from './product.controller';
import {
  addProductBarcodeSchema,
  createProductSchema,
  generateBarcodeQuerySchema,
  productBarcodeIdParamSchema,
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
 * Rute produk & barcode (M02-002, M02-003).
 * - Baca (list, barcode, detail): semua peran terautentikasi (POS kasir, manajer, owner).
 * - Tulis (create, update, delete, barcode manage): hanya MANAGER & OWNER (RBAC fail-closed).
 */
export function createProductRouter(deps: ProductRouterDependencies): Router {
  const router = Router();
  const controller = new ProductController(deps.productService);
  const canWrite = authorize('MANAGER', 'OWNER');

  router.use(deps.authenticate);

  // Endpoint pencarian / generate statis didahulukan sebelum matcher dinamis /:id
  router.get(
    '/generate-barcode',
    canWrite,
    validateQuery(generateBarcodeQuerySchema),
    asyncHandler(controller.generateBarcode),
  );
  router.get(
    '/barcode/:barcode',
    validateParams(productBarcodeParamSchema),
    asyncHandler(controller.getByBarcode),
  );
  router.get('/', validateQuery(productListQuerySchema), asyncHandler(controller.list));
  router.get('/:id', validateParams(productIdParamSchema), asyncHandler(controller.getById));

  // Operasi CRUD Produk
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

  // Operasi Barcode Produk (M02-003)
  router.post(
    '/:id/barcodes/generate',
    canWrite,
    validateParams(productIdParamSchema),
    validateQuery(generateBarcodeQuerySchema),
    asyncHandler(controller.generateAndAttachBarcode),
  );
  router.post(
    '/:id/barcodes',
    canWrite,
    validateParams(productIdParamSchema),
    validateBody(addProductBarcodeSchema),
    asyncHandler(controller.addBarcode),
  );
  router.delete(
    '/:id/barcodes/:barcodeId',
    canWrite,
    validateParams(productBarcodeIdParamSchema),
    asyncHandler(controller.removeBarcode),
  );
  router.patch(
    '/:id/barcodes/:barcodeId/primary',
    canWrite,
    validateParams(productBarcodeIdParamSchema),
    asyncHandler(controller.setPrimaryBarcode),
  );

  return router;
}
