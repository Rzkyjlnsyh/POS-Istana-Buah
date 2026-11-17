import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionDto } from '@istana-buah/shared';
import * as transactionApi from '../api/transaction-api';
import { usePosCartStore } from '../stores/pos-cart-store';
import { PosPaymentModal } from './pos-payment-modal';

vi.mock('../api/transaction-api', () => ({
  createTransaction: vi.fn(),
}));

const mockTransaction: TransactionDto = {
  id: 'tx-12345',
  transactionNo: 'TRX-20261108-0001',
  shiftId: null,
  cashierId: 'c1',
  cashierName: 'Budi Santoso',
  status: 'COMPLETED',
  subtotal: '50000',
  discountAmount: '0',
  taxAmount: '0',
  totalAmount: '50000',
  paymentMethod: 'CASH',
  amountPaid: '50000',
  changeAmount: '0',
  notes: null,
  voidedBy: null,
  voidedAt: null,
  voidReason: null,
  clientId: 'client-1',
  syncedAt: null,
  transactedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  items: [
    {
      id: 'ti-1',
      transactionId: 'tx-12345',
      productId: 'p1',
      productName: 'Apel Fuji',
      productType: 'WEIGHT',
      quantity: '2',
      unitPrice: '25000',
      discountAmount: '0',
      lineTotal: '50000',
      createdAt: new Date().toISOString(),
    },
  ],
};

describe('PosPaymentModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    usePosCartStore.setState({
      items: [
        {
          id: 'item-1',
          productId: '11111111-1111-1111-1111-111111111111',
          name: 'Apel Fuji Super',
          productType: 'WEIGHT',
          unitPrice: 25000,
          quantity: 2,
          discountAmount: 0,
          lineTotal: 50000,
          availableStock: 50,
        },
      ],
      globalDiscount: 0,
    });
  });

  it('tidak merender apapun saat isOpen bernilai false', () => {
    const { container } = render(
      <PosPaymentModal
        isOpen={false}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('merender modal pembayaran dengan ringkasan belanja dan tab Tunai', () => {
    render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Proses Pembayaran')).toBeInTheDocument();
    expect(screen.getByText('Tunai (Cash)')).toBeInTheDocument();
    expect(screen.getByText('QRIS')).toBeInTheDocument();
    expect(screen.getByText('Transfer Bank')).toBeInTheDocument();

    // Nilai tagihan 50.000 harus muncul
    expect(screen.getAllByText(/50\.000/).length).toBeGreaterThan(0);
  });

  it('memvalidasi input tunai: tombol bayar disabled jika pembayaran kurang', () => {
    render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    const submitBtn = screen.getByRole('button', { name: /Konfirmasi Pembayaran/i });
    expect(submitBtn).toBeDisabled();

    // Input nominal kurang dari 50.000 (cth: 20.000)
    const cashInput = screen.getByLabelText(/Uang Diterima dari Pelanggan/i);
    fireEvent.change(cashInput, { target: { value: '20000' } });

    expect(screen.getByText(/Kekurangan/i)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();
  });

  it('menghitung kembalian akurat dan mengaktifkan tombol bayar jika cukup', () => {
    render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    const cashInput = screen.getByLabelText(/Uang Diterima dari Pelanggan/i);
    fireEvent.change(cashInput, { target: { value: '100000' } });

    expect(screen.getByText(/Kembalian/i)).toBeInTheDocument();
    expect(screen.getByText(/Lunas/i)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Konfirmasi Pembayaran/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it('mendukung tombol pilihan cepat (Fast Cash Presets)', () => {
    render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    const uangPasBtn = screen.getByRole('button', { name: /Uang Pas:/i });
    fireEvent.click(uangPasBtn);

    const cashInput = screen.getByLabelText(/Uang Diterima dari Pelanggan/i) as HTMLInputElement;
    expect(cashInput.value).toBe('50.000');
    expect(screen.getByText(/Lunas/i)).toBeInTheDocument();
  });

  it('mendukung input numpad interaktif dan tombol Clear', () => {
    render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    const btn5 = screen.getByRole('button', { name: '5' });
    const btn000 = screen.getByRole('button', { name: '000' });
    const clearBtn = screen.getByRole('button', { name: 'Clear' });

    fireEvent.click(btn5);
    fireEvent.click(btn000);

    const cashInput = screen.getByLabelText(/Uang Diterima dari Pelanggan/i) as HTMLInputElement;
    expect(cashInput.value).toBe('5.000');

    fireEvent.click(clearBtn);
    expect(cashInput.value).toBe('');
  });

  it('dapat berpindah ke Tab QRIS dan menampilkan visual QR & timer', () => {
    render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    const qrisTab = screen.getByRole('tab', { name: /QRIS/i });
    fireEvent.click(qrisTab);

    expect(screen.getByRole('img', { name: /QR Code QRIS/i })).toBeInTheDocument();
    expect(screen.getByText(/Waktu Berlaku QRIS/i)).toBeInTheDocument();

    const confirmQrisBtn = screen.getByRole('button', { name: /Konfirmasi QRIS Diterima/i });
    expect(confirmQrisBtn).not.toBeDisabled();
  });

  it('dapat berpindah ke Tab Transfer Bank dan menyalin nomor rekening', async () => {
    render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    const transferTab = screen.getByRole('tab', { name: /Transfer Bank/i });
    fireEvent.click(transferTab);

    expect(screen.getByText('Bank Central Asia')).toBeInTheDocument();
    expect(screen.getByText('Bank Mandiri')).toBeInTheDocument();
    expect(screen.getByText('Bank Rakyat Indonesia')).toBeInTheDocument();

    const copyBcaBtn = screen.getByRole('button', { name: /Salin rekening BCA/i });
    fireEvent.click(copyBcaBtn);

    await waitFor(() => {
      expect(screen.getByText('Tersalin!')).toBeInTheDocument();
    });
  });

  it('memproses pembayaran tunai via createTransaction API dan memanggil onSuccess', async () => {
    vi.mocked(transactionApi.createTransaction).mockResolvedValueOnce(mockTransaction);

    render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    const uangPasBtn = screen.getByRole('button', { name: /Uang Pas:/i });
    fireEvent.click(uangPasBtn);

    const submitBtn = screen.getByRole('button', { name: /Konfirmasi Pembayaran/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(transactionApi.createTransaction).toHaveBeenCalledTimes(1);
      expect(transactionApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: 'CASH',
          amountPaid: 50000,
          items: [
            expect.objectContaining({
              productId: '11111111-1111-1111-1111-111111111111',
              quantity: 2,
              unitPrice: 25000,
            }),
          ],
        }),
      );
      expect(onSuccess).toHaveBeenCalledWith(mockTransaction);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('menampilkan pesan error jika API gagal memproses transaksi', async () => {
    vi.mocked(transactionApi.createTransaction).mockRejectedValueOnce({
      response: { data: { message: 'Stok barang tidak mencukupi' } },
    });

    render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    const uangPasBtn = screen.getByRole('button', { name: /Uang Pas:/i });
    fireEvent.click(uangPasBtn);

    const submitBtn = screen.getByRole('button', { name: /Konfirmasi Pembayaran/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Stok barang tidak mencukupi')).toBeInTheDocument();
    });
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (axe-core)', async () => {
    const { container } = render(
      <PosPaymentModal
        isOpen={true}
        onClose={onClose}
        initialMethod="CASH"
        onSuccess={onSuccess}
      />,
    );

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
