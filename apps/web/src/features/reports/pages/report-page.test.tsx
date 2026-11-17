import type {
  CategoryDto,
  CurrentStockReportDto,
  ProductPerformanceReportDto,
  SalesSummaryReportDto,
} from '@istana-buah/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as categoryApi from '../../categories/api/category-api';
import * as reportApi from '../api/report-api';
import { ReportPage } from './report-page';

vi.mock('../api/report-api');
vi.mock('../../categories/api/category-api');

const summaryFixture: SalesSummaryReportDto = {
  startDate: '2026-11-11T00:00:00.000Z',
  endDate: '2026-11-17T23:59:59.999Z',
  groupBy: 'day',
  totalRevenue: '450000.00',
  totalTransactions: 5,
  voidedTransactions: 1,
  avgTransactionValue: '90000.00',
  totalCostOfGoodsSold: '270000.00',
  grossProfit: '180000.00',
  profitMargin: '40.00',
  paymentBreakdown: [
    { paymentMethod: 'CASH', revenue: '300000.00', transactions: 3 },
    { paymentMethod: 'QRIS', revenue: '150000.00', transactions: 2 },
  ],
  timeline: [
    {
      date: '2026-11-16',
      revenue: '200000.00',
      costOfGoodsSold: '120000.00',
      grossProfit: '80000.00',
      transactions: 2,
    },
    {
      date: '2026-11-17',
      revenue: '250000.00',
      costOfGoodsSold: '150000.00',
      grossProfit: '100000.00',
      transactions: 3,
    },
  ],
};

const perfFixture: ProductPerformanceReportDto = {
  startDate: '2026-11-11T00:00:00.000Z',
  endDate: '2026-11-17T23:59:59.999Z',
  sortBy: 'revenue',
  items: [
    {
      productId: 'prod-1',
      productName: 'Mangga Harum Manis',
      productType: 'WEIGHT',
      categoryName: 'Buah Lokal',
      totalQuantity: '7.5',
      totalRevenue: '300000.00',
      totalCost: '180000.00',
      grossProfit: '120000.00',
      profitMargin: '40.00',
      transactionCount: 3,
    },
    {
      productId: 'prod-2',
      productName: 'Apel Fuji',
      productType: 'UNIT',
      categoryName: 'Buah Impor',
      totalQuantity: '10',
      totalRevenue: '150000.00',
      totalCost: '90000.00',
      grossProfit: '60000.00',
      profitMargin: '40.00',
      transactionCount: 2,
    },
  ],
};

const stockFixture: CurrentStockReportDto = {
  generatedAt: '2026-11-17T10:00:00.000Z',
  totalProducts: 2,
  lowStockCount: 1,
  outOfStockCount: 1,
  totalStockCostValue: '500000.00',
  totalStockRetailValue: '850000.00',
  items: [
    {
      id: 'prod-1',
      name: 'Mangga Harum Manis',
      categoryId: 'cat-1',
      categoryName: 'Buah Lokal',
      productType: 'WEIGHT',
      stockQty: '25',
      minStockAlert: '10',
      unitCost: '20000.00',
      unitPrice: '34000.00',
      stockCostValue: '500000.00',
      stockRetailValue: '850000.00',
      isLowStock: false,
      isOutOfStock: false,
      isActive: true,
    },
    {
      id: 'prod-2',
      name: 'Apel Fuji',
      categoryId: 'cat-2',
      categoryName: 'Buah Impor',
      productType: 'UNIT',
      stockQty: '0',
      minStockAlert: '5',
      unitCost: '9000.00',
      unitPrice: '15000.00',
      stockCostValue: '0.00',
      stockRetailValue: '0.00',
      isLowStock: true,
      isOutOfStock: true,
      isActive: true,
    },
  ],
};

