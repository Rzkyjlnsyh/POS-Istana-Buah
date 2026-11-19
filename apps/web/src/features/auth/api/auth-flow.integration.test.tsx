import { type AuthUser, ERROR_CODES } from '@istana-buah/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type AxiosAdapter, AxiosError, AxiosHeaders } from 'axios';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FrontendApiError,
  normalizeApiError,
  resolveAuthErrorCopy,
  resolveChangePasswordErrorCopy,
} from '../../../lib/api/api-error';
import { apiClient } from '../../../lib/api/http-client';
import { AppRoutes } from '../../../routes/app-router';
import { createSessionRefreshTokenStorage } from '../../../stores/auth-storage';
import { createAuthStore, useAuthStore } from '../../../stores/auth-store';
import {
  bootstrapAuthSession,
  changePasswordRequest,
  getCurrentUserRequest,
  loginRequest,
  logoutRequest,
  refreshSessionRequest,
} from './auth-api';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1');
vi.stubEnv('VITE_APP_NAME', 'Istana Buah Semarang');
vi.stubEnv('VITE_APP_BRAND', 'Istana Buah');
vi.stubEnv('VITE_APP_VERSION', '1.0.0');
vi.stubEnv('VITE_APP_YEAR', '2026');
vi.stubEnv('VITE_OFFLINE_SYNC_INTERVAL', '30000');
vi.stubEnv('VITE_PRODUCT_CACHE_TTL', '300000');

