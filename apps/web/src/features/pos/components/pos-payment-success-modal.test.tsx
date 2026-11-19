import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransactionDto } from '@istana-buah/shared';
import { PosPaymentSuccessModal } from './pos-payment-success-modal';

const mockTransaction: TransactionDto = {
  id: 'tx-123',
  transactionNo: 'TRX-20261108-0042',
  shiftId: null,
  cashierId: 'c1',
  cashierName: 'Siti Aminah',
  status: 'COMPLETED',
  subtotal: '45000',
  discountAmount: '0',
  taxAmount: '0',
  totalAmount: '45000',
  paymentMethod: 'CASH',
  amountPaid: '50000',
  changeAmount: '5000',
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
      transactionId: 'tx-123',
      productId: 'p1',
      productName: 'Jeruk Medan',
      productType: 'WEIGHT',
      quantity: '1.5',
      unitPrice: '30000',
      discountAmount: '0',
      lineTotal: '45000',
      createdAt: new Date().toISOString(),
    },
  ],
};

describe('PosPaymentSuccessModal', () => {
  const onClose = vi.fn();
  const onPrintReceipt = vi.fn();
  const onNewTransaction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tidak merender apapun saat isOpen bernilai false atau transaction null', () => {
    const { container, rerender } = render(
      <PosPaymentSuccessModal
        isOpen={false}
        onClose={onClose}
        transaction={mockTransaction}
        onPrintReceipt={onPrintReceipt}
        onNewTransaction={onNewTransaction}
      />,
    );
    expect(container.firstChild).toBeNull();

    rerender(
      <PosPaymentSuccessModal
        isOpen={true}
        onClose={onClose}
        transaction={null}
        onPrintReceipt={onPrintReceipt}
        onNewTransaction={onNewTransaction}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('merender nomor transaksi, kembalian tunai, dan detail finansial', () => {
    render(
      <PosPaymentSuccessModal
        isOpen={true}
        onClose={onClose}
        transaction={mockTransaction}
        onPrintReceipt={onPrintReceipt}
        onNewTransaction={onNewTransaction}
      />,
    );

    expect(screen.getByText('Transaksi Berhasil Disimpan')).toBeInTheDocument();
    expect(screen.getByText('TRX-20261108-0042')).toBeInTheDocument();
    expect(screen.getByText('Uang Kembalian Pelanggan')).toBeInTheDocument();
    expect(screen.getByText(/^Rp\s*5\.000$/)).toBeInTheDocument();
    expect(screen.getByText('Tunai (Cash)')).toBeInTheDocument();
  });

  it('memanggil onNewTransaction saat tombol Transaksi Baru diklik', () => {
    render(
      <PosPaymentSuccessModal
        isOpen={true}
        onClose={onClose}
        transaction={mockTransaction}
        onPrintReceipt={onPrintReceipt}
        onNewTransaction={onNewTransaction}
      />,
    );

    const newTxBtn = screen.getByRole('button', { name: /Transaksi Baru/i });
    fireEvent.click(newTxBtn);

    expect(onNewTransaction).toHaveBeenCalledTimes(1);
  });

  it('memanggil onPrintReceipt saat tombol Cetak Struk diklik', () => {
    render(
      <PosPaymentSuccessModal
        isOpen={true}
        onClose={onClose}
        transaction={mockTransaction}
        onPrintReceipt={onPrintReceipt}
        onNewTransaction={onNewTransaction}
      />,
    );

    const printBtn = screen.getByRole('button', { name: /Cetak Struk/i });
    fireEvent.click(printBtn);

    expect(onPrintReceipt).toHaveBeenCalledWith(mockTransaction);
  });

  it('merespons shortcut keyboard Enter dan P', () => {
    render(
      <PosPaymentSuccessModal
        isOpen={true}
        onClose={onClose}
        transaction={mockTransaction}
        onPrintReceipt={onPrintReceipt}
        onNewTransaction={onNewTransaction}
      />,
    );

    fireEvent.keyDown(window, { key: 'p' });
    expect(onPrintReceipt).toHaveBeenCalledWith(mockTransaction);

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onNewTransaction).toHaveBeenCalledTimes(1);
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (axe-core)', async () => {
    const { container } = render(
      <PosPaymentSuccessModal
        isOpen={true}
        onClose={onClose}
        transaction={mockTransaction}
        onPrintReceipt={onPrintReceipt}
        onNewTransaction={onNewTransaction}
      />,
    );

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
