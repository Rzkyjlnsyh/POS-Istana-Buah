import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { SyncController } from './sync.controller';
import { syncBatchBodySchema, syncPullQuerySchema } from './sync.dto';
import type { SyncService } from './sync.service';

export interface SyncRouterDependencies {
  syncService: SyncService;
  authenticate: RequestHandler;
}

/**
 * Rute Sinkronisasi Offline:
 * - POST /v1/sync/batch : unggah batch transaksi offline (idempoten per clientId)
 * - GET /v1/sync/pull   : tarik pembaruan katalog produk/kategori sejak timestamp tertentu
 */
export function createSyncRouter(deps: SyncRouterDependencies): Router {
  const router = Router();
  const controller = new SyncController(deps.syncService);

  router.use(deps.authenticate, authorize('OWNER', 'MANAGER', 'CASHIER'));

  router.post('/batch', validateBody(syncBatchBodySchema), asyncHandler(controller.batch));
  router.get('/pull', validateQuery(syncPullQuerySchema), asyncHandler(controller.pull));

  return router;
}
