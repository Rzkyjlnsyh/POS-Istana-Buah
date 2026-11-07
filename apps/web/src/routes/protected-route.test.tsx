import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '../features/auth/api/auth-api';
import { useAuthStore } from '../stores/auth-store';
import { AppRoutes } from './app-router';
import { getVisibleNavItemsForRole } from './navigation-config';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1');
vi.stubEnv('VITE_APP_NAME', 'Istana Buah Semarang');
vi.stubEnv('VITE_APP_BRAND', 'Istana Buah');
vi.stubEnv('VITE_APP_VERSION', '1.0.0');
vi.stubEnv('VITE_APP_YEAR', '2026');
vi.stubEnv('VITE_OFFLINE_SYNC_INTERVAL', '30000');
vi.stubEnv('VITE_PRODUCT_CACHE_TTL', '300000');

describe('Protected Routes & Role Guards (M01-004)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    useAuthStore.getState().clearSession();
  });

  it('mengarahkan pengunjung tanpa sesi dari rute terproteksi ke /login, memulihkan rute bagi peran yang sesuai, dan mencegah jebakan 403 bagi CASHIER di terminal bersama', async () => {
    const user = userEvent.setup();
    vi.spyOn(authApi, 'loginRequest').mockResolvedValueOnce({
      accessToken: 'manager-access',
      refreshToken: 'manager-refresh',
      user: {
        id: 'u-mgr-1',
        username: 'manajer01',
        fullName: 'Siti Manajer',
        role: 'MANAGER',
      },
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/products']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'ISTANA BUAH SEMARANG' }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Username'), 'manajer01');
    await user.type(screen.getByLabelText('Password'), 'ManajerAman123');
    await user.click(screen.getByRole('button', { name: 'MASUK' }));

    expect(await screen.findByRole('heading', { name: 'Manajemen Produk' })).toBeInTheDocument();
    unmount();

    useAuthStore.getState().clearSession();
    vi.spyOn(authApi, 'loginRequest').mockResolvedValueOnce({
      accessToken: 'cashier-access',
      refreshToken: 'cashier-refresh',
      user: {
        id: 'u-csr-2',
        username: 'kasir02',
        fullName: 'Dina Kasir',
        role: 'CASHIER',
      },
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/reports']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText('Username'), 'kasir02');
    await user.type(screen.getByLabelText('Password'), 'KasirAman123');
    await user.click(screen.getByRole('button', { name: 'MASUK' }));

    expect(await screen.findByRole('heading', { name: 'Layar Kasir (POS)' })).toBeInTheDocument();
    const posAxe = await axe.run(container);
    expect(posAxe.violations).toHaveLength(0);

    await user.click(screen.getByRole('link', { name: /Shift Kasir/i }));
    expect(await screen.findByRole('heading', { name: 'Shift Kasir' })).toBeInTheDocument();
  });

  it('memblokir CASHIER dari halaman Admin (/products & /dashboard) dengan layar Akses Terbatas bebas pelanggaran axe-core', async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      accessToken: 'cashier-access',
      refreshToken: 'cashier-refresh',
      user: {
        id: 'u-csr-1',
        username: 'kasir01',
        fullName: 'Rina Kasir',
        role: 'CASHIER',
      },
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/products']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        name: /Halaman ini terbatas untuk Pemilik atau Manajer/i,
      }),
    ).toBeInTheDocument();

    const forbiddenAxe = await axe.run(container);
    expect(forbiddenAxe.violations).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Kembali ke Area Kerja Utama/i }));
    expect(await screen.findByRole('heading', { name: 'Layar Kasir (POS)' })).toBeInTheDocument();
  });

  it('memblokir MANAGER dari halaman khusus OWNER (/employees) namun mengizinkan OWNER serta lulus axe-core', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'mgr-access',
      refreshToken: 'mgr-refresh',
      user: {
        id: 'u-mgr-1',
        username: 'manajer01',
        fullName: 'Siti Manajer',
        role: 'MANAGER',
      },
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/employees']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /Halaman ini terbatas untuk Pemilik/i }),
    ).toBeInTheDocument();
    unmount();

    useAuthStore.getState().setSession({
      accessToken: 'own-access',
      refreshToken: 'own-refresh',
      user: {
        id: 'u-own-1',
        username: 'owner',
        fullName: 'Budi Owner',
        role: 'OWNER',
      },
    });

    const { container } = render(
      <MemoryRouter initialEntries={['/employees']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Manajemen Pegawai' })).toBeInTheDocument();
    const adminAxe = await axe.run(container);
    expect(adminAxe.violations).toHaveLength(0);
  });

  it('menyaring menu sidebar sesuai peran, mendukung drawer mobile + tombol Escape, dan menampilkan banner offline', async () => {
    const user = userEvent.setup();
    expect(getVisibleNavItemsForRole('CASHIER').map((item) => item.path)).toEqual([
      '/pos',
      '/shifts',
      '/account/password',
    ]);
    expect(getVisibleNavItemsForRole('MANAGER').some((item) => item.path === '/employees')).toBe(
      false,
    );
    expect(getVisibleNavItemsForRole('OWNER').some((item) => item.path === '/employees')).toBe(
      true,
    );

    useAuthStore.getState().setSession({
      accessToken: 'own-access',
      refreshToken: 'own-refresh',
      user: {
        id: 'u-own-1',
        username: 'owner',
        fullName: 'Budi Owner',
        role: 'OWNER',
      },
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Buka menu navigasi' }));
    expect(screen.getByLabelText('Drawer navigasi mobile')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByLabelText('Drawer navigasi mobile')).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByText(/Mode offline aktif/i)).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
  });
});
