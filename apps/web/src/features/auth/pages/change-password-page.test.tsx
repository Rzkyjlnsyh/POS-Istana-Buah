import { ERROR_CODES } from '@istana-buah/shared';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FrontendApiError } from '../../../lib/api/api-error';
import { AppRoutes } from '../../../routes/app-router';
import { useAuthStore } from '../../../stores/auth-store';
import * as authApi from '../api/auth-api';

vi.stubEnv('VITE_API_BASE_URL', 'http://api.test/v1');
vi.stubEnv('VITE_APP_NAME', 'Istana Buah Semarang');
vi.stubEnv('VITE_APP_BRAND', 'Istana Buah');
vi.stubEnv('VITE_APP_VERSION', '1.0.0');
vi.stubEnv('VITE_APP_YEAR', '2026');
vi.stubEnv('VITE_OFFLINE_SYNC_INTERVAL', '30000');
vi.stubEnv('VITE_PRODUCT_CACHE_TTL', '300000');

describe('ChangePasswordPage (M01-005)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
    useAuthStore.getState().setSession({
      accessToken: 'cashier-access-token',
      refreshToken: 'cashier-refresh-token',
      user: {
        id: 'u-csr-1',
        username: 'kasir01',
        fullName: 'Rina Kasir',
        role: 'CASHIER',
      },
    });
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (0 pelanggaran axe-core) dan memvalidasi kekuatan serta kecocokan password baru', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={['/account/password']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Ubah Password Akun' })).toBeInTheDocument();

    const initialAxe = await axe.run(container);
    expect(initialAxe.violations).toHaveLength(0);

    await user.type(screen.getByLabelText('Password Saat Ini'), 'KasirLama123');
    await user.type(screen.getByLabelText('Password Baru'), 'lemah');
    await user.type(screen.getByLabelText('Konfirmasi Password Baru'), 'beda');
    await user.click(screen.getByRole('button', { name: 'Simpan Password Baru' }));

    expect(await screen.findByText(/Password minimal 8 karakter/i)).toBeInTheDocument();
    expect(
      await screen.findByText(/Konfirmasi password tidak cocok dengan password baru/i),
    ).toBeInTheDocument();

    const errorAxe = await axe.run(container);
    expect(errorAxe.violations).toHaveLength(0);
  });

  it('menangani error password lama tidak sesuai (aria-invalid aktif), lalu berhasil memperbarui password dan mengarahkan ke /login dengan banner sukses', async () => {
    const user = userEvent.setup();
    const changeSpy = vi
      .spyOn(authApi, 'changePasswordRequest')
      .mockRejectedValueOnce(
        new FrontendApiError({
          code: ERROR_CODES.INVALID_CURRENT_PASSWORD,
          message: 'Password saat ini salah',
          statusCode: 400,
        }),
      )
      .mockResolvedValueOnce();

    render(
      <MemoryRouter initialEntries={['/account/password']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const currentInput = await screen.findByLabelText('Password Saat Ini');
    const newInput = screen.getByLabelText('Password Baru');
    const confirmInput = screen.getByLabelText('Konfirmasi Password Baru');

    await user.type(currentInput, 'SalahLama123');
    await user.type(newInput, 'KasirBaru999');
    await user.type(confirmInput, 'KasirBaru999');

    await user.click(screen.getByRole('button', { name: 'Tampilkan password baru' }));
    expect(newInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Simpan Password Baru' }));

    expect(await screen.findByText(/Password saat ini belum sesuai/i)).toBeInTheDocument();
    expect(currentInput).toHaveAttribute('aria-invalid', 'true');
    // Pastikan password otomatis dimasking kembali saat submit gagal di meja kasir
    expect(newInput).toHaveAttribute('type', 'password');

    await user.clear(currentInput);
    await user.type(currentInput, 'KasirBenar123');
    await user.click(screen.getByRole('button', { name: 'Simpan Password Baru' }));

    await waitFor(() => {
      expect(changeSpy).toHaveBeenCalledTimes(2);
    });

    expect(
      await screen.findByRole('heading', { name: 'ISTANA BUAH SEMARANG' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Password berhasil diperbarui/i)).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(window.sessionStorage.getItem('istana_buah_refresh_token')).toBeNull();
  });

  it('menonaktifkan penyimpanan saat perangkat offline dan mengembalikan pengguna saat menekan tombol Batal', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/account/password']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const submitButton = await screen.findByRole('button', { name: 'Simpan Password Baru' });
    expect(submitButton).toBeEnabled();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(await screen.findByText(/Koneksi ke server toko diperlukan/i)).toBeInTheDocument();
    expect(submitButton).toBeDisabled();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(submitButton).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Batal' }));
    expect(await screen.findByRole('heading', { name: 'Layar Kasir (POS)' })).toBeInTheDocument();
  });
});
