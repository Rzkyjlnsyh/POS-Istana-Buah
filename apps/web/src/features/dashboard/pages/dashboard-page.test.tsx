import type { DashboardChartsDto, DashboardSummaryDto } from '@istana-buah/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dashboardApi from '../api/dashboard-api';
import { DashboardPage } from './dashboard-page';

vi.mock('../api/dashboard-api');

const summaryFixture: DashboardSummaryDto = {
  generatedAt: '2026-11-19T10:00:00.000Z',
  todayDate: '2026-11-19',
  yesterdayDate: '2026-11-18',
  today: {
    revenue: '450000.00',
    transactions: 6,
    voidedTransactions: 1,
    avgTransactionValue: '75000.00',
    costOfGoodsSold: '270000.00',
    grossProfit: '180000.00',
    profitMargin: '40.00',
  },
  yesterday: {
    revenue: '300000.00',
    transactions: 4,
    voidedTransactions: 0,
    avgTransactionValue: '75000.00',
    costOfGoodsSold: '180000.00',
    grossProfit: '120000.00',
    profitMargin: '40.00',
  },
  comparison: {
    revenueChangeAmount: '150000.00',
    revenueChangePercent: '50.00',
    transactionsChangeCount: 2,
    transactionsChangePercent: '50.00',
  },
  openShifts: {
    count: 1,
    items: [
      {
        id: 'sh-1',
        shiftNo: 'SHIFT-20261119-001',
        cashierName: 'Kasir Pagi',
        openedAt: '2026-11-19T01:00:00.000Z',
        totalSales: '450000.00',
        totalTransactions: 6,
      },
    ],
  },
  lowStock: {
    totalCount: 2,
    outOfStockCount: 1,
    items: [
      {
        id: 'p-1',
        name: 'Apel Fuji',
        categoryId: 'cat-2',
        categoryName: 'Buah Impor',
        productType: 'UNIT',
        stockQty: '0',
        minStockAlert: '10',
        deficit: '10',
        isActive: true,
      },
      {
        id: 'p-2',
        name: 'Jeruk Medan',
        categoryId: 'cat-1',
        categoryName: 'Buah Lokal',
        productType: 'WEIGHT',
        stockQty: '3.5',
        minStockAlert: '10',
        deficit: '6.5',
        isActive: true,
      },
    ],
  },
  topProductsToday: [
    {
      productId: 'p-3',
      productName: 'Mangga Harum Manis',
      productType: 'WEIGHT',
      categoryName: 'Buah Lokal',
      totalQuantity: '10',
      totalRevenue: '350000.00',
      totalCost: '210000.00',
      grossProfit: '140000.00',
      profitMargin: '40.00',
      transactionCount: 4,
    },
  ],
  unpaidPurchaseOrders: {
    count: 2,
    totalOutstandingDebt: '750000.00',
  },
  todayWaste: {
    count: 1,
    totalEstimatedCost: '25000.00',
  },
};

const chartsFixture: DashboardChartsDto = {
  days: 7,
  startDate: '2026-11-13',
  endDate: '2026-11-19',
  totalRevenue: '2100000.00',
  totalGrossProfit: '840000.00',
  totalTransactions: 28,
  timeline: [
    {
      date: '2026-11-18',
      revenue: '300000.00',
      costOfGoodsSold: '180000.00',
      grossProfit: '120000.00',
      transactions: 4,
    },
    {
      date: '2026-11-19',
      revenue: '450000.00',
      costOfGoodsSold: '270000.00',
      grossProfit: '180000.00',
      transactions: 6,
    },
  ],
  paymentBreakdown: [{ paymentMethod: 'CASH', revenue: '1400000.00', transactions: 18 }],
  categoryBreakdown: [
    { categoryId: 'cat-1', categoryName: 'Buah Lokal', revenue: '1500000.00', percentage: '71.43' },
    { categoryId: 'cat-2', categoryName: 'Buah Impor', revenue: '600000.00', percentage: '28.57' },
  ],
};

describe('DashboardPage (M08-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValue(summaryFixture);
    vi.mocked(dashboardApi.getDashboardCharts).mockResolvedValue(chartsFixture);
  });

  it('menampilkan KPI real-time, grafik 7/30 hari, produk terlaris, alert stok merah, shift aktif & lulus axe-core', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    const kpiSection = await screen.findByRole('region', { name: /Ringkasan KPI hari ini/i });
    expect(within(kpiSection).getByText('Rp 450.000')).toBeInTheDocument();
    expect(within(kpiSection).getByText('+50.0% vs kemarin')).toBeInTheDocument();
    expect(within(kpiSection).getByText('Rp 180.000')).toBeInTheDocument();
    expect(within(kpiSection).getByText('6 Struk')).toBeInTheDocument();
    expect(within(kpiSection).getByText('2 SKU Menipis')).toBeInTheDocument();

    expect(screen.getByRole('img', { name: /Grafik perbandingan omzet/i })).toBeInTheDocument();
    expect(screen.getByText(/1\. Mangga Harum Manis/i)).toBeInTheDocument();
    expect(screen.getByText('Apel Fuji')).toBeInTheDocument();
    expect(screen.getByText('Habis')).toBeInTheDocument();
    expect(screen.getByText('Kasir Pagi')).toBeInTheDocument();
    expect(screen.getByText('Rp 750.000')).toBeInTheDocument();
    expect(screen.getByText('Buah Lokal')).toBeInTheDocument();

    const axeRes = await axe.run(container);
    expect(axeRes.violations).toEqual([]);

    // Pindah jendela grafik ke 30 Hari
    await user.click(screen.getByRole('button', { name: '30 Hari' }));
    await waitFor(() => {
      expect(dashboardApi.getDashboardCharts).toHaveBeenCalledWith({ days: 30 });
    });

    // Klik Segarkan Dashboard memicu fetch ulang
    await user.click(screen.getByRole('button', { name: /Segarkan Dashboard/i }));
    await waitFor(() => {
      expect(dashboardApi.getDashboardSummary).toHaveBeenCalledTimes(3);
    });
  });

  it('menangani perbandingan negatif, data kosong & error API dengan aman', async () => {
    vi.mocked(dashboardApi.getDashboardSummary).mockResolvedValueOnce({
      ...summaryFixture,
      comparison: {
        revenueChangeAmount: '-50000.00',
        revenueChangePercent: '-25.00',
        transactionsChangeCount: -1,
        transactionsChangePercent: '-25.00',
      },
      lowStock: { totalCount: 0, outOfStockCount: 0, items: [] },
      topProductsToday: [],
      openShifts: { count: 0, items: [] },
    });
    vi.mocked(dashboardApi.getDashboardCharts).mockResolvedValueOnce({
      ...chartsFixture,
      timeline: [],
      categoryBreakdown: [],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('-25.0% vs kemarin')).toBeInTheDocument();
    expect(screen.getByText(/Semua stok produk aman/i)).toBeInTheDocument();
    expect(screen.getByText(/Belum ada penjualan produk hari ini/i)).toBeInTheDocument();

    vi.mocked(dashboardApi.getDashboardSummary).mockRejectedValueOnce(new Error('Server timeout'));
    await userEvent.click(screen.getByRole('button', { name: /Segarkan Dashboard/i }));
    expect(await screen.findByText(/Gagal memuat ringkasan dashboard/i)).toBeInTheDocument();
  });
});