describe('M01-006 Unit & End-to-End Integration: Auth API, Storage, Store & Full Login Flow', () => {
  const originalAdapter = apiClient.defaults.adapter;

  const mockManagerUser: AuthUser = {
    id: 'u-mgr-1',
    username: 'manajer01',
    fullName: 'Siti Rahayu',
    role: 'MANAGER',
  };

  beforeEach(() => {
    window.sessionStorage.clear();
    useAuthStore.getState().clearSession();
    useAuthStore.getState().setHydrated(false);
  });

  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    vi.restoreAllMocks();
  });

  it('createSessionRefreshTokenStorage tetap berfungsi via fallback in-memory saat sessionStorage melempar SecurityError', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceeded', 'QuotaExceededError');
    });
    const removeItemSpy = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });

    const storage = createSessionRefreshTokenStorage('test_rt_key');
    storage.setRefreshToken('fallback-rt-123');
    expect(storage.getRefreshToken()).toBe('fallback-rt-123');

    storage.clearRefreshToken();
    expect(storage.getRefreshToken()).toBeNull();

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    removeItemSpy.mockRestore();
  });

  it('createAuthStore mendukung setSession, updateTokens, setUser, dan clearSessionNotice secara konsisten', () => {
    const isolatedStorage = createSessionRefreshTokenStorage('isolated_rt');
    const store = createAuthStore(isolatedStorage);

    store.getState().setSession({
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      user: mockManagerUser,
    });
    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().getRefreshToken()).toBe('rt-1');

    store.getState().updateTokens({
      accessToken: 'at-2',
      refreshToken: 'rt-2',
    });
    expect(store.getState().accessToken).toBe('at-2');
    expect(store.getState().getRefreshToken()).toBe('rt-2');
    expect(store.getState().user).toEqual(mockManagerUser);

    const updatedUser: AuthUser = { ...mockManagerUser, fullName: 'Siti Rahayu, S.E.' };
    store.getState().setUser(updatedUser);
    expect(store.getState().user?.fullName).toBe('Siti Rahayu, S.E.');

    store.getState().clearSession({ title: 'Info', description: 'Sesi selesai' });
    expect(store.getState().sessionNotice?.title).toBe('Info');
    store.getState().clearSessionNotice();
    expect(store.getState().sessionNotice).toBeNull();
  });

  it('normalizeApiError, resolveAuthErrorCopy, dan resolveChangePasswordErrorCopy mencakup semua cabang error jaringan, timeout, akun nonaktif, dan fallback', () => {
    const existingErr = new FrontendApiError({
      code: ERROR_CODES.ACCOUNT_INACTIVE,
      message: 'Nonaktif',
      statusCode: 403,
    });
    expect(normalizeApiError(existingErr)).toBe(existingErr);
    expect(resolveAuthErrorCopy(existingErr).title).toMatch(/Akun pegawai sedang tidak aktif/i);

    const timeoutErr = normalizeApiError(new AxiosError('timeout', 'ECONNABORTED'));
    expect(timeoutErr.code).toBe('NETWORK_TIMEOUT');
    expect(resolveChangePasswordErrorCopy(timeoutErr).title).toMatch(/Koneksi ke server terputus/i);

    const rateLimitPw = resolveChangePasswordErrorCopy(
      new FrontendApiError({
        code: ERROR_CODES.RATE_LIMITED,
        message: 'Limited',
        statusCode: 429,
        retryAfterSeconds: 30,
      }),
    );
    expect(rateLimitPw.description).toMatch(/30 detik/);

    const unknownErr = normalizeApiError(new Error('Kejadian tak terduga'));
    expect(unknownErr.code).toBe(ERROR_CODES.INTERNAL_ERROR);
    expect(resolveAuthErrorCopy(unknownErr).title).toMatch(/Gagal memproses autentikasi/i);
    expect(resolveChangePasswordErrorCopy(unknownErr).title).toMatch(/Gagal memperbarui password/i);
  });

  it('bootstrapAuthSession menjaga single-flight deduplication saat dipanggil paralel (StrictMode) dan membersihkan sesi bila token kedaluwarsa', async () => {
    let refreshCount = 0;
    let meCount = 0;

    const adapter: AxiosAdapter = async (config) => {
      if (config.url === '/auth/refresh') {
        refreshCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return {
          data: {
            success: true,
            data: {
              accessToken: 'hydrated-access-token',
              refreshToken: 'hydrated-refresh-token',
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }

      if (config.url === '/auth/me') {
        meCount += 1;
        expect(config.headers.get('Authorization')).toBe('Bearer hydrated-access-token');
        return {
          data: {
            success: true,
            data: { user: mockManagerUser },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }

      throw new Error(`Unexpected URL: ${String(config.url)}`);
    };

    apiClient.defaults.adapter = adapter;
    window.sessionStorage.setItem('istana_buah_refresh_token', 'persisted-refresh-token-1');

    // Dua pemanggilan paralel seperti pada React 18 StrictMode hanya boleh merotasi token 1x
    await Promise.all([bootstrapAuthSession(apiClient), bootstrapAuthSession(apiClient)]);

    expect(refreshCount).toBe(1);
    expect(meCount).toBe(1);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('hydrated-access-token');
    expect(useAuthStore.getState().getRefreshToken()).toBe('hydrated-refresh-token');

    // Jika sudah terautentikasi, bootstrapAuthSession langsung selesai tanpa HTTP request tambahan
    await bootstrapAuthSession(apiClient);
    expect(refreshCount).toBe(1);

    // Jika refresh gagal pada reload berikutnya, sesi dibersihkan aman
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isHydrated: false,
    });
    window.sessionStorage.setItem('istana_buah_refresh_token', 'expired-refresh-token');
    apiClient.defaults.adapter = async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
        data: {
          success: false,
          error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Expired' },
        },
        status: 401,
        statusText: 'Unauthorized',
        headers: new AxiosHeaders(),
        config,
      });
    };

    await bootstrapAuthSession(apiClient);
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().isHydrated).toBe(true);
    expect(window.sessionStorage.getItem('istana_buah_refresh_token')).toBeNull();
  });

  it('Integration Flow: Login UI -> Dashboard -> 401 Auto-Refresh pada Change Password -> Re-Login -> Logout end-to-end melalui HTTP Client nyata', async () => {
    let activePassword = 'PasswordAwal123';
    let currentValidAccess = 'access-v1';
    let currentValidRefresh = 'refresh-v1';
    let logoutCalled = false;

    const inMemoryServerAdapter: AxiosAdapter = async (config) => {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;

      if (config.url === '/auth/login' && config.method === 'post') {
        if (body.username === 'manajer01' && body.password === activePassword) {
          return {
            data: {
              success: true,
              data: {
                accessToken: currentValidAccess,
                refreshToken: currentValidRefresh,
                user: mockManagerUser,
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
        throw new AxiosError('Invalid', 'ERR_BAD_REQUEST', config, null, {
          data: {
            success: false,
            error: { code: ERROR_CODES.INVALID_CREDENTIALS, message: 'Kredensial salah' },
          },
          status: 401,
          statusText: 'Unauthorized',
          headers: new AxiosHeaders(),
          config,
        });
      }

      if (config.url === '/auth/refresh' && config.method === 'post') {
        if (body.refreshToken === currentValidRefresh) {
          currentValidAccess = 'access-v2-rotated';
          currentValidRefresh = 'refresh-v2-rotated';
          return {
            data: {
              success: true,
              data: {
                accessToken: currentValidAccess,
                refreshToken: currentValidRefresh,
              },
            },
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
          };
        }
      }

      if (config.url === '/auth/change-password' && config.method === 'put') {
        const authHeader = config.headers.get('Authorization');
        if (authHeader !== `Bearer ${currentValidAccess}`) {
          throw new AxiosError('Expired', 'ERR_BAD_REQUEST', config, null, {
            data: {
              success: false,
              error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Token kedaluwarsa' },
            },
            status: 401,
            statusText: 'Unauthorized',
            headers: new AxiosHeaders(),
            config,
          });
        }
        activePassword = body.newPassword as string;
        currentValidAccess = 'access-v3-fresh';
        currentValidRefresh = 'refresh-v3-fresh';
        return {
          data: { success: true, data: null },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }

      if (config.url === '/auth/logout' && config.method === 'post') {
        logoutCalled = true;
        return {
          data: { success: true, data: null },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }

      if (config.url === '/auth/me' && config.method === 'get') {
        return {
          data: { success: true, data: { user: mockManagerUser } },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        };
      }

      throw new Error(`Unhandled route: ${String(config.method)} ${String(config.url)}`);
    };

    // Pasang adapter pada instance apiClient (dan pastikan helper langsung bekerja)
    apiClient.defaults.adapter = inMemoryServerAdapter;

    // Verifikasi helper unit eksplisit untuk logout null-token & fungsi API langsung
    await expect(logoutRequest(null, apiClient)).resolves.toBeUndefined();
    const directLogin = await loginRequest(
      { username: 'manajer01', password: activePassword },
      apiClient,
    );
    expect(directLogin.user.role).toBe('MANAGER');
    const directMe = await getCurrentUserRequest(directLogin.accessToken, apiClient);
    expect(directMe.username).toBe('manajer01');
    const directRefresh = await refreshSessionRequest(directLogin.refreshToken, apiClient);
    expect(directRefresh.accessToken).toBe('access-v2-rotated');

    // Simulasikan access token di memori sudah usang agar interceptor 401 otomatis merotasi token saat PUT /auth/change-password
    useAuthStore.getState().setSession({
      accessToken: 'stale-expired-access-token',
      refreshToken: directRefresh.refreshToken,
      user: directMe,
    });
    await changePasswordRequest(
      {
        currentPassword: 'PasswordAwal123',
        newPassword: 'PasswordKedua456',
        confirmPassword: 'PasswordKedua456',
      },
      apiClient,
    );
    expect(activePassword).toBe('PasswordKedua456');

    // Reset state untuk alur UI end-to-end penuh
    useAuthStore.getState().clearSession();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    // 1. Belum login -> diarahkan ke /login
    expect(
      await screen.findByRole('heading', { name: 'ISTANA BUAH SEMARANG' }),
    ).toBeInTheDocument();

    // 2. Login sebagai Manajer menggunakan password terbaru
    await user.type(screen.getByLabelText('Username'), 'manajer01');
    await user.type(screen.getByLabelText('Password'), 'PasswordKedua456');
    await user.click(screen.getByRole('button', { name: 'MASUK' }));

    // 3. Masuk ke Dashboard Operasional
    expect(
      await screen.findByRole('heading', { name: 'Ringkasan Operasional Toko' }),
    ).toBeInTheDocument();

    // 4. Logout melalui tombol header AdminLayout -> memanggil POST /auth/logout & kembali ke /login
    await user.click(screen.getByRole('button', { name: /Keluar/i }));

    await waitFor(() => {
      expect(logoutCalled).toBe(true);
    });
    expect(
      await screen.findByRole('heading', { name: 'ISTANA BUAH SEMARANG' }),
    ).toBeInTheDocument();
  });
});
