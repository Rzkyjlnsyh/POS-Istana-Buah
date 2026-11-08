import type { ProductDto } from '@istana-buah/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PosWeightModal } from './pos-weight-modal';

const mockWeightProduct: ProductDto = {
  id: 'prod-mangga',
  categoryId: 'cat-lokal',
  category: { id: 'cat-lokal', name: 'Buah Lokal' },
  name: 'Mangga Harum Manis Super',
  description: 'Mangga harum manis segar matang pohon',
  productType: 'WEIGHT',
  pricePerKg: '25000.00',
  pricePerUnit: null,
  costPerKg: '18000.00',
  costPerUnit: null,
  stockQty: '10.500',
  minStockAlert: '2.000',
  imageUrl: null,
  isActive: true,
  barcodes: [{ id: 'b1', barcode: '899100100001', isPrimary: true }],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('PosWeightModal (M03-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (0 pelanggaran axe-core)', async () => {
    const { container } = render(
      <PosWeightModal
        isOpen={true}
        onClose={vi.fn()}
        product={mockWeightProduct}
        onConfirm={vi.fn()}
      />,
    );

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('merender info produk, harga per kg, dan menonaktifkan tombol tambah saat berat 0', () => {
    render(
      <PosWeightModal
        isOpen={true}
        onClose={vi.fn()}
        product={mockWeightProduct}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Mangga Harum Manis Super')).toBeInTheDocument();
    expect(screen.getByText(/rp 25\.000 \/ kg/i)).toBeInTheDocument();
    expect(screen.getByTestId('weight-display-value')).toHaveTextContent('0.000');

    // Tombol tambah harus disabled jika berat = 0 (AC: input berat = 0 disabled)
    const confirmBtn = screen.getByRole('button', { name: /tambah ke keranjang/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('memungkinkan input berat via numpad sentuh, membatasi 3 desimal, dan menghitung total harga real-time', async () => {
    const user = userEvent.setup();
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <PosWeightModal
        isOpen={true}
        onClose={handleClose}
        product={mockWeightProduct}
        onConfirm={handleConfirm}
      />,
    );

    // Tekan '1', '.', '2', '5', '0' (1.250 kg)
    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: /titik desimal/i }));
    await user.click(screen.getByRole('button', { name: '2' }));
    await user.click(screen.getByRole('button', { name: '5' }));
    await user.click(screen.getByRole('button', { name: '0' }));

    // Coba tekan angka ke-4 setelah desimal (harus dibatasi 3 desimal)
    await user.click(screen.getByRole('button', { name: '9' }));

    expect(screen.getByTestId('weight-display-value')).toHaveTextContent('1.250');
    // Total 1.250 kg * Rp 25.000 = Rp 31.250
    expect(screen.getByText(/rp 31\.250/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: /tambah ke keranjang/i });
    expect(confirmBtn).not.toBeDisabled();

    await user.click(confirmBtn);

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    expect(handleConfirm).toHaveBeenCalledWith(mockWeightProduct, 1.25);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('mendukung preset cepat (+0.5 kg, +1.0 kg) dan tombol Bersihkan (C)', async () => {
    const user = userEvent.setup();

    render(
      <PosWeightModal
        isOpen={true}
        onClose={vi.fn()}
        product={mockWeightProduct}
        onConfirm={vi.fn()}
      />,
    );

    // Klik preset +0.5 kg
    const presetHalf = screen.getByRole('button', { name: /\+0\.5 kg/i });
    await user.click(presetHalf);
    expect(screen.getByTestId('weight-display-value')).toHaveTextContent('0.500');

    // Klik preset +1.0 kg -> menjadi 1.500 kg
    const presetOne = screen.getByRole('button', { name: /\+1 kg/i });
    await user.click(presetOne);
    expect(screen.getByTestId('weight-display-value')).toHaveTextContent('1.500');

    // Klik tombol Clear
    const clearBtn = screen.getByRole('button', { name: /bersihkan input berat/i });
    await user.click(clearBtn);
    expect(screen.getByTestId('weight-display-value')).toHaveTextContent('0.000');
  });

  it('mendukung pengetikan keyboard fisik (angka, titik, backspace, enter)', async () => {
    const handleConfirm = vi.fn();

    render(
      <PosWeightModal
        isOpen={true}
        onClose={vi.fn()}
        product={mockWeightProduct}
        onConfirm={handleConfirm}
      />,
    );

    // Simulasikan keyboard fisik: 2 . 5 Enter
    fireEvent.keyDown(window, { key: '2' });
    fireEvent.keyDown(window, { key: '.' });
    fireEvent.keyDown(window, { key: '5' });

    expect(screen.getByTestId('weight-display-value')).toHaveTextContent('2.500');

    // Tekan Enter untuk konfirmasi
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(handleConfirm).toHaveBeenCalledWith(mockWeightProduct, 2.5);
  });

  it('menampilkan peringatan jika berat melebihi stok yang tercatat', async () => {
    render(
      <PosWeightModal
        isOpen={true}
        onClose={vi.fn()}
        product={mockWeightProduct} // stok: 10.500 kg
        initialWeight={12.0}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/perhatian: berat melebihi stok tercatat \(10\.500 kg\)/i),
    ).toBeInTheDocument();
  });
});
