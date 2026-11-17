import type { TransactionDto } from '@istana-buah/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as printerService from '../../../lib/printer/thermal-printer-service';
import { PosReceiptModal } from './pos-receipt-modal';

vi.mock('../../../lib/printer/thermal-printer-service', async (importOriginal) => {
  const actual = await importOriginal<typeof printerService>();
  return { ...actual, executeThermalPrint: vi.fn() };
});

const tx = {
  id: 'tx-1',
  transactionNo: 'TRX-20261117-0001',
  cashierName: 'Siti Kasir',
  transactedAt: '2026-11-17T07:30:00.000Z',
  paymentMethod: 'CASH',
  subtotal: '37500',
  discountAmount: '0',
  taxAmount: '0',
  totalAmount: '37500',
  amountPaid: '50000',
  changeAmount: '12500',
  items: [
    {
      productName: 'Mangga Harum Manis',
      productType: 'WEIGHT',
      quantity: '1.5',
      unitPrice: '25000',
      lineTotal: '37500',
    },
  ],
} as unknown as TransactionDto;

describe('PosReceiptModal (M03-007)', () => {
  const onClose = vi.fn();
  const onPrinted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('tidak merender apa pun saat tertutup atau transaksi null', () => {
    const { container, rerender } = render(
      <PosReceiptModal isOpen={false} onClose={onClose} transaction={tx} />,
    );
    expect(container.firstChild).toBeNull();
    rerender(<PosReceiptModal isOpen onClose={onClose} transaction={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('menampilkan pratinjau struk lengkap pada kertas thermal', () => {
    render(<PosReceiptModal isOpen onClose={onClose} transaction={tx} />);
    const paper = screen.getByTestId('thermal-receipt-paper');
    expect(paper).toHaveAttribute('id', 'thermal-print-area');
    expect(paper).toHaveTextContent('TRX-20261117-0001');
    expect(paper).toHaveTextContent('Mangga Harum Manis');
    expect(paper).toHaveTextContent('TUNAI (CASH)');
    expect(paper).toHaveTextContent('KEMBALIAN');
    expect(paper).toHaveTextContent(/37\.500/);
  });

  it('mengganti ukuran kertas dan menyimpan ke konfigurasi', () => {
    render(<PosReceiptModal isOpen onClose={onClose} transaction={tx} />);
    fireEvent.click(screen.getByRole('button', { name: /kertas 80mm/i }));
    expect(screen.getByText(/Simulasi Kertas Thermal \(80mm\)/)).toBeInTheDocument();
    expect(printerService.loadPrinterConfig().paperWidth).toBe('80mm');
  });

  it('menampilkan input IP untuk metode network dan baud rate untuk serial', () => {
    render(<PosReceiptModal isOpen onClose={onClose} transaction={tx} />);
    fireEvent.click(screen.getByRole('button', { name: /network ip printer/i }));
    expect(screen.getByLabelText(/alamat ip printer thermal/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/alamat ip printer thermal/i), {
      target: { value: '10.1.1.9' },
    });
    expect(printerService.loadPrinterConfig().networkIp).toBe('10.1.1.9');

    fireEvent.click(screen.getByRole('button', { name: /web serial/i }));
    expect(screen.getByLabelText(/baud rate/i)).toBeInTheDocument();
  });

  it('mencetak struk dan menampilkan status sukses + memanggil onPrinted', async () => {
    vi.mocked(printerService.executeThermalPrint).mockResolvedValueOnce({
      method: 'browser',
      bytesLength: 321,
    });
    render(<PosReceiptModal isOpen onClose={onClose} transaction={tx} onPrinted={onPrinted} />);

    fireEvent.click(screen.getByRole('button', { name: /cetak struk sekarang/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/321 bytes/);
    });
    expect(onPrinted).toHaveBeenCalledWith('browser');
  });

  it('menampilkan error saat pencetakan gagal', async () => {
    vi.mocked(printerService.executeThermalPrint).mockRejectedValueOnce(
      new Error('Printer tidak terhubung'),
    );
    render(<PosReceiptModal isOpen onClose={onClose} transaction={tx} onPrinted={onPrinted} />);

    fireEvent.click(screen.getByRole('button', { name: /cetak struk sekarang/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Printer tidak terhubung');
    });
    expect(onPrinted).not.toHaveBeenCalled();
  });

  it('menyalin teks struk ke clipboard', async () => {
    render(<PosReceiptModal isOpen onClose={onClose} transaction={tx} />);
    fireEvent.click(screen.getByRole('button', { name: /salin teks struk/i }));
    await waitFor(() => {
      expect(screen.getByText('Teks Tersalin!')).toBeInTheDocument();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('TRX-20261117-0001'),
    );
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (axe-core)', async () => {
    const { container } = render(<PosReceiptModal isOpen onClose={onClose} transaction={tx} />);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});
