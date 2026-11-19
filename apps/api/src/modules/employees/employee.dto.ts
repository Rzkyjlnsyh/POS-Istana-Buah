import { z } from 'zod';

export {
  createEmployeeSchema,
  employeeListQuerySchema,
  updateEmployeeSchema,
  type CreateEmployeeInput,
  type EmployeeListQuery,
  type UpdateEmployeeInput,
} from '@istana-buah/shared';

export const employeeIdParamSchema = z.object({
  id: z.string().uuid('ID pegawai tidak valid'),
});

export type EmployeeIdParam = z.infer<typeof employeeIdParamSchema>;

export interface EmployeeActorContext {
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface EmployeeListServiceQuery {
  page?: number | undefined;
  limit?: number | undefined;
  role?: 'OWNER' | 'MANAGER' | 'CASHIER' | undefined;
  isActive?: boolean | undefined;
  search?: string | undefined;
}
