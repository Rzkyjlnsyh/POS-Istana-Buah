import type { ProductDto } from '@istana-buah/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BarcodePrintModal } from './barcode-print-modal';

const mockProduct: ProductDto = {
  id: 'prod-test-1',
  categoryId: 'cat-test',
  category: {
    id: 'cat-test',
    name: 'Buah Lokal',
  },
  name: 'Melon Golden Aroma Super',
  description: 'Melon manis segar',
  productType: 'WEIGHT',
  pricePerKg: '28000.00',
  pricePerUnit: null,
  costPerKg: '18000.00',
  costPerUnit: null,
  stockQty: '45.000',
  minStockAlert: '10.000',
  imageUrl: null,
  isActive: true,
  barcodes: [
    { id: 'bc-1', barcode: '2001000000018', isPrimary: true },
    { id: 'bc-2', barcode: '2001000000025', isPrimary: false },
  ],
  createdAt: '2026-03-01T08:00:00.000Z',
  updatedAt: '2026-03-01T08:00:00.000Z',
};

describe('BarcodePrintModal (M02-006)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'print').mockImplementation(() => {});
  });

  it('lulus audit aksesibilitas WCAG 2.1 AA (0 pelanggaran axe-core)', async () => {
    const { container } = render(
      <BarcodePrintModal isOpen={true} onClose={vi.fn()} product={mockProduct} />,
    );

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('merender preview label thermal dengan nama toko, produk, harga, dan barcode SVG', () => {
    render(<BarcodePrintModal isOpen={true} onClose={vi.fn()} product={mockProduct} />);

    expect(screen.getAllByText('ISTANA BUAH SEMARANG').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Melon Golden Aroma Super').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Rp\s*28\.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('2001000000018').length).toBeGreaterThanOrEqual(1);
  });

  it('mengubah ukuran kertas thermal (58mm, 80mm, sticker) dan jumlah salinan label', async () => {
    const user = userEvent.setup();
    render(<BarcodePrintModal isOpen={true} onClose={vi.fn()} product={mockProduct} />);

    const paperSelect = screen.getByLabelText('Ukuran Kertas Thermal');
    await user.selectOptions(paperSelect, '80mm');
    expect(screen.getByText(/Preview Label Thermal \(80mm\)/i)).toBeInTheDocument();

    // Preset tombol 5x
    const preset5x = screen.getByRole('button', { name: '5x' });
    await user.click(preset5x);

    const printBtn = screen.getByRole('button', { name: /Cetak 5 Label Thermal/i });
    expect(printBtn).toBeInTheDocument();
  });

  it('memanggil window.print() saat tombol cetak ditekan', async () => {
    const user = userEvent.setup();
    render(<BarcodePrintModal isOpen={true} onClose={vi.fn()} product={mockProduct} />);

    const printBtn = screen.getByRole('button', { name: /Cetak 1 Label Thermal/i });
    await user.click(printBtn);

    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('menyalin barcode ke clipboard saat tombol salin ditekan', async () => {
    const user = userEvent.setup();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: writeTextMock,
      },
      configurable: true,
    });

    render(<BarcodePrintModal isOpen={true} onClose={vi.fn()} product={mockProduct} />);

    const copyBtn = screen.getByRole('button', { name: /Salin Kode/i });
    await user.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith('2001000000018');
    await waitFor(() => {
      expect(screen.getByText('Tersalin!')).toBeInTheDocument();
    });
  });

  it('memungkinkan pemilihan barcode jika produk memiliki lebih dari satu barcode', async () => {
    const user = userEvent.setup();
    render(<BarcodePrintModal isOpen={true} onClose={vi.fn()} product={mockProduct} />);

    const barcodeSelect = screen.getByLabelText('Barcode yang Dicetak');
    await user.selectOptions(barcodeSelect, '2001000000025');

    expect(screen.getAllByText('2001000000025').length).toBeGreaterThanOrEqual(1);
  });
});
