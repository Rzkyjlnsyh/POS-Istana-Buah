import type {
  ProductDto,
  PurchaseOrderDto,
  SupplierDetailDto,
  SupplierDto,
} from '@istana-buah/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as productApi from '../../products/api/product-api';
import * as stockApi from '../../stock/api/stock-api';
import * as supplierApi from '../api/supplier-api';
import { SupplierPage } from './supplier-page';

vi.mock('../api/supplier-api');
vi.mock('../../products/api/product-api');
vi.mock('../../stock/api/stock-api');

const mockSuppliers: SupplierDto[] = [
  {
    id: 'sup-1',
    name: 'CV Agro Makmur',
    contactPerson: 'Budi Santoso',
    phoneNumber: '081234567890',
    address: 'Jl. Bandungan No. 12',
    notes: 'Jatuh tempo 7 hari',
    isActive: true,
    purchaseOrderCount: 1,
    totalPurchaseAmount: '360000.00',
    outstandingDebt: '260000.00',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

const mockDetail: SupplierDetailDto = {
  ...mockSuppliers[0]!,
  recentPurchaseOrders: [
    {
      id: 'po-1',
      referenceNo: 'PO-20261117-01',
      status: 'PENDING',
      totalAmount: '360000.00',
      paidAmount: '100000.00',
      remainingDebt: '260000.00',
      deliveredAt: null,
      createdAt: '2026-11-17T01:00:00.000Z',
    },
  ],
};

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
    minStockAlert: '4.000',
    imageUrl: null,
    isActive: true,
    barcodes: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

const mockOrders: PurchaseOrderDto[] = [
  {
    id: 'po-1',
    supplierId: 'sup-1',
    supplierName: 'CV Agro Makmur',
    referenceNo: 'PO-20261117-01',
    totalAmount: '360000.00',
    paidAmount: '100000.00',
    remainingDebt: '260000.00',
    status: 'PENDING',
    notes: 'Order pagi',
    deliveredAt: null,
    createdBy: 'u-mgr',
    createdByName: 'Manajer Toko',
    createdAt: '2026-11-17T01:00:00.000Z',
    updatedAt: '2026-11-17T01:00:00.000Z',
    items: [
      {
        id: 'poi-1',
        productId: 'prod-1',
        productName: 'Mangga Harum Manis',
        productType: 'WEIGHT',
        quantity: '20.000',
        unitCost: '18000.00',
        totalCost: '360000.00',
        createdAt: '2026-11-17T01:00:00.000Z',
      },
    ],
  },
];

describe('SupplierPage (M05-003)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supplierApi.getSuppliers).mockResolvedValue({
      items: mockSuppliers,
      meta: { page: 1, limit: 100, total: mockSuppliers.length },
    });
    vi.mocked(supplierApi.getPurchaseOrders).mockResolvedValue({
      items: mockOrders,
      meta: { page: 1, limit: 50, total: mockOrders.length },
    });
    vi.mocked(productApi.getProducts).mockResolvedValue({
      items: mockProducts,
      meta: { page: 1, limit: 100, total: mockProducts.length },
    });
  });

  it('menampilkan daftar supplier, mendukung tambah supplier, detail, hapus & lolos WCAG AA', async () => {
    const user = userEvent.setup();
    vi.mocked(supplierApi.createSupplier).mockResolvedValueOnce({
      ...mockSuppliers[0]!,
      id: 'sup-2',
      name: 'UD Kebun Hijau',
    });
    vi.mocked(supplierApi.getSupplierById).mockResolvedValueOnce(mockDetail);
    vi.mocked(supplierApi.deleteSupplier).mockResolvedValueOnce(undefined);

    const { container } = render(<SupplierPage />);

    expect((await screen.findAllByText('CV Agro Makmur')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/260\.000/).length).toBeGreaterThanOrEqual(1);

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);

    // Tambah supplier + validasi nama pendek
    await user.click(screen.getByRole('button', { name: /Tambah Supplier/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /^Tambah Supplier$/i }));
    expect(await within(dialog).findByText(/minimal 2 karakter/i)).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Nama Supplier/i), 'UD Kebun Hijau');
    await user.click(within(dialog).getByRole('button', { name: /^Tambah Supplier$/i }));
    await waitFor(() => {
      expect(supplierApi.createSupplier).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'UD Kebun Hijau' }),
      );
    });

    // Detail supplier
    await user.click(screen.getByRole('button', { name: 'Detail CV Agro Makmur' }));
    const detailDialog = await screen.findByRole('dialog');
    expect(await within(detailDialog).findByText('PO-20261117-01')).toBeInTheDocument();
    await user.click(within(detailDialog).getByRole('button', { name: /Tutup/i }));

    // Hapus supplier
    const delBtns = screen.getAllByRole('button', { name: 'Hapus CV Agro Makmur' });
    await user.click(delBtns[0]!);
    const delDialog = await screen.findByRole('dialog');
    await user.click(within(delDialog).getByRole('button', { name: /Ya, Hapus Supplier/i }));
    await waitFor(() => {
      expect(supplierApi.deleteSupplier).toHaveBeenCalledWith('sup-1');
    });
  });

  it('mengelola tab Purchase Order: buat PO baru, bayar hutang, & terima barang ke stok', async () => {
    const user = userEvent.setup();
    vi.mocked(supplierApi.createPurchaseOrder).mockResolvedValueOnce({
      ...mockOrders[0]!,
      id: 'po-new',
      referenceNo: 'PO-20261117-02',
    });
    vi.mocked(supplierApi.payPurchaseOrder).mockResolvedValueOnce({
      ...mockOrders[0]!,
      paidAmount: '360000.00',
      remainingDebt: '0.00',
    });
    vi.mocked(stockApi.receiveStock).mockResolvedValueOnce({
      purchaseOrderId: 'po-1',
      supplierId: 'sup-1',
      supplierName: 'CV Agro Makmur',
      totalItems: 1,
      movements: [],
    });

    const { container } = render(<SupplierPage />);
    await screen.findAllByText('CV Agro Makmur');

    await user.click(screen.getByRole('tab', { name: /Purchase Order/i }));
    expect((await screen.findAllByText('PO-20261117-01')).length).toBeGreaterThanOrEqual(1);

    // 1. Buat Purchase Order
    await user.click(screen.getByRole('button', { name: /Buat Purchase Order/i }));
    const poDialog = await screen.findByRole('dialog');
    await user.click(within(poDialog).getByRole('button', { name: /Mangga Harum Manis/i }));
    await user.click(within(poDialog).getByRole('button', { name: /Simpan Purchase Order/i }));
    await waitFor(() => {
      expect(supplierApi.createPurchaseOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierId: 'sup-1',
          items: [{ productId: 'prod-1', quantity: 10, unitCost: 18000 }],
        }),
      );
    });

    // 2. Bayar hutang PO
    const bayarBtns = screen.getAllByRole('button', { name: /^Bayar$/i });
    await user.click(bayarBtns[0]!);
    const payDialog = await screen.findByRole('dialog');
    await user.click(within(payDialog).getByRole('button', { name: /Catat Pembayaran/i }));
    await waitFor(() => {
      expect(supplierApi.payPurchaseOrder).toHaveBeenCalledWith(
        'po-1',
        expect.objectContaining({ amount: 260000 }),
      );
    });

    // 3. Terima barang dari PO ke Stock Service
    const terimaBtns = screen.getAllByRole('button', { name: /Terima Barang/i });
    await user.click(terimaBtns[0]!);
    const recDialog = await screen.findByRole('dialog');
    await user.click(within(recDialog).getByRole('button', { name: /Konfirmasi Terima Stok/i }));
    await waitFor(() => {
      expect(stockApi.receiveStock).toHaveBeenCalledWith(
        expect.objectContaining({
          purchaseOrderId: 'po-1',
          supplierId: 'sup-1',
        }),
      );
    });

    const axeResults = await axe.run(container);
    expect(axeResults.violations).toEqual([]);
  });
});
