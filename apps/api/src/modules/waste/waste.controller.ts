import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type {
  CreateWasteRecordInput,
  WasteActorContext,
  WasteRecordIdParam,
  WasteRecordListQuery,
} from './waste.dto';
import type { WasteService } from './waste.service';

function buildActor(req: Request): WasteActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return {
    userId: req.authUser.id,
    ...extractClientMeta(req),
  };
}

export class WasteController {
  constructor(private readonly wasteService: WasteService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.wasteService.recordWaste(
      req.body as CreateWasteRecordInput,
      buildActor(req),
    );
    res.status(201).json({
      success: true,
      data,
    });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await this.wasteService.list(req.validatedQuery as WasteRecordListQuery);
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as WasteRecordIdParam;
    const data = await this.wasteService.getById(id);
    res.status(200).json({
      success: true,
      data,
    });
  };
}
