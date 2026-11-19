import type { EmployeeDto, ShiftDto } from '@istana-buah/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../../stores/auth-store';
import * as employeeApi from '../api/employee-api';
import { EmployeePage } from './employee-page';

vi.mock('../api/employee-api');

const ownerFixture: EmployeeDto = {
  id: 'u-owner',
  username: 'owner',
  fullName: 'Budi Pemilik',
  role: 'OWNER',
  phoneNumber: '0811111111',
  isActive: true,
  isLocked: false,
  lockedUntil: null,
  lastLoginAt: '2026-11-19T01:00:00.000Z',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-19T01:00:00.000Z',
  shiftCount: 0,
};

const lockedCashierFixture: EmployeeDto = {
  id: 'u-kasir',
  username: 'kasir_pagi',
  fullName: 'Dewi Sartika',
  role: 'CASHIER',
  phoneNumber: '08123456789',
  isActive: true,
  isLocked: true,
  lockedUntil: '2026-11-19T09:00:00.000Z',
  lastLoginAt: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-19T01:00:00.000Z',
  shiftCount: 3,
};

const shiftFixture: ShiftDto = {
  id: 'sh-1',
  userId: 'u-kasir',
  cashierName: 'Dewi Sartika',
  shiftNo: 'SHIFT-20261119-001',
  status: 'CLOSED',
  openedAt: '2026-11-19T01:00:00.000Z',
  closedAt: '2026-11-19T09:00:00.000Z',
  openingCash: '300000.00',
  closingCash: '750000.00',
  expectedCash: '750000.00',
  cashDifference: '0.00',
  totalSales: '450000.00',
  totalTransactions: 12,
  notes: null,
  summary: {
    cashSales: '450000.00',
    qrisSales: '0.00',
    bankTransferSales: '0.00',
    mixedSales: '0.00',
    completedTransactions: 12,
    voidedTransactions: 0,
  },
  createdAt: '2026-11-19T01:00:00.000Z',
  updatedAt: '2026-11-19T09:00:00.000Z',
};

