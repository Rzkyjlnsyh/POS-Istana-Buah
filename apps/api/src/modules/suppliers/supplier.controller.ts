import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type {
  CreateSupplierInput,
  SupplierActorContext,
  SupplierIdParam,
  SupplierListQuery,
  UpdateSupplierInput,
} from './supplier.dto';
import type { SupplierService } from './supplier.service';

function buildActor(req: Request): SupplierActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return {
    userId: req.authUser.id,
    ...extractClientMeta(req),
  };
}

export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await this.supplierService.list(req.validatedQuery as SupplierListQuery);
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as SupplierIdParam;
    const data = await this.supplierService.getById(id);
    res.status(200).json({
      success: true,
      data,
    });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.supplierService.create(
      req.body as CreateSupplierInput,
      buildActor(req),
    );
    res.status(201).json({
      success: true,
      data,
      message: 'Supplier berhasil ditambahkan',
    });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as SupplierIdParam;
    const data = await this.supplierService.update(
      id,
      req.body as UpdateSupplierInput,
      buildActor(req),
    );
    res.status(200).json({
      success: true,
      data,
      message: 'Supplier berhasil diperbarui',
    });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as SupplierIdParam;
    await this.supplierService.remove(id, buildActor(req));
    res.status(200).json({
      success: true,
      message: 'Supplier berhasil dihapus',
    });
  };
}
