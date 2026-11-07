import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1');
vi.stubEnv('VITE_APP_NAME', 'Istana Buah Semarang');
vi.stubEnv('VITE_APP_BRAND', 'Istana Buah');
vi.stubEnv('VITE_APP_VERSION', '1.0.0');
vi.stubEnv('VITE_APP_YEAR', '2026');
vi.stubEnv('VITE_OFFLINE_SYNC_INTERVAL', '30000');
vi.stubEnv('VITE_PRODUCT_CACHE_TTL', '300000');

describe('App routing entrypoint', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('mengarahkan pengunjung belum login ke halaman Login Istana Buah Semarang', async () => {
    const { useAuthStore } = await import('./stores/auth-store');
    useAuthStore.getState().clearSession();

    const { default: App } = await import('./App');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'ISTANA BUAH SEMARANG' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MASUK' })).toBeInTheDocument();
  });
});

describe('buildWebConfig', () => {
  it('melempar error jika env wajib kosong atau tidak valid', async () => {
    const { buildWebConfig } = await import('./config/app.config');
    expect(() => buildWebConfig({})).toThrow(/VITE_API_BASE_URL/);
    expect(() =>
      buildWebConfig({
        VITE_API_BASE_URL: 'http://x',
        VITE_APP_NAME: 'Istana Buah',
        VITE_OFFLINE_SYNC_INTERVAL: '0',
        VITE_PRODUCT_CACHE_TTL: '300000',
      }),
    ).toThrow(/VITE_OFFLINE_SYNC_INTERVAL/);
  });

  it('mengonversi nilai numerik dan menyediakan metadata versi terkonfigurasi', async () => {
    const { buildWebConfig } = await import('./config/app.config');
    const cfg = buildWebConfig({
      VITE_API_BASE_URL: 'http://x/v1',
      VITE_APP_NAME: 'Istana Buah Semarang',
      VITE_APP_BRAND: 'Istana Buah',
      VITE_APP_VERSION: '1.2.0',
      VITE_APP_YEAR: '2026',
      VITE_OFFLINE_SYNC_INTERVAL: '30000',
      VITE_PRODUCT_CACHE_TTL: '300000',
    });
    expect(cfg.offlineSyncIntervalMs).toBe(30000);
    expect(cfg.productCacheTtlMs).toBe(300000);
    expect(cfg.appVersion).toBe('1.2.0');
    expect(cfg.appYear).toBe('2026');
  });
});
