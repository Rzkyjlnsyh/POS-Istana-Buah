import { z } from 'zod';

/** Aturan kekuatan password minimum sesuai Bagian 14.2. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 50;

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Username wajib diisi')
    .min(USERNAME_MIN_LENGTH, `Username minimal ${String(USERNAME_MIN_LENGTH)} karakter`)
    .max(USERNAME_MAX_LENGTH, `Username maksimal ${String(USERNAME_MAX_LENGTH)} karakter`),
  password: z
    .string()
    .min(1, 'Password wajib diisi')
    .max(PASSWORD_MAX_LENGTH, `Password maksimal ${String(PASSWORD_MAX_LENGTH)} karakter`),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1, 'Refresh token wajib diisi'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().trim().min(1, 'Refresh token wajib diisi'),
});

export type LogoutInput = z.infer<typeof logoutSchema>;

export const strongPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password minimal ${String(PASSWORD_MIN_LENGTH)} karakter`)
  .max(PASSWORD_MAX_LENGTH, `Password maksimal ${String(PASSWORD_MAX_LENGTH)} karakter`)
  .regex(/[A-Z]/, 'Password wajib mengandung minimal 1 huruf besar')
  .regex(/[a-z]/, 'Password wajib mengandung minimal 1 huruf kecil')
  .regex(/[0-9]/, 'Password wajib mengandung minimal 1 angka');

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Password saat ini wajib diisi')
      .max(PASSWORD_MAX_LENGTH, `Password maksimal ${String(PASSWORD_MAX_LENGTH)} karakter`),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Konfirmasi password tidak cocok dengan password baru',
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'Password baru harus berbeda dari password saat ini',
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
