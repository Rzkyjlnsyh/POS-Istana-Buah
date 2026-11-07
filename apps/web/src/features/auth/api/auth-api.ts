import type {
  ApiSuccess,
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  LoginResponseData,
  RefreshTokenResponseData,
} from '@istana-buah/shared';
import type { AxiosInstance } from 'axios';
import { apiClient, type RetryableRequestConfig } from '../../../lib/api/http-client';
import { useAuthStore } from '../../../stores/auth-store';

export async function loginRequest(
  credentials: LoginInput,
  client: AxiosInstance = apiClient,
): Promise<LoginResponseData> {
  const config: RetryableRequestConfig = {
    headers: {} as RetryableRequestConfig['headers'],
    skipAuthRefresh: true,
  };
  const response = await client.post<ApiSuccess<LoginResponseData>>(
    '/auth/login',
    credentials,
    config,
  );
  return response.data.data;
}

export async function refreshSessionRequest(
  refreshToken: string,
  client: AxiosInstance = apiClient,
): Promise<RefreshTokenResponseData> {
  const config: RetryableRequestConfig = {
    headers: {} as RetryableRequestConfig['headers'],
    skipAuthRefresh: true,
  };
  const response = await client.post<ApiSuccess<RefreshTokenResponseData>>(
    '/auth/refresh',
    { refreshToken },
    config,
  );
  return response.data.data;
}

export async function getCurrentUserRequest(
  accessTokenOverride?: string,
  client: AxiosInstance = apiClient,
): Promise<AuthUser> {
  const response = await client.get<ApiSuccess<{ user: AuthUser }>>('/auth/me', {
    headers: accessTokenOverride ? { Authorization: `Bearer ${accessTokenOverride}` } : undefined,
  });
  return response.data.data.user;
}

export async function logoutRequest(
  refreshToken: string | null,
  client: AxiosInstance = apiClient,
): Promise<void> {
  if (!refreshToken) {
    return;
  }
  const config: RetryableRequestConfig = {
    headers: {} as RetryableRequestConfig['headers'],
    skipAuthRefresh: true,
  };
  await client.post('/auth/logout', { refreshToken }, config);
}

export async function changePasswordRequest(
  payload: ChangePasswordInput,
  client: AxiosInstance = apiClient,
): Promise<void> {
  await client.put('/auth/change-password', payload);
}

let bootstrapInFlight: Promise<void> | null = null;

/**
 * Memulihkan sesi in-memory secara aman saat tab dimuat ulang jika refresh token tersedia.
 * Dijaga single-flight agar React StrictMode tidak memicu rotasi token ganda secara bersamaan.
 */
export function bootstrapAuthSession(client: AxiosInstance = apiClient): Promise<void> {
  if (bootstrapInFlight) {
    return bootstrapInFlight;
  }

  bootstrapInFlight = (async () => {
    const store = useAuthStore.getState();
    if (store.isAuthenticated && store.accessToken && store.user) {
      store.setHydrated(true);
      return;
    }

    const savedRefreshToken = store.getRefreshToken();
    if (!savedRefreshToken) {
      store.setHydrated(true);
      return;
    }

    try {
      const rotated = await refreshSessionRequest(savedRefreshToken, client);
      const user = await getCurrentUserRequest(rotated.accessToken, client);
      useAuthStore.getState().setSession({
        accessToken: rotated.accessToken,
        refreshToken: rotated.refreshToken,
        user,
      });
    } catch {
      useAuthStore.getState().clearSession();
    }
  })().finally(() => {
    bootstrapInFlight = null;
  });

  return bootstrapInFlight;
}
