import type { ShiftDto } from '@istana-buah/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../../stores/auth-store';
import * as shiftApi from '../api/shift-api';
import { ShiftPage } from './shift-page';

vi.mock('../api/shift-api');

const openShiftFixture: ShiftDto = {
  id: 'sh-1',
  userId: 'u-kasir',
  cashierName: 'Kasir Utama',
  shiftNo: 'SHIFT-20261117-001',
  status: 'OPEN',
  openedAt: '2026-11-17T01:00:00.000Z',
  closedAt: null,
  openingCash: '500000.00',
  closingCash: null,
  expectedCash: '560000.00',
  cashDifference: null,
  totalSales: '90000.00',
  totalTransactions: 2,
  notes: 'Shift Pagi',
  summary: {
    cashSales: '60000.00',
    qrisSales: '30000.00',
    bankTransferSales: '0.00',
    mixedSales: '0.00',
    completedTransactions: 2,
    voidedTransactions: 0,
  },
  createdAt: '2026-11-17T01:00:00.000Z',
  updatedAt: '2026-11-17T01:00:00.000Z',
};

const closedShiftFixture: ShiftDto = {
  ...openShiftFixture,
  status: 'CLOSED',
  closedAt: '2026-11-17T09:00:00.000Z',
  closingCash: '565000.00',
  cashDifference: '5000.00',
};

describe('ShiftPage (M06-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 'u-kasir',
        username: 'kasir01',
        fullName: 'Kasir Utama',
        role: 'CASHIER',
      },
      accessToken: 'tok',
      isAuthenticated: true,
    });
  });

  it('membuka shift baru saat belum ada shift aktif, validasi input & preset kas awal', async () => {
    const user = userEvent.setup();
    vi.mocked(shiftApi.getActiveShift)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(openShiftFixture);
    vi.mocked(shiftApi.getShifts)
      .mockResolvedValueOnce({ items: [], meta: { page: 1, limit: 20, total: 0 } })
      .mockResolvedValueOnce({ items: [openShiftFixture], meta: { page: 1, limit: 20, total: 1 } });
    vi.mocked(shiftApi.openShift).mockResolvedValueOnce(openShiftFixture);

    const { container } = render(<ShiftPage />);

    expect(await screen.findByText(/Belum Ada Shift Terbuka/i)).toBeInTheDocument();
    const axeEmpty = await axe.run(container);
    expect(axeEmpty.violations).toEqual([]);

    await user.click(screen.getByRole('button', { name: /Buka Shift Kasir/i }));
    const dialog = await screen.findByRole('dialog');

    // Validasi kas awal negatif ditolak tanpa submit
    const cashInput = within(dialog).getByLabelText(/Kas Awal di Laci/i);
    await user.clear(cashInput);
    await user.type(cashInput, '-100');
    await user.click(within(dialog).getByRole('button', { name: /Buka Shift Sekarang/i }));
    expect(await within(dialog).findByText(/tidak boleh negatif/i)).toBeInTheDocument();

    // Pilih preset Rp 300.000 lalu submit
    await user.click(within(dialog).getByRole('button', { name: /300\.000/i }));
    await user.click(within(dialog).getByRole('button', { name: /Buka Shift Sekarang/i }));

    await waitFor(() => {
      expect(shiftApi.openShift).toHaveBeenCalledWith({
        openingCash: 300000,
        notes: null,
      });
    });

    expect(await screen.findByText(/Shift Aktif: SHIFT-20261117-001/i)).toBeInTheDocument();
  });

  it('menampilkan shift aktif, menghitung selisih live saat tutup shift, & tampilkan laporan', async () => {
    const user = userEvent.setup();
    vi.mocked(shiftApi.getActiveShift)
      .mockResolvedValueOnce(openShiftFixture)
      .mockResolvedValueOnce(null);
    vi.mocked(shiftApi.getShifts)
      .mockResolvedValueOnce({ items: [openShiftFixture], meta: { page: 1, limit: 20, total: 1 } })
      .mockResolvedValueOnce({
        items: [closedShiftFixture],
        meta: { page: 1, limit: 20, total: 1 },
      });
    vi.mocked(shiftApi.closeShift).mockResolvedValueOnce(closedShiftFixture);

    const { container } = render(<ShiftPage />);

    expect(await screen.findByText(/Shift Aktif: SHIFT-20261117-001/i)).toBeInTheDocument();
    expect(screen.getAllByText(/560\.000/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getAllByRole('button', { name: /^Tutup Shift$/i })[0]!);
    const closeDialog = await screen.findByRole('dialog');

    const closingInput = within(closeDialog).getByLabelText(/Total Kas Aktual di Laci/i);
    await user.clear(closingInput);
    await user.type(closingInput, '565000');

    expect(within(closeDialog).getByText(/Surplus/i)).toBeInTheDocument();

    await user.click(within(closeDialog).getByRole('button', { name: /Konfirmasi Tutup Shift/i }));

    await waitFor(() => {
      expect(shiftApi.closeShift).toHaveBeenCalledWith('sh-1', {
        closingCash: 565000,
        notes: 'Shift Pagi',
      });
    });

    // Otomatis menampilkan detail laporan penutupan shift
    const reportDialog = await screen.findByRole('dialog');
    expect(within(reportDialog).getByText(/Laporan Shift SHIFT-20261117-001/i)).toBeInTheDocument();
    await user.click(within(reportDialog).getByRole('button', { name: /Tutup/i }));

    const axeClosed = await axe.run(container);
    expect(axeClosed.violations).toEqual([]);
  });

  it('memfilter riwayat shift berdasarkan preset tanggal & status', async () => {
    const user = userEvent.setup();
    vi.mocked(shiftApi.getActiveShift).mockResolvedValue(null);
    vi.mocked(shiftApi.getShifts).mockResolvedValue({
      items: [closedShiftFixture],
      meta: { page: 1, limit: 20, total: 1 },
    });

    render(<ShiftPage />);
    expect((await screen.findAllByText('SHIFT-20261117-001')).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('button', { name: 'Hari Ini' }));
    await waitFor(() => {
      expect(shiftApi.getShifts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          startDate: expect.stringMatching(/T00:00:00/),
          endDate: expect.stringMatching(/T23:59:59\.999/),
        }),
      );
    });

    await user.selectOptions(screen.getByLabelText('Status Shift'), 'CLOSED');
    await waitFor(() => {
      expect(shiftApi.getShifts).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'CLOSED' }),
      );
    });
    expect((await screen.findAllByText('SHIFT-20261117-001')).length).toBeGreaterThanOrEqual(1);
  });
});
