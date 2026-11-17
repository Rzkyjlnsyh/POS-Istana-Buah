import type {
  CategoryDto,
  LowStockAlertItemDto,
  ProductDto,
  StockMovementDto,
  StockOpnameDto,
} from '@istana-buah/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as categoryApi from '../../categories/api/category-api';
import * as productApi from '../../products/api/product-api';
import * as stockApi from '../api/stock-api';
import { StockPage } from './stock-page';

vi.mock('../api/stock-api');
vi.mock('../../products/api/product-api');
vi.mock('../../categories/api/category-api');

const mockCategories: CategoryDto[] = [
  {
    id: 'cat-1',
    name: 'Buah Lokal',
    description: null,
    sortOrder: 1,
    isActive: true,
    productCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockProducts: ProductDto[] = [
  {
    id: 'prod-1',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Buah Lokal' },
    name: 'Mangga Harum Manis',
    description: null,
    productType: 'WEIGHT',
    pricePerKg: '28000.00',
    pricePerUnit: null,
    costPerKg: '18000.00',
    costPerUnit: null,
    stockQty: '5.000',
    minStockAlert: '10.000',
    imageUrl: null,
    isActive: true,
    barcodes: [{ id: 'b1', barcode: '2001000000018', isPrimary: true }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'prod-2',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Buah Lokal' },
    name: 'Kelapa Muda',
    description: null,
    productType: 'UNIT',
    pricePerKg: null,
    pricePerUnit: '15000.00',
    costPerKg: null,
    costPerUnit: '9000.00',
    stockQty: '20',
    minStockAlert: '5',
    imageUrl: null,
    isActive: true,
    barcodes: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockAlerts: LowStockAlertItemDto[] = [
  {
    id: 'prod-1',
    name: 'Mangga Harum Manis',
    categoryId: 'cat-1',
    categoryName: 'Buah Lokal',
    productType: 'WEIGHT',
    stockQty: '5.000',
    minStockAlert: '10.000',
    deficit: '5.000',
    isActive: true,
  },
];

const mockOpnames: StockOpnameDto[] = [
  {
    id: 'opn-draft-1',
    referenceNo: 'OPN-20261117-01',
    status: 'DRAFT',
    conductedBy: 'u-mgr',
    conductorName: 'Manajer Operasional',
    notes: 'Opname pagi',
    completedAt: null,
    createdAt: '2026-11-17T02:00:00.000Z',
    updatedAt: '2026-11-17T02:00:00.000Z',
    totalItems: 1,
    adjustedItemsCount: 1,
    items: [
      {
        id: 'opi-1',
        productId: 'prod-1',
        productName: 'Mangga Harum Manis',
        productType: 'WEIGHT',
        systemQty: '5.000',
        physicalQty: '4.800',
        difference: '-0.200',
        notes: 'Susut',
        createdAt: '2026-11-17T02:00:00.000Z',
      },
    ],
  },
];

const mockMovements: StockMovementDto[] = [
  {
    id: 'mov-1',
    productId: 'prod-1',
    productName: 'Mangga Harum Manis',
    productType: 'WEIGHT',
    movementType: 'PURCHASE_IN',
    quantity: '20.000',
    balanceBefore: '5.000',
    balanceAfter: '25.000',
    referenceId: null,
    referenceType: 'MANUAL_RECEIVE',
    notes: 'Penerimaan pagi',
    createdBy: 'u-mgr',
    createdByName: 'Manajer Operasional',
    createdAt: '2026-11-17T03:00:00.000Z',
  },
];

describe('StockPage (M04-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(productApi.getProducts).mockResolvedValue({
      items: mockProducts,
      meta: { page: 1, limit: 100, total: mockProducts.length },
    });
    vi.mocked(categoryApi.getCategories).mockResolvedValue(mockCategories);
    vi.mocked(stockApi.getLowStockAlerts).mockResolvedValue({
      items: mockAlerts,
      meta: { page: 1, limit: 100, total: mockAlerts.length },
    });
    vi.mocked(stockApi.getStockOpnames).mockResolvedValue({
      items: mockOpnames,
      meta: { page: 1, limit: 10, total: mockOpnames.length },
    });
    vi.mocked(stockApi.getStockMovements).mockResolvedValue({
      items: mockMovements,
      meta: { page: 1, limit: 20, total: mockMovements.length },
    });
  });

  it('menampilkan alert stok menipis dan melompat ke penerimaan barang via Terima Stok', async () => {
    const user = userEvent.setup();
    vi.mocked(stockApi.receiveStock).mockResolvedValueOnce({
      purchaseOrderId: null,
      supplierId: null,
      supplierName: null,
      totalItems: 1,
      movements: mockMovements,
    });

    const { container } = render(<StockPage />);

    expect(await screen.findByText(/1 produk stok menipis/i)).toBeInTheDocument();
    expect(screen.getAllByText('Mangga Harum Manis').length).toBeGreaterThanOrEqual(1);

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);

    // Klik cepat Terima Stok pada alert
    const quickBtns = screen.getAllByRole('button', { name: /Terima Stok/i });
    await user.click(quickBtns[0]!);

    // Tab aktif berpindah ke Penerimaan Barang dan Mangga otomatis masuk draf
    const qtyInput = await screen.findByLabelText('Kuantitas masuk Mangga Harum Manis');

    // Validasi qty 0 tidak mengirim request
    await user.clear(qtyInput);
    await user.type(qtyInput, '0');
    await user.click(screen.getByRole('button', { name: /Simpan Penerimaan Stok/i }));
    expect(await screen.findByText(/harus lebih besar dari 0/i)).toBeInTheDocument();
    expect(stockApi.receiveStock).not.toHaveBeenCalled();

    await user.clear(qtyInput);
    await user.type(qtyInput, '20');

    expect(screen.getAllByText(/25,000 kg/).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('button', { name: /Simpan Penerimaan Stok/i }));

    await waitFor(() => {
      expect(stockApi.receiveStock).toHaveBeenCalledWith({
        items: [{ productId: 'prod-1', quantity: 20, unitCost: 18000 }],
        notes: null,
      });
    });

    expect(await screen.findByText(/Penerimaan stok berhasil disimpan/i)).toBeInTheDocument();
  });

  it('mendukung opname stok baru, peringatan konfirmasi selisih > 10%, detail, dan finalisasi draft', async () => {
    const user = userEvent.setup();
    vi.mocked(stockApi.createStockOpname).mockResolvedValueOnce({
      ...mockOpnames[0]!,
      id: 'opn-new',
      referenceNo: 'OPN-20261117-02',
      status: 'COMPLETED',
    });
    vi.mocked(stockApi.finalizeStockOpname).mockResolvedValueOnce({
      ...mockOpnames[0]!,
      status: 'COMPLETED',
    });

    const { container } = render(<StockPage />);
    await screen.findAllByText('Mangga Harum Manis');

    await user.click(screen.getByRole('tab', { name: /Stok Opname/i }));

    // Muat produk dari kategori
    await user.click(screen.getByRole('button', { name: /Muat Produk Kategori/i }));

    const phyInput = await screen.findByLabelText('Stok fisik Mangga Harum Manis');
    await user.clear(phyInput);
    await user.type(phyInput, '3'); // Sistem 5 -> Fisik 3 (selisih 40% > 10%)

    expect(screen.getByText(/Selisih 40%/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Finalisasi Opname/i }));

    // Modal konfirmasi US-STK-002 harus muncul
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Konfirmasi Selisih Stok > 10%/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Ya, Finalisasi Opname/i }));

    await waitFor(() => {
      expect(stockApi.createStockOpname).toHaveBeenCalledWith({
        items: [
          { productId: 'prod-1', physicalQty: 3, notes: null },
          { productId: 'prod-2', physicalQty: 20, notes: null },
        ],
        notes: null,
        finalize: true,
      });
    });

    // Buka modal detail dokumen opname lalu tutup
    await user.click(screen.getByRole('button', { name: /^Detail$/i }));
    const detailDialog = await screen.findByRole('dialog');
    expect(within(detailDialog).getByText(/Detail Opname OPN-20261117-01/i)).toBeInTheDocument();
    await user.click(within(detailDialog).getByRole('button', { name: /Tutup/i }));

    // Finalisasi DRAFT dari daftar riwayat opname (selisih 4% <= 10%, langsung finalisasi)
    await user.click(screen.getByRole('button', { name: /^Finalisasi$/i }));
    await waitFor(() => {
      expect(stockApi.finalizeStockOpname).toHaveBeenCalledWith('opn-draft-1');
    });

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });

  it('menampilkan riwayat mutasi stok dengan filter tipe mutasi & aksesibilitas bersih', async () => {
    const user = userEvent.setup();
    const { container } = render(<StockPage />);

    await user.click(screen.getByRole('tab', { name: /Riwayat Mutasi/i }));

    expect((await screen.findAllByText('Penerimaan pagi')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/\+20,000 kg/).length).toBeGreaterThanOrEqual(1);

    await user.selectOptions(screen.getByLabelText('Tipe Mutasi'), 'PURCHASE_IN');
    await waitFor(() => {
      expect(stockApi.getStockMovements).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'PURCHASE_IN' }),
      );
    });
    expect((await screen.findAllByText('Penerimaan pagi')).length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole('button', { name: 'Hari Ini' }));
    await waitFor(() => {
      expect(stockApi.getStockMovements).toHaveBeenLastCalledWith(
        expect.objectContaining({
          startDate: expect.stringMatching(/T00:00:00/),
          endDate: expect.stringMatching(/T23:59:59\.999/),
        }),
      );
    });
    expect((await screen.findAllByText('Penerimaan pagi')).length).toBeGreaterThanOrEqual(1);

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });
});
