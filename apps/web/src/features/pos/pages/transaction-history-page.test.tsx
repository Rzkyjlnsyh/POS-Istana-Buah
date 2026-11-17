import type { TransactionDto } from '@istana-buah/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as printerService from '../../../lib/printer/thermal-printer-service';
import { useAuthStore } from '../../../stores/auth-store';
import * as transactionApi from '../api/transaction-api';
import { TransactionHistoryPage } from './transaction-history-page';

vi.mock('../api/transaction-api', () => ({
  getTransactions: vi.fn(),
  getTransactionById: vi.fn(),
  voidTransaction: vi.fn(),
  createTransaction: vi.fn(),
}));

vi.mock('../../../lib/printer/thermal-printer-service', async (importOriginal) => {
  const actual = await importOriginal<typeof printerService>();
  return { ...actual, executeThermalPrint: vi.fn() };
});

const txCash: TransactionDto = {
  id: 'tx-1',
  transactionNo: 'TRX-20261117-0001',
  shiftId: null,
  cashierId: 'u-cashier',
  cashierName: 'Siti Kasir',
  status: 'COMPLETED',
  subtotal: '37500',
  discountAmount: '0',
  taxAmount: '0',
  totalAmount: '37500',
  paymentMethod: 'CASH',
  amountPaid: '50000',
  changeAmount: '12500',
  notes: null,
  voidedBy: null,
  voidedAt: null,
  voidReason: null,
  clientId: null,
  syncedAt: null,
  transactedAt: '2026-11-17T03:00:00.000Z',
  createdAt: '2026-11-17T03:00:00.000Z',
  updatedAt: '2026-11-17T03:00:00.000Z',
  items: [
    {
      id: 'ti-1',
      transactionId: 'tx-1',
      productId: 'prod-1',
      productName: 'Mangga Harum Manis',
      productType: 'WEIGHT',
      quantity: '1.500',
      unitPrice: '25000',
      unitCost: null,
      discountAmount: '0',
      lineTotal: '37500',
      createdAt: '2026-11-17T03:00:00.000Z',
    },
  ],
};

const txQris: TransactionDto = {
  ...txCash,
  id: 'tx-2',
  transactionNo: 'TRX-20261117-0002',
  cashierId: 'u-cashier-2',
  cashierName: 'Budi Kasir',
  paymentMethod: 'QRIS',
  subtotal: '30000',
  totalAmount: '30000',
  amountPaid: '30000',
  changeAmount: '0',
  items: [
    {
      id: 'ti-2',
      transactionId: 'tx-2',
      productId: 'prod-2',
      productName: 'Nanas Madu Pemalang',
      productType: 'UNIT',
      quantity: '2',
      unitPrice: '15000',
      unitCost: '10000',
      discountAmount: '0',
      lineTotal: '30000',
      createdAt: '2026-11-17T04:00:00.000Z',
    },
  ],
};

