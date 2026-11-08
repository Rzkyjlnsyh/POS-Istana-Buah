import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { TransactionController } from './transaction.controller';
import {
  createTransactionSchema,
  transactionIdParamSchema,
  transactionListQuerySchema,
  voidTransactionSchema,
} from './transaction.dto';
import type { TransactionService } from './transaction.service';

export interface TransactionRouterDependencies {
  transactionService: TransactionService;
  authenticate: RequestHandler;
}

/**
 * Rute Transaksi POS Kasir (M03-001).
 * - Buat transaksi (POST /): CASHIER, MANAGER, OWNER.
 * - Baca riwayat & detail (GET /, GET /:id): Semua peran terautentikasi.
 * - Pembatalan / Void (PUT /:id/void): Hanya MANAGER dan OWNER (RBAC fail-closed).
 */
export function createTransactionRouter(deps: TransactionRouterDependencies): Router {
  const router = Router();
  const controller = new TransactionController(deps.transactionService);

  router.use(deps.authenticate);

  router.post('/', validateBody(createTransactionSchema), asyncHandler(controller.create));

  router.get('/', validateQuery(transactionListQuerySchema), asyncHandler(controller.list));

  router.get('/:id', validateParams(transactionIdParamSchema), asyncHandler(controller.getById));

  router.put(
    '/:id/void',
    authorize('MANAGER', 'OWNER'),
    validateParams(transactionIdParamSchema),
    validateBody(voidTransactionSchema),
    asyncHandler(controller.void),
  );

  return router;
}
