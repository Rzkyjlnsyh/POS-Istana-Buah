import { z } from 'zod';
import { USER_ROLES } from '../constants/enums';
import { USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, strongPasswordSchema } from './auth';
import { paginationQuerySchema } from './pagination';

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;

export const createEmployeeSchema = z.object({
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH, `Username minimal ${String(USERNAME_MIN_LENGTH)} karakter`)
    .max(USERNAME_MAX_LENGTH, `Username maksimal ${String(USERNAME_MAX_LENGTH)} karakter`)
    .regex(
      USERNAME_PATTERN,
      'Username hanya boleh mengandung huruf, angka, titik, garis bawah (_), atau tanda hubung (-)',
    ),
  fullName: z
    .string()
    .trim()
    .min(2, 'Nama lengkap minimal 2 karakter')
    .max(120, 'Nama lengkap maksimal 120 karakter'),
  password: strongPasswordSchema,
  role: z.enum(USER_ROLES, {
    message: 'Peran pegawai harus OWNER, MANAGER, atau CASHIER',
  }),
  phoneNumber: z
    .string()
    .trim()
    .max(30, 'Nomor telepon maksimal 30 karakter')
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Nama lengkap minimal 2 karakter')
    .max(120, 'Nama lengkap maksimal 120 karakter')
    .optional(),
  role: z
    .enum(USER_ROLES, {
      message: 'Peran pegawai harus OWNER, MANAGER, atau CASHIER',
    })
    .optional(),
  phoneNumber: z
    .string()
    .trim()
    .max(30, 'Nomor telepon maksimal 30 karakter')
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
  password: strongPasswordSchema.optional(),
  unlockAccount: z.boolean().optional(),
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeListQuerySchema = paginationQuerySchema.extend({
  role: z.enum(USER_ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
