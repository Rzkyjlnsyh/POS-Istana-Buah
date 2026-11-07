export {
  changePasswordSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  type AuthUser,
  type ChangePasswordInput,
  type LoginInput,
  type LoginResponseData,
  type LogoutInput,
  type RefreshTokenInput,
  type RefreshTokenResponseData,
} from '@istana-buah/shared';

export interface RequestClientMeta {
  ipAddress: string | null;
  userAgent: string | null;
}
