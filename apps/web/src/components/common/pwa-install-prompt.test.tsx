import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webConfig } from '../../config/app.config';
import { type BeforeInstallPromptEvent, PwaInstallPrompt } from './pwa-install-prompt';

describe('PwaInstallPrompt & Manifest Assets (M11-004)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(webConfig.pwaInstallDismissKey);
  });

  afterEach(() => {
    window.localStorage.removeItem(webConfig.pwaInstallDismissKey);
    vi.restoreAllMocks();
  });

  it('menyediakan manifest.json valid dan file ikon PNG/SVG fisik di apps/web/public', () => {
    const publicDir = resolve(__dirname, '../../../public');
    const manifestPath = resolve(publicDir, 'manifest.json');
    expect(existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name: string;
      short_name: string;
      start_url: string;
      display: string;
      icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
    };

    expect(manifest.short_name).toBe('Istana Buah');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(
      manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'),
    ).toBe(true);
    expect(
      manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'),
    ).toBe(true);

    for (const icon of manifest.icons) {
      const normalized = icon.src.replace(/^\//, '');
      expect(existsSync(resolve(publicDir, normalized))).toBe(true);
    }
  });

  it('menampilkan prompt install saat event beforeinstallprompt, memicu prompt() dan lolos axe-core', async () => {
    const { container } = render(<PwaInstallPrompt />);

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: promptMock,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    }) as BeforeInstallPromptEvent;

    await act(async () => {
      window.dispatchEvent(installEvent);
    });

    expect(installEvent.defaultPrevented).toBe(true);
    expect(await screen.findByText(/Pasang Aplikasi Kasir POS/i)).toBeInTheDocument();

    const a11y = await axe.run(container);
    expect(a11y.violations).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: /Pasang Aplikasi/i }));

    await waitFor(() => {
      expect(promptMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/Pasang Aplikasi Kasir POS/i)).toBeNull();
    });
  });

  it('menyimpan cooldown saat ditolak dengan Nanti Saja dan menyembunyikan banner berikutnya', async () => {
    render(<PwaInstallPrompt />);

    const installEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    }) as BeforeInstallPromptEvent;

    await act(async () => {
      window.dispatchEvent(installEvent);
    });

    fireEvent.click(await screen.findByRole('button', { name: /Nanti Saja/i }));
    expect(screen.queryByText(/Pasang Aplikasi Kasir POS/i)).toBeNull();
    expect(window.localStorage.getItem(webConfig.pwaInstallDismissKey)).not.toBeNull();
  });
});
