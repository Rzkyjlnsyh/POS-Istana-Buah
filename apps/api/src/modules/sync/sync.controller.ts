import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type { SyncActorContext, SyncBatchBodyInput, SyncPullQueryInput } from './sync.dto';
import type { SyncService } from './sync.service';

function buildSyncActor(req: Request): SyncActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return {
    userId: req.authUser.id,
    role: req.authUser.role,
    ...extractClientMeta(req),
  };
}

export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  batch = async (req: Request, res: Response): Promise<void> => {
    const data = await this.syncService.processBatch(
      req.body as SyncBatchBodyInput,
      buildSyncActor(req),
    );

    res.status(200).json({
      success: true,
      data,
    });
  };

  pull = async (req: Request, res: Response): Promise<void> => {
    const actor = buildSyncActor(req);
    const data = await this.syncService.pullUpdates(
      req.validatedQuery as SyncPullQueryInput,
      actor.role,
    );

    res.status(200).json({
      success: true,
      data,
    });
  };
}