describe('TransactionHistoryPage (M03-008)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    useAuthStore.getState().setSession({
      accessToken: 'cashier-token',
      refreshToken: 'cashier-refresh',
      user: {
        id: 'u-cashier',
        username: 'kasir1',
        fullName: 'Siti Kasir',
        role: 'CASHIER',
      },
    });

    vi.mocked(transactionApi.getTransactions).mockResolvedValue({
      items: [txCash, txQris],
      meta: { page: 1, limit: 20, total: 2 },
    });
    vi.mocked(transactionApi.getTransactionById).mockImplementation(async (id) =>
      id === 'tx-2' ? txQris : txCash,
    );
  });

  it('memuat transaksi hari ini secara bawaan, menampilkan list & detail transaksi pertama', async () => {
    render(
      <MemoryRouter>
        <TransactionHistoryPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Riwayat Transaksi' })).toBeInTheDocument();

    await waitFor(() => {
      expect(transactionApi.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          startDate: expect.stringMatching(/T00:00:00/),
          endDate: expect.stringMatching(/T23:59:59\.999/),
        }),
      );
    });

    const listRegion = screen.getByRole('region', { name: /daftar riwayat transaksi/i });
    expect(await within(listRegion).findAllByText('TRX-20261117-0001')).not.toHaveLength(0);
    expect(within(listRegion).getAllByText('TRX-20261117-0002')).not.toHaveLength(0);

    // Panel detail menampilkan item transaksi terpilih pertama
    const detailRegion = screen.getByRole('region', {
      name: /detail transaksi TRX-20261117-0001/i,
    });
    expect(within(detailRegion).getByText('Mangga Harum Manis')).toBeInTheDocument();
  });

  it('memuat detail saat baris lain diklik dan mendukung reprint struk via modal ESC/POS', async () => {
    const user = userEvent.setup();
    vi.mocked(printerService.executeThermalPrint).mockResolvedValueOnce({
      method: 'browser',
      bytesLength: 256,
    });

    render(
      <MemoryRouter>
        <TransactionHistoryPage />
      </MemoryRouter>,
    );

    await screen.findByRole('region', { name: /detail transaksi TRX-20261117-0001/i });

    // Klik baris transaksi kedua (tx-2)
    const rowButtons = screen.getAllByRole('button', { name: /TRX-20261117-0002/i });
    await user.click(rowButtons[0]!);

    await waitFor(() => {
      expect(transactionApi.getTransactionById).toHaveBeenCalledWith('tx-2');
    });

    const detailRegion = await screen.findByRole('region', {
      name: /detail transaksi TRX-20261117-0002/i,
    });
    expect(within(detailRegion).getByText('Nanas Madu Pemalang')).toBeInTheDocument();

    // Reprint struk
    await user.click(within(detailRegion).getByRole('button', { name: /cetak ulang struk/i }));
    expect(
      await screen.findByRole('heading', { name: /pratinjau & cetak struk kasir/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('thermal-receipt-paper')).toHaveTextContent('TRX-20261117-0002');

    await user.click(screen.getByRole('button', { name: /cetak struk sekarang/i }));
    await waitFor(() => {
      expect(printerService.executeThermalPrint).toHaveBeenCalled();
    });
  });

  it('menyaring berdasarkan preset tanggal, metode pembayaran, status, dan pencarian', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TransactionHistoryPage />
      </MemoryRouter>,
    );

    await screen.findByRole('region', { name: /detail transaksi TRX-20261117-0001/i });
    vi.mocked(transactionApi.getTransactions).mockClear();

    await user.selectOptions(screen.getByLabelText('Metode Bayar'), 'QRIS');
    await waitFor(() => {
      expect(transactionApi.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethod: 'QRIS' }),
      );
    });

    await user.selectOptions(screen.getByLabelText('Status Transaksi'), 'VOIDED');
    await waitFor(() => {
      expect(transactionApi.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'VOIDED' }),
      );
    });

    await user.click(screen.getByRole('button', { name: '7 Hari' }));
    await waitFor(() => {
      expect(transactionApi.getTransactions).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText(/Cari No\. Struk/i), {
      target: { value: 'TRX-20261117-0002' },
    });
    await waitFor(
      () => {
        expect(transactionApi.getTransactions).toHaveBeenCalledWith(
          expect.objectContaining({ search: 'TRX-20261117-0002' }),
        );
      },
      { timeout: 1500 },
    );
  });

  it('mengizinkan MANAGER melakukan Void transaksi dan memperbarui tampilan', async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      accessToken: 'mgr-token',
      refreshToken: 'mgr-refresh',
      user: {
        id: 'u-mgr',
        username: 'manajer',
        fullName: 'Dewi Manajer',
        role: 'MANAGER',
      },
    });
    vi.mocked(transactionApi.voidTransaction).mockResolvedValueOnce({
      ...txCash,
      status: 'VOIDED',
      voidReason: 'Pembatalan salah timbang',
      voidedAt: '2026-11-17T06:00:00.000Z',
    });

    render(
      <MemoryRouter>
        <TransactionHistoryPage />
      </MemoryRouter>,
    );

    const detailRegion = await screen.findByRole('region', {
      name: /detail transaksi TRX-20261117-0001/i,
    });
    await user.click(within(detailRegion).getByRole('button', { name: /Batalkan \(Void\)/i }));
    await user.type(
      within(detailRegion).getByLabelText(/Alasan Pembatalan/i),
      'Pembatalan salah timbang',
    );
    await user.click(
      within(detailRegion).getByRole('button', { name: /Konfirmasi Void Transaksi/i }),
    );

    await waitFor(() => {
      expect(transactionApi.voidTransaction).toHaveBeenCalledWith(
        'tx-1',
        'Pembatalan salah timbang',
      );
    });

    expect(await screen.findByText(/berhasil dibatalkan \(Void\)/i)).toBeInTheDocument();
  });

  it('menangani kondisi kosong, paginasi, dan error jaringan dengan tombol Coba Lagi', async () => {
    const user = userEvent.setup();
    vi.mocked(transactionApi.getTransactions).mockRejectedValueOnce(new Error('Koneksi terputus'));

    render(
      <MemoryRouter>
        <TransactionHistoryPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Gagal memuat riwayat transaksi')).toBeInTheDocument();

    vi.mocked(transactionApi.getTransactions).mockResolvedValueOnce({
      items: [],
      meta: { page: 1, limit: 20, total: 0 },
    });
    await user.click(screen.getByRole('button', { name: 'Coba Lagi' }));

    expect(await screen.findByText('Belum ada transaksi ditemukan')).toBeInTheDocument();
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (0 pelanggaran axe-core)', async () => {
    const { container } = render(
      <MemoryRouter>
        <TransactionHistoryPage />
      </MemoryRouter>,
    );
    await screen.findByRole('region', { name: /detail transaksi TRX-20261117-0001/i });
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
