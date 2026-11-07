import type { UserRole } from '../constants/enums';

/** Profil user terautentikasi yang aman dikirim ke client (tanpa hash/PII sensitif). */
export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

/** Payload sukses POST /v1/auth/login (Bagian 7.2). */
export interface LoginResponseData {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/** Payload sukses POST /v1/auth/refresh dengan refresh token rotation (Bagian 7.2 & 14.1). */
export interface RefreshTokenResponseData {
  accessToken: string;
  refreshToken: string;
}
