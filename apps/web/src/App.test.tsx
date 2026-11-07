import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test');
vi.stubEnv('VITE_APP_NAME', 'Istana Buah Test');
vi.stubEnv('VITE_OFFLINE_SYNC_INTERVAL', '1000');
vi.stubEnv('VITE_PRODUCT_CACHE_TTL', '2000');

describe('App scaffold', () => {
  it('merender nama aplikasi dan role dari paket shared', async () => {
    const { default: App } = await import('./App');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Istana Buah Test' })).toBeInTheDocument();
    expect(screen.getByText(/OWNER \/ MANAGER \/ CASHIER/)).toBeInTheDocument();
  });
});

describe('buildWebConfig', () => {
  it('melempar error jika env wajib kosong', async () => {
    const { buildWebConfig } = await import('./config/app.config');
    expect(() => buildWebConfig({})).toThrow(/VITE_API_BASE_URL/);
  });

  it('mengonversi nilai numerik', async () => {
    const { buildWebConfig } = await import('./config/app.config');
    const cfg = buildWebConfig({
      VITE_API_BASE_URL: 'http://x',
      VITE_APP_NAME: 'x',
      VITE_OFFLINE_SYNC_INTERVAL: '30000',
      VITE_PRODUCT_CACHE_TTL: '300000',
    });
    expect(cfg.offlineSyncIntervalMs).toBe(30000);
    expect(cfg.productCacheTtlMs).toBe(300000);
  });
});
