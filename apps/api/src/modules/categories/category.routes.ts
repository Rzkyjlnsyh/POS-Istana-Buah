import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { CategoryController } from './category.controller';
import {
  categoryIdParamSchema,
  categoryListQuerySchema,
  createCategorySchema,
  updateCategorySchema,
} from './category.dto';
import type { CategoryService } from './category.service';

export interface CategoryRouterDependencies {
  categoryService: CategoryService;
  authenticate: RequestHandler;
}

/**
 * Rute kategori (M02-001). Baca: semua peran terautentikasi (POS membutuhkan tab kategori).
 * Tulis: hanya MANAGER & OWNER (OWASP A01, fail-closed).
 */
export function createCategoryRouter(deps: CategoryRouterDependencies): Router {
  const router = Router();
  const controller = new CategoryController(deps.categoryService);
  const canWrite = authorize('MANAGER', 'OWNER');

  router.use(deps.authenticate);

  router.get('/', validateQuery(categoryListQuerySchema), asyncHandler(controller.list));
  router.get('/:id', validateParams(categoryIdParamSchema), asyncHandler(controller.getById));

  router.post('/', canWrite, validateBody(createCategorySchema), asyncHandler(controller.create));
  router.put(
    '/:id',
    canWrite,
    validateParams(categoryIdParamSchema),
    validateBody(updateCategorySchema),
    asyncHandler(controller.update),
  );
  router.delete(
    '/:id',
    canWrite,
    validateParams(categoryIdParamSchema),
    asyncHandler(controller.remove),
  );

  return router;
}
