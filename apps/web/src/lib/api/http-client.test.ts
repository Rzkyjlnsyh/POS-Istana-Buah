import { ERROR_CODES } from '@istana-buah/shared';
import { type AxiosAdapter, AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { normalizeApiError, resolveAuthErrorCopy } from './api-error';
import { createApiClient } from './http-client';

describe('createApiClient & refresh token interceptor', () => {
  it('menyisipkan Authorization Bearer pada endpoint terproteksi dan melewati endpoint login publik', async () => {
    const seenAuthHeaders: Array<string | undefined> = [];

    const mockAdapter: AxiosAdapter = async (config) => {
      seenAuthHeaders.push(config.headers.get('Authorization') as string | undefined);
      return {
        data: { success: true, data: { ok: true } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const client = createApiClient({
      baseURL: 'http://api.test/v1',
      timeoutMs: 5000,
      adapter: mockAdapter,
      getAccessToken: () => 'memory-access-token-1',
      getRefreshToken: () => 'stored-refresh-token-1',
      onTokensRefreshed: vi.fn(),
      onSessionExpired: vi.fn(),
    });

    await client.post('/auth/login', { username: 'kasir01', password: 'Password123' });
    await client.get('/products');

    expect(seenAuthHeaders[0]).toBeUndefined();
    expect(seenAuthHeaders[1]).toBe('Bearer memory-access-token-1');
  });

  it('menjalankan single-flight refresh pada banyak respons 401 paralel lalu mengulang semua request dengan token baru', async () => {
    let accessToken = 'expired-access-token';
    let refreshToken = 'valid-refresh-token-1';
    let refreshCallCount = 0;
    let protectedCallCount = 0;

    const onTokensRefreshed = vi.fn((tokens: { accessToken: string; refreshToken: string }) => {
      accessToken = tokens.accessToken;
      refreshToken = tokens.refreshToken;
    });
    const onSessionExpired = vi.fn();

    const mockAdapter: AxiosAdapter = async (reqConfig) => {
      if (reqConfig.url === '/auth/refresh') {
        refreshCallCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          data: {
            success: true,
            data: {
              accessToken: 'fresh-access-token-2',
              refreshToken: 'rotated-refresh-token-2',
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: reqConfig,
        };
      }

      protectedCallCount += 1;
      const authHeader = reqConfig.headers.get('Authorization');
      if (authHeader !== 'Bearer fresh-access-token-2') {
        throw new AxiosError('Token expired', 'ERR_BAD_REQUEST', reqConfig, null, {
          data: {
            success: false,
            error: { code: ERROR_CODES.TOKEN_EXPIRED, message: 'Token kedaluwarsa' },
          },
          status: 401,
          statusText: 'Unauthorized',
          headers: new AxiosHeaders(),
          config: reqConfig,
        });
      }

      return {
        data: { success: true, data: { url: reqConfig.url } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: reqConfig,
      };
    };

    const client = createApiClient({
      baseURL: 'http://api.test/v1',
      timeoutMs: 5000,
      adapter: mockAdapter,
      getAccessToken: () => accessToken,
      getRefreshToken: () => refreshToken,
      onTokensRefreshed,
      onSessionExpired,
    });

    const [resA, resB, resC] = await Promise.all([
      client.get('/products'),
      client.get('/categories'),
      client.get('/shifts'),
    ]);

    expect(refreshCallCount).toBe(1);
    expect(protectedCallCount).toBe(6);
    expect(onTokensRefreshed).toHaveBeenCalledTimes(1);
    expect(accessToken).toBe('fresh-access-token-2');
    expect(refreshToken).toBe('rotated-refresh-token-2');
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect(resC.status).toBe(200);
  });

  it('membersihkan sesi tanpa infinite loop ketika refresh token ditolak atau kosong', async () => {
    const onSessionExpired = vi.fn();

    const failingAdapter: AxiosAdapter = async (reqConfig) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', reqConfig, null, {
        data: {
          success: false,
          error: {
            code: ERROR_CODES.REFRESH_TOKEN_REVOKED,
            message: 'Refresh token sudah dicabut',
          },
        },
        status: 401,
        statusText: 'Unauthorized',
        headers: new AxiosHeaders(),
        config: reqConfig,
      });
    };

    const client = createApiClient({
      baseURL: 'http://api.test/v1',
      timeoutMs: 5000,
      adapter: failingAdapter,
      getAccessToken: () => 'expired-token',
      getRefreshToken: () => 'revoked-refresh-token',
      onTokensRefreshed: vi.fn(),
      onSessionExpired,
    });

    await expect(client.get('/products')).rejects.toMatchObject({
      code: ERROR_CODES.REFRESH_TOKEN_REVOKED,
    });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });
});

describe('resolveAuthErrorCopy & normalizeApiError', () => {
  it('memetakan kode error autentikasi ke pesan Bahasa Indonesia yang jelas dan informatif', () => {
    const lockedCopy = resolveAuthErrorCopy(
      normalizeApiError(
        new AxiosError('Locked', 'ERR_BAD_REQUEST', undefined, undefined, {
          data: {
            success: false,
            error: {
              code: ERROR_CODES.ACCOUNT_LOCKED,
              message: 'Locked',
              details: { remainingSeconds: 600 },
            },
          },
          status: 423,
          statusText: 'Locked',
          headers: new AxiosHeaders(),
          config: { headers: new AxiosHeaders() },
        }),
      ),
    );
    expect(lockedCopy.title).toMatch(/dikunci sementara/i);
    expect(lockedCopy.description).toMatch(/10 menit/);

    const rateLimitCopy = resolveAuthErrorCopy(
      normalizeApiError(
        new AxiosError('Too Many Requests', 'ERR_BAD_REQUEST', undefined, undefined, {
          data: {
            success: false,
            error: { code: ERROR_CODES.RATE_LIMITED, message: 'Rate limited' },
          },
          status: 429,
          statusText: 'Too Many Requests',
          headers: new AxiosHeaders({ 'retry-after': '45' }),
          config: { headers: new AxiosHeaders() },
        }),
      ),
    );
    expect(rateLimitCopy.title).toMatch(/Terlalu banyak permintaan/i);
    expect(rateLimitCopy.description).toMatch(/45 detik/);

    const offlineCopy = resolveAuthErrorCopy(
      normalizeApiError(new AxiosError('Network Error', 'ERR_NETWORK')),
    );
    expect(offlineCopy.title).toMatch(/Koneksi ke server belum tersedia/i);
  });
});
