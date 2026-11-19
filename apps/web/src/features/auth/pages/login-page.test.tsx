import { ERROR_CODES } from '@istana-buah/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrontendApiError } from '../../../lib/api/api-error';
import { AppRoutes } from '../../../routes/app-router';
import { useAuthStore } from '../../../stores/auth-store';
import * as authApi from '../api/auth-api';
import { LoginPage, sanitizeInternalRedirectPath } from './login-page';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1');
vi.stubEnv('VITE_APP_NAME', 'Istana Buah Semarang');
vi.stubEnv('VITE_APP_BRAND', 'Istana Buah');
vi.stubEnv('VITE_APP_VERSION', '1.0.0');
vi.stubEnv('VITE_APP_YEAR', '2026');
vi.stubEnv('VITE_OFFLINE_SYNC_INTERVAL', '30000');
vi.stubEnv('VITE_PRODUCT_CACHE_TTL', '300000');

describe('LoginPage (M01-003)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    useAuthStore.getState().clearSession();
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (0 pelanggaran axe-core) pada tampilan awal maupun error', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    const initialAxe = await axe.run(container);
    expect(initialAxe.violations).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'MASUK' }));
    expect(await screen.findByText(/Username wajib diisi/i)).toBeInTheDocument();
    expect(await screen.findByText(/Password wajib diisi/i)).toBeInTheDocument();

    const errorAxe = await axe.run(container);
    expect(errorAxe.violations).toHaveLength(0);
  });

  it('merender elemen sesuai wireframe Bagian 8.3.1, autoFocus username, deteksi CapsLock, dan tombol lihat password', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'ISTANA BUAH SEMARANG' })).toBeInTheDocument();
    expect(screen.getByText('v1.0.0 | Istana Buah 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveFocus();

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput).toHaveAttribute('type', 'password');

    const toggleButton = screen.getByRole('button', { name: 'Tampilkan password' });
    expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggleButton);
    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(toggleButton).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(passwordInput, { key: 'A', modifierCapsLock: true });
    expect(screen.getByText(/Caps Lock sedang aktif/i)).toBeInTheDocument();
  });

  it('menyimpan accessToken di memori saja, refreshToken di sessionStorage, dan mengarahkan CASHIER ke /pos', async () => {
    const user = userEvent.setup();
    vi.spyOn(authApi, 'loginRequest').mockResolvedValueOnce({
      accessToken: 'jwt-access-in-memory',
      refreshToken: 'jwt-refresh-in-session-storage',
      user: {
        id: 'u-cashier-1',
        username: 'kasir01',
        fullName: 'Rina Kasir',
        role: 'CASHIER',
      },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText('Username'), 'kasir01');
    await user.type(screen.getByLabelText('Password'), 'KasirAman123');
    await user.click(screen.getByRole('button', { name: 'MASUK' }));

    expect(await screen.findByRole('heading', { name: 'Layar Kasir (POS)' })).toBeInTheDocument();

    expect(useAuthStore.getState().accessToken).toBe('jwt-access-in-memory');
    expect(window.sessionStorage.getItem('istana_buah_refresh_token')).toBe(
      'jwt-refresh-in-session-storage',
    );
    expect(JSON.stringify(window.sessionStorage)).not.toContain('jwt-access-in-memory');
    expect(JSON.stringify(window.localStorage)).not.toContain('jwt-access-in-memory');
  });

  it('menampilkan pesan error spesifik tanpa menghapus username saat kredensial salah dan mendukung logout', async () => {
    const user = userEvent.setup();
    const loginSpy = vi
      .spyOn(authApi, 'loginRequest')
      .mockRejectedValueOnce(
        new FrontendApiError({
          code: ERROR_CODES.INVALID_CREDENTIALS,
          message: 'Username atau password salah',
          statusCode: 401,
        }),
      )
      .mockResolvedValueOnce({
        accessToken: 'owner-access-token',
        refreshToken: 'owner-refresh-token',
        user: {
          id: 'u-owner-1',
          username: 'owner',
          fullName: 'Budi Santoso',
          role: 'OWNER',
        },
      });
    const logoutSpy = vi.spyOn(authApi, 'logoutRequest').mockResolvedValueOnce();

    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const usernameInput = await screen.findByLabelText('Username');
    await user.type(usernameInput, 'owner');
    await user.type(screen.getByLabelText('Password'), 'Salah123');
    await user.click(screen.getByRole('button', { name: 'MASUK' }));

    expect(await screen.findByText(/Username atau password belum sesuai/i)).toBeInTheDocument();
    expect(usernameInput).toHaveValue('owner');

    await user.clear(screen.getByLabelText('Password'));
    await user.type(screen.getByLabelText('Password'), 'OwnerBenar123');
    await user.click(screen.getByRole('button', { name: 'MASUK' }));

    expect(
      await screen.findByRole('heading', { name: 'Ringkasan Operasional Toko' }),
    ).toBeInTheDocument();
    expect(loginSpy).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: /Keluar/i }));
    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalledWith('owner-refresh-token');
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(window.sessionStorage.getItem('istana_buah_refresh_token')).toBeNull();
  });

  it('merespons perubahan status jaringan luring/daring dan memblokir open-redirect berbahaya', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Koneksi Sistem: Siap Online/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(
      await screen.findByText(/Mode Luring: Login memerlukan Wi-Fi\/LAN toko/i),
    ).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(await screen.findByText(/Koneksi Sistem: Siap Online/i)).toBeInTheDocument();

    expect(sanitizeInternalRedirectPath('//evil.example.com', '/pos')).toBe('/pos');
    expect(sanitizeInternalRedirectPath('/\\evil.example.com', '/pos')).toBe('/pos');
    expect(sanitizeInternalRedirectPath('https://evil.example.com', '/pos')).toBe('/pos');
    expect(sanitizeInternalRedirectPath('/login', '/dashboard')).toBe('/dashboard');
    expect(sanitizeInternalRedirectPath('/products', '/dashboard')).toBe('/products');
  });
});
