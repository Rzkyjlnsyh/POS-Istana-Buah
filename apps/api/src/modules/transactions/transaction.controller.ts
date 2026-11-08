import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type {
  CreateTransactionInput,
  TransactionActorContext,
  TransactionIdParam,
  TransactionListQuery,
  VoidTransactionInput,
} from './transaction.dto';
import type { TransactionService } from './transaction.service';

function buildActor(req: Request): TransactionActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return {
    userId: req.authUser.id,
    role: req.authUser.role,
    ...extractClientMeta(req),
  };
}

export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.transactionService.create(
      req.body as CreateTransactionInput,
      buildActor(req),
    );
    res.status(201).json({
      success: true,
      data,
      message: 'Transaksi berhasil disimpan',
    });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const role = req.authUser?.role ?? 'CASHIER';
    const result = await this.transactionService.list(
      req.validatedQuery as TransactionListQuery,
      role,
    );
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const role = req.authUser?.role ?? 'CASHIER';
    const { id } = req.params as unknown as TransactionIdParam;
    const data = await this.transactionService.getById(id, role);
    res.status(200).json({
      success: true,
      data,
    });
  };

  void = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as TransactionIdParam;
    const data = await this.transactionService.void(
      id,
      req.body as VoidTransactionInput,
      buildActor(req),
    );
    res.status(200).json({
      success: true,
      data,
      message: 'Transaksi berhasil dibatalkan (void)',
    });
  };
}
