import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type {
  CreateStockOpnameInput,
  LowStockAlertQuery,
  ReceiveStockInput,
  StockActorContext,
  StockMovementListQuery,
  StockOpnameIdParam,
  StockOpnameListQuery,
} from './stock.dto';
import type { StockService } from './stock.service';

function buildActor(req: Request): StockActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return {
    userId: req.authUser.id,
    role: req.authUser.role,
    ...extractClientMeta(req),
  };
}

export class StockController {
  constructor(private readonly stockService: StockService) {}

  receive = async (req: Request, res: Response): Promise<void> => {
    const data = await this.stockService.receiveStock(
      req.body as ReceiveStockInput,
      buildActor(req),
    );
    res.status(201).json({
      success: true,
      data,
      message: 'Penerimaan stok barang berhasil dicatat',
    });
  };

  createOpname = async (req: Request, res: Response): Promise<void> => {
    const data = await this.stockService.createOpname(
      req.body as CreateStockOpnameInput,
      buildActor(req),
    );
    res.status(201).json({
      success: true,
      data,
      message:
        data.status === 'COMPLETED'
          ? 'Stok opname berhasil difinalisasi dan stok diperbarui'
          : 'Draft stok opname berhasil disimpan',
    });
  };

  finalizeOpname = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as StockOpnameIdParam;
    const data = await this.stockService.finalizeOpname(id, buildActor(req));
    res.status(200).json({
      success: true,
      data,
      message: 'Stok opname berhasil difinalisasi',
    });
  };

  listOpnames = async (req: Request, res: Response): Promise<void> => {
    const result = await this.stockService.listOpnames(req.validatedQuery as StockOpnameListQuery);
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };

  getOpnameById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as StockOpnameIdParam;
    const data = await this.stockService.getOpnameById(id);
    res.status(200).json({
      success: true,
      data,
    });
  };

  listMovements = async (req: Request, res: Response): Promise<void> => {
    const result = await this.stockService.listMovements(
      req.validatedQuery as StockMovementListQuery,
    );
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };

  listLowAlert = async (req: Request, res: Response): Promise<void> => {
    const result = await this.stockService.listLowStockAlerts(
      req.validatedQuery as LowStockAlertQuery,
    );
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };
}
