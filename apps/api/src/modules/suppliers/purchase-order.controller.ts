import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type {
  CreatePurchaseOrderInput,
  PayPurchaseOrderInput,
  PurchaseOrderActorContext,
  PurchaseOrderIdParam,
  PurchaseOrderListQuery,
} from './purchase-order.dto';
import type { PurchaseOrderService } from './purchase-order.service';

function buildActor(req: Request): PurchaseOrderActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return {
    userId: req.authUser.id,
    ...extractClientMeta(req),
  };
}

export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.purchaseOrderService.create(
      req.body as CreatePurchaseOrderInput,
      buildActor(req),
    );
    res.status(201).json({
      success: true,
      data,
      message: 'Purchase Order berhasil dibuat',
    });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await this.purchaseOrderService.list(
      req.validatedQuery as PurchaseOrderListQuery,
    );
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as PurchaseOrderIdParam;
    const data = await this.purchaseOrderService.getById(id);
    res.status(200).json({
      success: true,
      data,
    });
  };

  pay = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as PurchaseOrderIdParam;
    const data = await this.purchaseOrderService.recordPayment(
      id,
      req.body as PayPurchaseOrderInput,
      buildActor(req),
    );
    res.status(200).json({
      success: true,
      data,
      message: 'Pembayaran Purchase Order berhasil dicatat',
    });
  };

  cancel = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as PurchaseOrderIdParam;
    const data = await this.purchaseOrderService.cancel(id, buildActor(req));
    res.status(200).json({
      success: true,
      data,
      message: 'Purchase Order berhasil dibatalkan',
    });
  };
}
