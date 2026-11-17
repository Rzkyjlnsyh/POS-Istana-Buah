import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../../lib/api/http-client';
import {
  downloadSalesExport,
  getCurrentStockReport,
  getProductPerformance,
  getSalesSummary,
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
