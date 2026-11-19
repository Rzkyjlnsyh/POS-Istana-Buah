import type { ProductDto, WasteRecordDto, WasteSummaryReportDto } from '@istana-buah/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as productApi from '../../products/api/product-api';
import * as wasteApi from '../api/waste-api';
import { WastePage } from './waste-page';

vi.mock('../api/waste-api');
vi.mock('../../products/api/product-api');

const productsFixture: ProductDto[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Buah Lokal' },
    name: 'Mangga Harum Manis',
    description: null,
    productType: 'WEIGHT',
    pricePerKg: '38000.00',
    pricePerUnit: null,
    costPerKg: '22000.00',
    costPerUnit: null,
    stockQty: '15',
    minStockAlert: '5',
    imageUrl: null,
    isActive: true,
    barcodes: [{ id: 'bc-1', barcode: '2001000000011', isPrimary: true }],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

const recordFixture: WasteRecordDto = {
  id: 'w-1',
  productId: productsFixture[0]!.id,
  productName: 'Mangga Harum Manis',
  productType: 'WEIGHT',
  categoryName: 'Buah Lokal',
  wasteType: 'ROTTEN',
  quantity: '2',
  unitCost: '22000.00',
  estimatedCost: '44000.00',
  reason: 'Buah terlalu matang di display',
  photoUrl: 'https://cdn.istanabuah.id/waste/w1.jpg',
  recordedBy: 'u-mgr',
  recorderName: 'Siti Manajer',
  recordedAt: '2026-11-19T03:00:00.000Z',
  createdAt: '2026-11-19T03:00:00.000Z',
};

const summaryFixture: WasteSummaryReportDto = {
  startDate: '2026-10-21T00:00:00.000Z',
  endDate: '2026-11-19T23:59:59.999Z',
  groupBy: 'day',
  totalRecords: 3,
  totalQuantity: '5.5',
  totalEstimatedCost: '121000.00',
  byType: [
    {
      wasteType: 'ROTTEN',
      count: 2,
      totalQuantity: '4',
      totalEstimatedCost: '88000.00',
    },
  ],
  topProducts: [
    {
      productId: productsFixture[0]!.id,
      productName: 'Mangga Harum Manis',
      productType: 'WEIGHT',
      categoryName: 'Buah Lokal',
      count: 3,
      totalQuantity: '5.5',
      totalEstimatedCost: '121000.00',
    },
  ],
  timeline: [
    {
      date: '2026-11-19',
      count: 3,
      totalQuantity: '5.5',
      totalEstimatedCost: '121000.00',
    },
  ],
};

describe('WastePage (M09-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(productApi.getProducts).mockResolvedValue({
      items: productsFixture,
      meta: { page: 1, limit: 100, total: 1 },
    });
    vi.mocked(wasteApi.getWasteRecords).mockResolvedValue({
      items: [recordFixture],
      meta: { page: 1, limit: 20, total: 1 },
    });
    vi.mocked(wasteApi.createWasteRecord).mockResolvedValue(recordFixture);
    vi.mocked(wasteApi.getWasteSummary).mockResolvedValue(summaryFixture);
  });

  it('menampilkan daftar penyusutan, mencatat penyusutan baru lewat modal & lulus axe-core', async () => {
    const user = userEvent.setup();
    const { container } = render(<WastePage />);

    expect(await screen.findAllByText('Buah terlalu matang di display')).toHaveLength(2);
    expect(screen.getAllByText('Rp 44.000').length).toBeGreaterThanOrEqual(1);

    const axeList = await axe.run(container);
    expect(axeList.violations).toEqual([]);

    // Buka modal Catat Penyusutan
    await user.click(screen.getByRole('button', { name: /Catat Penyusutan/i }));
    const dialog = await screen.findByRole('dialog');

    // Submit tanpa memilih produk ditolak
    await user.click(within(dialog).getByRole('button', { name: /Simpan Catatan Susut/i }));
    expect(
      await within(dialog).findByText(/Pilih produk buah yang mengalami penyusutan/i),
    ).toBeInTheDocument();

    // Pilih produk dari StockProductPicker
    await user.click(within(dialog).getByRole('button', { name: /Mangga Harum Manis/i }));

    // Isi melebihi stok 15kg -> error validasi
    const qtyInput = within(dialog).getByLabelText(/Jumlah Susut/i);
    await user.type(qtyInput, '20');
    await user.type(
      within(dialog).getByLabelText(/Alasan \/ Kronologi/i),
      'Tertekan keranjang pengiriman',
    );
    await user.click(within(dialog).getByRole('button', { name: /Simpan Catatan Susut/i }));
    expect(await within(dialog).findByText(/hanya tersisa/i)).toBeInTheDocument();

    // Isi kuantitas valid 2kg -> lihat estimasi rugi HPP & submit
    await user.clear(qtyInput);
    await user.type(qtyInput, '2');
    expect(within(dialog).getByText('Rp 44.000')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Simpan Catatan Susut/i }));
    await waitFor(() => {
      expect(wasteApi.createWasteRecord).toHaveBeenCalledWith({
        productId: productsFixture[0]!.id,
        wasteType: 'ROTTEN',
        quantity: 2,
        reason: 'Tertekan keranjang pengiriman',
      });
    });

    expect(await screen.findByText(/dicatat dengan estimasi kerugian/i)).toBeInTheDocument();
  });

  it('beralih ke tab Laporan Kerugian, mengubah ke Bulanan & lulus axe-core', async () => {
    const user = userEvent.setup();
    const { container } = render(<WastePage />);

    expect(await screen.findAllByText('Buah terlalu matang di display')).toHaveLength(2);

    await user.click(screen.getByRole('tab', { name: /Laporan Kerugian/i }));
    const panel = await screen.findByRole('tabpanel');

    const kpiSection = await within(panel).findByRole('region', {
      name: /Ringkasan kerugian penyusutan/i,
    });
    expect(await within(kpiSection).findByText('Rp 121.000')).toBeInTheDocument();
    expect(within(kpiSection).getByText('3 Catatan')).toBeInTheDocument();

    const axeSummary = await axe.run(container);
    expect(axeSummary.violations).toEqual([]);

    await user.click(within(panel).getByRole('button', { name: 'Bulanan' }));
    await waitFor(() => {
      expect(wasteApi.getWasteSummary).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: 'month' }),
      );
    });
  });

  it('menyaring daftar menurut jenis penyusutan & menangani galat API', async () => {
    const user = userEvent.setup();
    render(<WastePage />);
    expect(await screen.findAllByText('Buah terlalu matang di display')).toHaveLength(2);

    await user.selectOptions(screen.getByLabelText(/Jenis Penyusutan/i), 'SHRINKAGE');
    await waitFor(() => {
      expect(wasteApi.getWasteRecords).toHaveBeenCalledWith(
        expect.objectContaining({ wasteType: 'SHRINKAGE' }),
      );
    });

    vi.mocked(wasteApi.getWasteRecords).mockRejectedValueOnce(new Error('Network down'));
    await user.click(screen.getByRole('button', { name: /Segarkan/i }));
    expect(await screen.findByText(/Gagal memuat daftar penyusutan/i)).toBeInTheDocument();
  });
});
