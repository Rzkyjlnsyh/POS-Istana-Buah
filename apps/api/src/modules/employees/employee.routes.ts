import { Router, type RequestHandler } from 'express';
import { authorize } from '../../middleware/authorize';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { asyncHandler } from '../../utils/async-handler';
import { shiftListQuerySchema } from '../shifts/shift.dto';
import { EmployeeController } from './employee.controller';
import {
  createEmployeeSchema,
  employeeIdParamSchema,
  employeeListQuerySchema,
  updateEmployeeSchema,
} from './employee.dto';
import type { EmployeeService } from './employee.service';

export interface EmployeeRouterDependencies {
  employeeService: EmployeeService;
  authenticate: RequestHandler;
}

/**
 * Rute Manajemen Pegawai & Shift Karyawan (M10-001).
 * Akses terbatas khusus OWNER (admin toko tidak dapat mengubah/menghapus akun).
 */
export function createEmployeeRouter(deps: EmployeeRouterDependencies): Router {
  const router = Router();
  const controller = new EmployeeController(deps.employeeService);

  router.use(deps.authenticate, authorize('OWNER'));

  router.get('/', validateQuery(employeeListQuerySchema), asyncHandler(controller.list));
  router.get('/:id', validateParams(employeeIdParamSchema), asyncHandler(controller.getById));
  router.get(
    '/:id/shifts',
    validateParams(employeeIdParamSchema),
    validateQuery(shiftListQuerySchema),
    asyncHandler(controller.listShifts),
  );
  router.post('/', validateBody(createEmployeeSchema), asyncHandler(controller.create));
  router.put(
    '/:id',
    validateParams(employeeIdParamSchema),
    validateBody(updateEmployeeSchema),
    asyncHandler(controller.update),
  );
  router.delete('/:id', validateParams(employeeIdParamSchema), asyncHandler(controller.remove));

  return router;
}
