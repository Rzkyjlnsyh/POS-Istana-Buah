import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type {
  CloseShiftInput,
  OpenShiftInput,
  ShiftActorContext,
  ShiftIdParam,
  ShiftListQuery,
} from './shift.dto';
import type { ShiftService } from './shift.service';

function buildActor(req: Request): ShiftActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return {
    userId: req.authUser.id,
    role: req.authUser.role,
    ...extractClientMeta(req),
  };
}

export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}

  open = async (req: Request, res: Response): Promise<void> => {
    const data = await this.shiftService.open(req.body as OpenShiftInput, buildActor(req));
    res.status(201).json({
      success: true,
      data,
      message: 'Shift kasir berhasil dibuka',
    });
  };

  getActive = async (req: Request, res: Response): Promise<void> => {
    const actor = buildActor(req);
    const data = await this.shiftService.getActive(actor.userId);
    res.status(200).json({
      success: true,
      data,
    });
  };

  close = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as ShiftIdParam;
    const data = await this.shiftService.close(id, req.body as CloseShiftInput, buildActor(req));
    res.status(200).json({
      success: true,
      data,
      message: 'Shift kasir berhasil ditutup',
    });
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const actor = buildActor(req);
    const result = await this.shiftService.list(
      req.validatedQuery as ShiftListQuery,
      actor.role,
      actor.userId,
    );
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const actor = buildActor(req);
    const { id } = req.params as unknown as ShiftIdParam;
    const data = await this.shiftService.getById(id, actor.role, actor.userId);
    res.status(200).json({
      success: true,
      data,
    });
  };
}
