import { ERROR_CODES } from '@istana-buah/shared';
import type { Request, Response } from 'express';
import { AppError } from '../../utils/app-error';
import { extractClientMeta } from '../../utils/request-meta';
import type { ShiftListQuery } from '../shifts/shift.dto';
import type {
  CreateEmployeeInput,
  EmployeeActorContext,
  EmployeeIdParam,
  EmployeeListQuery,
  UpdateEmployeeInput,
} from './employee.dto';
import type { EmployeeService } from './employee.service';

function buildActor(req: Request): EmployeeActorContext {
  if (!req.authUser) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Autentikasi diperlukan', 401);
  }
  return {
    userId: req.authUser.id,
    ...extractClientMeta(req),
  };
}

export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const result = await this.employeeService.list(req.validatedQuery as EmployeeListQuery);
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as EmployeeIdParam;
    const data = await this.employeeService.getById(id);
    res.status(200).json({
      success: true,
      data,
    });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const data = await this.employeeService.create(
      req.body as CreateEmployeeInput,
      buildActor(req),
    );
    res.status(201).json({
      success: true,
      data,
    });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as EmployeeIdParam;
    const data = await this.employeeService.update(
      id,
      req.body as UpdateEmployeeInput,
      buildActor(req),
    );
    res.status(200).json({
      success: true,
      data,
    });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as EmployeeIdParam;
    await this.employeeService.remove(id, buildActor(req));
    res.status(200).json({
      success: true,
      data: { deleted: true },
    });
  };

  listShifts = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as unknown as EmployeeIdParam;
    const result = await this.employeeService.listShifts(id, req.validatedQuery as ShiftListQuery);
    res.status(200).json({
      success: true,
      data: result.items,
      meta: result.meta,
    });
  };
}
