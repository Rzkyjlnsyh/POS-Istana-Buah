import type { TransactionDto } from '@istana-buah/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionDetailPanel } from './transaction-detail-panel';

const sampleTx: TransactionDto = {
  id: 'tx-100',
  transactionNo: 'TRX-20261117-0010',
  shiftId: null,
  cashierId: 'c-1',
  cashierName: 'Siti Kasir',
  status: 'COMPLETED',
  subtotal: '67500',
  discountAmount: '2500',
  taxAmount: '0',
  totalAmount: '65000',
  paymentMethod: 'CASH',
  amountPaid: '100000',
  changeAmount: '35000',
  notes: 'Pelanggan langganan',
  voidedBy: null,
  voidedAt: null,
  voidReason: null,
  clientId: null,
  syncedAt: null,
  transactedAt: '2026-11-17T07:15:00.000Z',
  createdAt: '2026-11-17T07:15:00.000Z',
  updatedAt: '2026-11-17T07:15:00.000Z',
  items: [
    {
      id: 'item-1',
      transactionId: 'tx-100',
      productId: 'prod-1',
      productName: 'Mangga Harum Manis',
      productType: 'WEIGHT',
      quantity: '1.500',
      unitPrice: '25000',
      unitCost: '18000',
      discountAmount: '0',
      lineTotal: '37500',
      createdAt: '2026-11-17T07:15:00.000Z',
    },
    {
      id: 'item-2',
      transactionId: 'tx-100',
      productId: 'prod-2',
      productName: 'Nanas Madu',
      productType: 'UNIT',
      quantity: '2',
      unitPrice: '15000',
      unitCost: '10000',
      discountAmount: '0',
      lineTotal: '30000',
      createdAt: '2026-11-17T07:15:00.000Z',
    },
  ],
};

describe('TransactionDetailPanel (M03-008)', () => {
  const onReprint = vi.fn();
  const onVoidTransaction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('menampilkan empty state bila belum ada transaksi dipilih dan skeleton saat loading', () => {
    const { rerender } = render(
      <TransactionDetailPanel transaction={null} isLoadingDetail={false} onReprint={onReprint} />,
    );
    expect(screen.getByText('Pilih Transaksi untuk Detail')).toBeInTheDocument();

    rerender(
      <TransactionDetailPanel transaction={null} isLoadingDetail={true} onReprint={onReprint} />,
    );
    expect(screen.getByLabelText('Detail transaksi')).toHaveAttribute('aria-busy', 'true');
  });

  it('menampilkan detail lengkap transaksi dan menyembunyikan HPP serta Void bagi CASHIER', () => {
    render(
      <TransactionDetailPanel
        transaction={sampleTx}
        canViewCost={false}
        canVoid={false}
        onReprint={onReprint}
        onVoidTransaction={onVoidTransaction}
      />,
    );

    expect(screen.getByText('TRX-20261117-0010')).toBeInTheDocument();
    expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    expect(screen.getByText(/1,500 kg/)).toBeInTheDocument();
    expect(screen.getByText(/2 pcs/)).toBeInTheDocument();
    expect(screen.getByText('Pelanggan langganan')).toBeInTheDocument();
    expect(screen.getByText(/35\.000/)).toBeInTheDocument();

    // NFR-SEC-09 & RBAC: CASHIER tidak boleh melihat HPP maupun tombol Void
    expect(screen.queryByText(/HPP satuan:/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Batalkan \(Void\)/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Cetak Ulang Struk/i }));
    expect(onReprint).toHaveBeenCalledWith(sampleTx);
  });

  it('menampilkan HPP dan mendukung konfirmasi Void bervalidasi bagi MANAGER/OWNER', async () => {
    onVoidTransaction.mockResolvedValueOnce(undefined);

    render(
      <TransactionDetailPanel
        transaction={sampleTx}
        canViewCost={true}
        canVoid={true}
        onReprint={onReprint}
        onVoidTransaction={onVoidTransaction}
      />,
    );

    expect(screen.getAllByText(/HPP satuan:/i)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /Batalkan \(Void\)/i }));

    // Alasan terlalu pendek (<3 karakter) harus ditolak dengan pesan aksesibel
    fireEvent.change(screen.getByLabelText(/Alasan Pembatalan/i), { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: /Konfirmasi Void Transaksi/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/minimal 3 karakter/i);
    expect(onVoidTransaction).not.toHaveBeenCalled();

    // Alasan valid memanggil callback void
    fireEvent.change(screen.getByLabelText(/Alasan Pembatalan/i), {
      target: { value: 'Salah input berat timbangan' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Konfirmasi Void Transaksi/i }));

    await waitFor(() => {
      expect(onVoidTransaction).toHaveBeenCalledWith('tx-100', 'Salah input berat timbangan');
    });
  });

  it('menampilkan banner info void untuk transaksi berstatus VOIDED & salin nomor transaksi', async () => {
    const voidedTx: TransactionDto = {
      ...sampleTx,
      status: 'VOIDED',
      voidReason: 'Salah harga kasir',
      voidedAt: '2026-11-17T08:00:00.000Z',
    };

    render(
      <TransactionDetailPanel
        transaction={voidedTx}
        canVoid={true}
        onReprint={onReprint}
        onVoidTransaction={onVoidTransaction}
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent(/Salah harga kasir/);
    expect(screen.queryByRole('button', { name: /Batalkan \(Void\)/i })).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Salin nomor transaksi TRX-20261117-0010/i }),
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('TRX-20261117-0010');
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (axe-core)', async () => {
    const { container } = render(
      <TransactionDetailPanel
        transaction={sampleTx}
        canViewCost={true}
        canVoid={true}
        onReprint={onReprint}
        onVoidTransaction={onVoidTransaction}
      />,
    );
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
