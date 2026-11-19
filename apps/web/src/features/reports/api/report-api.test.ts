import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import {
  downloadReportExport,
  downloadSalesExport,
  getCashierPerformanceReport,
  getCurrentStockReport,
  getGrossProfitReport,
  getProductPerformance,
  getSalesSummary,
  getSupplierPurchasesReport,
  triggerFileDownload,
} from './report-api';

vi.mock('../../../lib/api/http-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('report-api (M07-002)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('memanggil endpoint sales-summary, product-performance, stock-current & export', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { totalRevenue: '500000.00' } },
    });
    const summary = await getSalesSummary({
      startDate: '2026-11-01T00:00:00+07:00',
      endDate: '2026-11-17T23:59:59.999+07:00',
      groupBy: 'week',
    });
    expect(apiClient.get).toHaveBeenCalledWith('/reports/sales-summary', {
      params: {
        startDate: '2026-11-01T00:00:00+07:00',
        endDate: '2026-11-17T23:59:59.999+07:00',
        groupBy: 'week',
      },
    });
    expect(summary.totalRevenue).toBe('500000.00');

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { items: [], sortBy: 'qty' } },
    });
    await getProductPerformance({ sortBy: 'qty', limit: 20 });
    expect(apiClient.get).toHaveBeenCalledWith('/reports/product-performance', {
      params: { sortBy: 'qty', limit: 20 },
    });

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { totalProducts: 0, items: [] } },
    });
    await getCurrentStockReport({
      categoryId: 'cat-1',
      lowStockOnly: true,
      search: 'Mangga',
    });
    expect(apiClient.get).toHaveBeenCalledWith('/reports/stock-current', {
      params: { categoryId: 'cat-1', lowStockOnly: 'true', search: 'Mangga' },
    });

    const mockBlob = new Blob(['test-pdf'], { type: 'application/pdf' });
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockBlob,
      headers: {
        'content-disposition': 'attachment; filename="laporan-penjualan-2026-11-01-2026-11-17.pdf"',
      },
    });
    const exported = await downloadSalesExport({
      format: 'pdf',
      startDate: '2026-11-01',
      endDate: '2026-11-17',
    });
    expect(exported.filename).toBe('laporan-penjualan-2026-11-01-2026-11-17.pdf');
    expect(exported.blob).toBe(mockBlob);

    // M12-002 / M12-003: Advanced reports & generic export (.xlsx fallback)
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { netGrossProfit: '125000.00' } },
    });
    const gp = await getGrossProfitReport({
      startDate: '2026-11-01',
      endDate: '2026-11-17',
      groupBy: 'day',
    });
    expect(gp.netGrossProfit).toBe('125000.00');

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { totalShifts: 3, cashiers: [], shifts: [] } },
    });
    const cp = await getCashierPerformanceReport({
      startDate: '2026-11-01',
      endDate: '2026-11-17',
    });
    expect(cp.totalShifts).toBe(3);

    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, data: { totalOrders: 2, suppliers: [] } },
    });
    const sp = await getSupplierPurchasesReport({ startDate: '2026-11-01', endDate: '2026-11-17' });
    expect(sp.totalOrders).toBe(2);

    const mockXlsx = new Blob(['xlsx-bytes']);
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: mockXlsx,
      headers: {},
    });
    const exportedXlsx = await downloadReportExport('gross-profit', {
      format: 'excel',
      startDate: '2026-11-01',
      endDate: '2026-11-17',
    });
    expect(exportedXlsx.filename).toBe('laporan-gross-profit.xlsx');
    expect(exportedXlsx.blob).toBe(mockXlsx);
  });

  it('memicu unduhan blob dengan aman melalui object URL', () => {
    const createUrlMock = vi.fn().mockReturnValue('blob:test-url');
    const revokeUrlMock = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createUrlMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeUrlMock,
    });
    const clickMock = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        el.click = clickMock;
      }
      return el;
    });

    triggerFileDownload(new Blob(['csv']), 'laporan.csv');
    expect(createUrlMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(revokeUrlMock).not.toThrow();
  });
});