const categoriesFixture: CategoryDto[] = [
  {
    id: 'cat-1',
    name: 'Buah Lokal',
    description: null,
    sortOrder: 0,
    isActive: true,
    productCount: 4,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
];

describe('ReportPage (M07-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(reportApi.getSalesSummary).mockResolvedValue(summaryFixture);
    vi.mocked(reportApi.getProductPerformance).mockResolvedValue(perfFixture);
    vi.mocked(reportApi.getCurrentStockReport).mockResolvedValue(stockFixture);
    vi.mocked(reportApi.downloadSalesExport).mockResolvedValue({
      blob: new Blob(['ok']),
      filename: 'laporan-penjualan.pdf',
    });
    vi.mocked(reportApi.triggerFileDownload).mockImplementation(() => {});
    vi.mocked(categoryApi.getCategories).mockResolvedValue(categoriesFixture);
  });

  it('menampilkan KPI penjualan, grafik interaktif, produk terlaris, ekspor PDF/Excel/CSV & lulus axe-core', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReportPage />);

    expect(await screen.findByText('Rp 450.000')).toBeInTheDocument();
    const salesKpiSection = screen.getByRole('region', { name: /Ringkasan metrik penjualan/i });
    expect(within(salesKpiSection).getByText('Rp 180.000')).toBeInTheDocument();
    expect(within(salesKpiSection).getByText(/Margin kotor 40\.00%/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Grafik perbandingan omzet/i })).toBeInTheDocument();
    expect(screen.getAllByText('Mangga Harum Manis').length).toBeGreaterThanOrEqual(1);

    const axeSales = await axe.run(container);
    expect(axeSales.violations).toEqual([]);

    // Klik titik grafik 16/11 mengubah pembacaan aktif
    await user.click(screen.getByRole('button', { name: '16/11' }));
    expect(screen.getByText(/2026-11-16:/)).toBeInTheDocument();

    // Ubah grouping ke Mingguan & urutan produk ke Kuantitas Terjual
    await user.click(screen.getByRole('button', { name: 'Mingguan' }));
    await user.click(screen.getByRole('button', { name: 'Kuantitas Terjual' }));
    await waitFor(() => {
      expect(reportApi.getSalesSummary).toHaveBeenCalledWith(
        expect.objectContaining({ groupBy: 'week' }),
      );
      expect(reportApi.getProductPerformance).toHaveBeenCalledWith(
        expect.objectContaining({ sortBy: 'qty' }),
      );
    });

    // Uji ekspor PDF, Excel, dan CSV
    await user.click(screen.getByRole('button', { name: /Ekspor PDF/i }));
    await waitFor(() => {
      expect(reportApi.downloadSalesExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'pdf' }),
      );
      expect(reportApi.triggerFileDownload).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: /Ekspor Excel/i }));
    await waitFor(() => {
      expect(reportApi.downloadSalesExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'excel' }),
      );
    });

    await user.click(screen.getByRole('button', { name: /Ekspor CSV/i }));
    await waitFor(() => {
      expect(reportApi.downloadSalesExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'csv' }),
      );
    });
  });

  it('beralih ke tab Valuasi Stok, menyaring stok menipis/kategori & lulus axe-core', async () => {
    const user = userEvent.setup();
    const { container } = render(<ReportPage />);

    expect(await screen.findByText('Rp 450.000')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Valuasi Stok/i }));
    const panel = await screen.findByRole('tabpanel');

    const stockKpiSection = await within(panel).findByRole('region', {
      name: /Ringkasan valuasi inventori/i,
    });
    expect(await within(stockKpiSection).findByText('Rp 500.000')).toBeInTheDocument();
    expect(within(stockKpiSection).getByText('Rp 850.000')).toBeInTheDocument();
    expect(within(stockKpiSection).getByText('1 Menipis')).toBeInTheDocument();

    const axeStock = await axe.run(container);
    expect(axeStock.violations).toEqual([]);

    await user.click(within(panel).getByLabelText(/Hanya Stok Menipis \/ Habis/i));
    await user.selectOptions(within(panel).getByLabelText(/Kategori/i), 'cat-1');

    await waitFor(() => {
      expect(reportApi.getCurrentStockReport).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: 'cat-1',
          lowStockOnly: true,
        }),
      );
    });
  });

  it('menampilkan alert gagal secara aman ketika API mengembalikan galat', async () => {
    vi.mocked(reportApi.getSalesSummary).mockRejectedValueOnce(new Error('Koneksi terputus'));
    render(<ReportPage />);
    expect(await screen.findByText(/Gagal memuat laporan penjualan/i)).toBeInTheDocument();
  });
});
