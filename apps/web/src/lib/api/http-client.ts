import type { ApiSuccess, RefreshTokenResponseData } from '@istana-buah/shared';
import axios, {
  type AxiosAdapter,
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';
import { webConfig } from '../../config/app.config';
import { useAuthStore } from '../../stores/auth-store';
import { normalizeApiError } from './api-error';

export interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
}

export interface ApiClientDependencies {
  baseURL: string;
  timeoutMs: number;
  adapter?: AxiosAdapter;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokensRefreshed: (tokens: RefreshTokenResponseData) => void;
  onSessionExpired: () => void;
}

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

function isPublicAuthUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  return PUBLIC_AUTH_PATHS.some((path) => url.includes(path));
}

/**
 * Membuat instance Axios dengan injeksi Bearer token dari memori dan
 * single-flight refresh token rotation pada respons 401 (anti race-condition).
 */
export function createApiClient(deps: ApiClientDependencies): AxiosInstance {
  const client = axios.create({
    baseURL: deps.baseURL,
    timeout: deps.timeoutMs,
    adapter: deps.adapter,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  const rawRefreshClient = axios.create({
    baseURL: deps.baseURL,
    timeout: deps.timeoutMs,
    adapter: deps.adapter,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  });

  let refreshInFlight: Promise<RefreshTokenResponseData> | null = null;

  const executeTokenRefresh = async (): Promise<RefreshTokenResponseData> => {
    if (refreshInFlight) {
      return refreshInFlight;
    }

    const currentRefreshToken = deps.getRefreshToken();
    if (!currentRefreshToken) {
      deps.onSessionExpired();
      throw new Error('Sesi berakhir, silakan masuk kembali.');
    }

    refreshInFlight = rawRefreshClient
      .post<ApiSuccess<RefreshTokenResponseData>>('/auth/refresh', {
        refreshToken: currentRefreshToken,
      })
      .then((response) => {
        const rotated = response.data.data;
        deps.onTokensRefreshed(rotated);
        return rotated;
      })
      .catch((refreshError: unknown) => {
        deps.onSessionExpired();
        throw normalizeApiError(refreshError);
      })
      .finally(() => {
        refreshInFlight = null;
      });

    return refreshInFlight;
  };

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const retryConfig = config as RetryableRequestConfig;
    if (!retryConfig.skipAuthRefresh && !isPublicAuthUrl(config.url)) {
      const token = deps.getAccessToken();
      if (token) {
        config.headers.set('Authorization', `Bearer ${token}`);
      }
    }
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const originalConfig = error.config as RetryableRequestConfig | undefined;
      const status = error.response?.status;

      if (
        status === 401 &&
        originalConfig &&
        !originalConfig._retry &&
        !originalConfig.skipAuthRefresh &&
        !isPublicAuthUrl(originalConfig.url)
      ) {
        originalConfig._retry = true;
        const rotated = await executeTokenRefresh();
        originalConfig.headers.set('Authorization', `Bearer ${rotated.accessToken}`);
        return client(originalConfig);
      }

      return Promise.reject(normalizeApiError(error));
    },
  );

  return client;
}

export const apiClient = createApiClient({
  baseURL: webConfig.apiBaseUrl,
  timeoutMs: webConfig.apiTimeoutMs,
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().getRefreshToken(),
  onTokensRefreshed: (tokens) => {
    useAuthStore.getState().updateTokens(tokens);
  },
  onSessionExpired: () => {
    useAuthStore.getState().clearSession();
  },
});