describe('EmployeePage (M10-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'u-owner', username: 'owner', fullName: 'Budi Pemilik', role: 'OWNER' },
      accessToken: 'tok',
      isAuthenticated: true,
    });
    vi.mocked(employeeApi.getEmployees).mockResolvedValue({
      items: [ownerFixture, lockedCashierFixture],
      meta: { page: 1, limit: 20, total: 2 },
    });
    vi.mocked(employeeApi.createEmployee).mockResolvedValue({
      ...lockedCashierFixture,
      id: 'u-new',
      username: 'kasir_sore',
      fullName: 'Rina Kusuma',
      isLocked: false,
    });
    vi.mocked(employeeApi.updateEmployee).mockResolvedValue({
      ...lockedCashierFixture,
      isLocked: false,
    });
    vi.mocked(employeeApi.getEmployeeShifts).mockResolvedValue({
      items: [shiftFixture],
      meta: { page: 1, limit: 20, total: 1 },
    });
    vi.mocked(employeeApi.deleteEmployee).mockResolvedValue(undefined);
  });

  it('menampilkan daftar pegawai, membuat akun baru, membuka lockout, melihat riwayat shift, hapus & lulus axe-core', async () => {
    const user = userEvent.setup();
    const { container } = render(<EmployeePage />);

    expect(await screen.findByRole('heading', { name: 'Manajemen Pegawai' })).toBeInTheDocument();
    expect(await screen.findAllByText('Dewi Sartika')).toHaveLength(2);
    expect(screen.getByText('1 Terkunci')).toBeInTheDocument();

    const axeRes = await axe.run(container);
    expect(axeRes.violations).toEqual([]);

    // 1. Tambah pegawai baru dengan validasi password kuat
    await user.click(screen.getByRole('button', { name: /Tambah Pegawai/i }));
    const createDialog = await screen.findByRole('dialog');

    await user.type(within(createDialog).getByLabelText(/Username/i), 'kasir_sore');
    await user.type(within(createDialog).getByLabelText(/Nama Lengkap/i), 'Rina Kusuma');
    await user.type(within(createDialog).getByLabelText(/Password Awal/i), 'lemah');
    await user.click(within(createDialog).getByRole('button', { name: /Buat Akun Pegawai/i }));
    expect(await within(createDialog).findByText(/minimal 8 karakter/i)).toBeInTheDocument();

    const pwInput = within(createDialog).getByLabelText(/Password Awal/i);
    await user.clear(pwInput);
    await user.type(pwInput, 'KuatBanget123');
    await user.click(within(createDialog).getByRole('button', { name: /Buat Akun Pegawai/i }));

    await waitFor(() => {
      expect(employeeApi.createEmployee).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'kasir_sore', fullName: 'Rina Kusuma' }),
      );
    });
    expect(await screen.findByText(/berhasil dibuat/i)).toBeInTheDocument();

    // 2. Edit Dewi Sartika & buka kunci lockout
    await user.click(screen.getByRole('button', { name: 'Ubah Dewi Sartika' }));
    const editDialog = await screen.findByRole('dialog');
    await user.click(within(editDialog).getByLabelText(/Buka kunci akun lockout/i));
    await user.click(within(editDialog).getByRole('button', { name: /Simpan Perubahan/i }));
    await waitFor(() => {
      expect(employeeApi.updateEmployee).toHaveBeenCalledWith(
        'u-kasir',
        expect.objectContaining({ unlockAccount: true }),
      );
    });

    // 3. Riwayat shift pegawai
    await user.click(screen.getByRole('button', { name: 'Riwayat shift Dewi Sartika' }));
    const shiftDialog = await screen.findByRole('dialog');
    expect(await within(shiftDialog).findByText('SHIFT-20261119-001')).toBeInTheDocument();
    await user.click(within(shiftDialog).getByRole('button', { name: 'Tutup' }));

    // 4. Hapus Dewi Sartika (Budi Pemilik sendiri tombol hapusnya disabled!)
    expect(screen.getByRole('button', { name: 'Hapus Budi Pemilik' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Hapus Dewi Sartika' }));
    const delDialog = await screen.findByRole('dialog');
    await user.click(within(delDialog).getByRole('button', { name: /Ya, Hapus Pegawai/i }));
    await waitFor(() => {
      expect(employeeApi.deleteEmployee).toHaveBeenCalledWith('u-kasir');
    });
  });

  it('menyaring berdasarkan peran dan menangani error API dengan aman', async () => {
    const user = userEvent.setup();
    render(<EmployeePage />);
    await screen.findAllByText('Dewi Sartika');

    await user.selectOptions(screen.getByLabelText(/Peran Pegawai/i), 'CASHIER');
    await waitFor(() => {
      expect(employeeApi.getEmployees).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'CASHIER' }),
      );
    });

    vi.mocked(employeeApi.getEmployees).mockRejectedValueOnce(new Error('Koneksi terputus'));
    await user.click(screen.getByRole('button', { name: /Segarkan/i }));
    expect(await screen.findByText(/Gagal memuat daftar pegawai/i)).toBeInTheDocument();
  });

  it('mendukung pencarian ter-debounce, filter status, paginasi & penanganan galat modal', async () => {
    const user = userEvent.setup();
    vi.mocked(employeeApi.getEmployees).mockResolvedValue({
      items: [ownerFixture, lockedCashierFixture],
      meta: { page: 1, limit: 20, total: 45 },
    });

    render(<EmployeePage />);
    await screen.findAllByText('Dewi Sartika');

    // Filter status Nonaktif + pencarian ter-debounce
    await user.selectOptions(screen.getByLabelText(/^Status Akun$/i), 'INACTIVE');
    await user.type(screen.getByLabelText(/Cari Nama \/ Username \/ HP/i), 'Dewi');
    await waitFor(() => {
      expect(employeeApi.getEmployees).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, search: 'Dewi' }),
      );
    });

    // Paginasi halaman berikutnya & sebelumnya
    await user.click(screen.getByRole('button', { name: /Halaman berikutnya/i }));
    await waitFor(() => {
      expect(employeeApi.getEmployees).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    });
    await user.click(screen.getByRole('button', { name: /Halaman sebelumnya/i }));

    // Uji toggle tampilkan password + penolakan API saat buat pegawai
    vi.mocked(employeeApi.createEmployee).mockRejectedValueOnce(
      new Error('Username sudah terdaftar'),
    );
    await user.click(screen.getByRole('button', { name: /Tambah Pegawai/i }));
    const createDialog = await screen.findByRole('dialog');

    await user.click(within(createDialog).getByRole('button', { name: /Tampilkan password/i }));
    const pwField = within(createDialog).getByLabelText(/Password Awal/i);
    expect(pwField).toHaveAttribute('type', 'text');

    await user.type(within(createDialog).getByLabelText(/Username/i), 'duplikat_user');
    await user.type(within(createDialog).getByLabelText(/Nama Lengkap/i), 'Duplikat User');
    await user.type(within(createDialog).getByLabelText(/Nomor Telepon/i), '0899999999');
    await user.type(pwField, 'KuatBanget123');
    await user.selectOptions(within(createDialog).getByLabelText(/Peran Akses/i), 'MANAGER');
    await user.click(within(createDialog).getByLabelText(/Akun aktif/i));
    await user.click(within(createDialog).getByRole('button', { name: /Buat Akun Pegawai/i }));

    expect(await within(createDialog).findByText(/Validasi gagal/i)).toBeInTheDocument();
    await user.click(within(createDialog).getByRole('button', { name: 'Batal' }));

    // Uji gagal hapus pegawai
    vi.mocked(employeeApi.deleteEmployee).mockRejectedValueOnce(new Error('Shift masih terbuka'));
    await user.click(screen.getByRole('button', { name: 'Hapus Dewi Sartika' }));
    const delDialog = await screen.findByRole('dialog');
    await user.click(within(delDialog).getByRole('button', { name: /Ya, Hapus Pegawai/i }));
    expect(await within(delDialog).findByText(/Tidak dapat menghapus akun/i)).toBeInTheDocument();
  });
});
