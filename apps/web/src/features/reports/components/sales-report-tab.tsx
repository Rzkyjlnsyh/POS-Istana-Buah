import type {
  ProductPerformanceReportDto,
  ProductPerformanceSortBy,
  ReportGroupBy,
  SalesExportFormat,
  SalesSummaryReportDto,
} from '@istana-buah/shared';
import { Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import {
  formatPaymentMethodShort,
  formatQuantity,
  formatRupiah,
  getStoreDateString,
  shiftYmdDate,
  toStoreDayBounds,
} from '../../pos/utils/formatters';
import {
  downloadSalesExport,
  getProductPerformance,
  getSalesSummary,
  triggerFileDownload,
} from '../api/report-api';
import { SalesTrendChart } from './sales-trend-chart';

type DatePresetKey = 'TODAY' | '7D' | '30D' | 'THIS_MONTH' | 'CUSTOM';

const GROUP_BY_OPTIONS: ReadonlyArray<{ value: ReportGroupBy; label: string }> = [
  { value: 'day', label: 'Harian' },
  { value: 'week', label: 'Mingguan' },
  { value: 'month', label: 'Bulanan' },
];

/**
 * Tab Laporan Penjualan, Margin Profitabilitas, Produk Terlaris & Ekspor (M07-002).
 */
export function SalesReportTab() {
  const startInputId = useId();
  const endInputId = useId();
  const limitSelectId = useId();

  const todayYmd = useMemo(() => getStoreDateString(), []);
  const monthStartYmd = useMemo(() => `${todayYmd.slice(0, 7)}-01`, [todayYmd]);

  const [preset, setPreset] = useState<DatePresetKey>('7D');
  const [startYmd, setStartYmd] = useState<string>(() => shiftYmdDate(todayYmd, -6));
  const [endYmd, setEndYmd] = useState<string>(todayYmd);
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('day');
  const [sortBy, setSortBy] = useState<ProductPerformanceSortBy>('revenue');
  const [topLimit, setTopLimit] = useState<number>(10);

  const [summary, setSummary] = useState<SalesSummaryReportDto | null>(null);
  const [performance, setPerformance] = useState<ProductPerformanceReportDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [exportingFormat, setExportingFormat] = useState<SalesExportFormat | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const applyPreset = (nextPreset: Exclude<DatePresetKey, 'CUSTOM'>) => {
    setPreset(nextPreset);
    setEndYmd(todayYmd);
    if (nextPreset === 'TODAY') {
      setStartYmd(todayYmd);
    } else if (nextPreset === '7D') {
      setStartYmd(shiftYmdDate(todayYmd, -6));
    } else if (nextPreset === '30D') {
      setStartYmd(shiftYmdDate(todayYmd, -29));
    } else {
      setStartYmd(monthStartYmd);
    }
  };

  const loadSalesData = useCallback(async () => {
    if (startYmd > endYmd) {
      setErrorMessage('Tanggal mulai tidak boleh melebihi tanggal akhir laporan.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const bounds = toStoreDayBounds(startYmd, endYmd);
      const [summaryRes, perfRes] = await Promise.all([
        getSalesSummary({ ...bounds, groupBy }),
        getProductPerformance({ ...bounds, sortBy, limit: topLimit }),
      ]);
      setSummary(summaryRes);
      setPerformance(perfRes);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [startYmd, endYmd, groupBy, sortBy, topLimit]);

  useEffect(() => {
    void loadSalesData();
  }, [loadSalesData]);

  const handleExport = async (format: SalesExportFormat) => {
    setExportingFormat(format);
    setErrorMessage(null);
    try {
      const bounds = toStoreDayBounds(startYmd, endYmd);
      const result = await downloadSalesExport({ format, ...bounds });
      triggerFileDownload(result.blob, result.filename);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setExportingFormat(null);
    }
  };

  const totalRevenueNum = Number(summary?.totalRevenue ?? 0);

  return (
    <div className="space-y-5">
      {/* Kontrol Periode, Pengelompokan & Ekspor */}
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { key: 'TODAY', label: 'Hari Ini' },
                  { key: '7D', label: '7 Hari' },
                  { key: '30D', label: '30 Hari' },
                  { key: 'THIS_MONTH', label: 'Bulan Ini' },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => applyPreset(item.key)}
                  aria-pressed={preset === item.key}
                  className={cn(
                    'min-h-10 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors',
                    preset === item.key
                      ? 'border-primary-700 bg-primary-700 text-white'
                      : 'border-border-subtle bg-surface-subtle text-ink-secondary hover:bg-primary-50 hover:text-ink-primary',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label
                  htmlFor={startInputId}
                  className="mb-1 block text-xs font-semibold text-ink-secondary"
                >
                  Dari Tanggal
                </label>
                <input
                  id={startInputId}
                  type="date"
                  value={startYmd}
                  max={endYmd}
                  onChange={(e) => {
                    setPreset('CUSTOM');
                    setStartYmd(e.target.value);
                  }}
                  className="min-h-11 rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary tabular-nums focus:border-primary-700 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor={endInputId}
                  className="mb-1 block text-xs font-semibold text-ink-secondary"
                >
                  Sampai Tanggal
                </label>
                <input
                  id={endInputId}
                  type="date"
                  value={endYmd}
                  min={startYmd}
                  onChange={(e) => {
                    setPreset('CUSTOM');
                    setEndYmd(e.target.value);
                  }}
                  className="min-h-11 rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary tabular-nums focus:border-primary-700 focus:outline-none"
                />
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-ink-secondary">
                  Agregasi Grafik
                </span>
                <div className="inline-flex rounded-xl border border-border-subtle bg-surface-subtle p-1">
                  {GROUP_BY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGroupBy(opt.value)}
                      aria-pressed={groupBy === opt.value}
                      className={cn(
                        'min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors',
                        groupBy === opt.value
                          ? 'bg-primary-700 text-white'
                          : 'text-ink-secondary hover:text-ink-primary',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadSalesData()}
              disabled={isLoading}
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
                aria-hidden="true"
              />
              <span>Muat Ulang</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleExport('pdf')}
              disabled={exportingFormat !== null || isLoading}
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              <span>{exportingFormat === 'pdf' ? 'Mengunduh...' : 'Ekspor PDF'}</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleExport('excel')}
              disabled={exportingFormat !== null || isLoading}
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              <span>{exportingFormat === 'excel' ? 'Mengunduh...' : 'Ekspor Excel'}</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleExport('csv')}
              disabled={exportingFormat !== null || isLoading}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>{exportingFormat === 'csv' ? 'Mengunduh...' : 'Ekspor CSV'}</span>
            </Button>
          </div>
        </div>
      </section>

      {errorMessage ? (
        <Alert variant="danger" title="Gagal memuat laporan penjualan">
          {errorMessage}
        </Alert>
      ) : null}

      {/* Ringkasan KPI Penjualan dalam Satu Strip Terukur */}
      <section aria-label="Ringkasan metrik penjualan">
        <div className="grid divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-panel sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Total Penjualan</p>
            <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
              {formatRupiah(Number(summary?.totalRevenue ?? 0))}
            </p>
            <p className="mt-1 text-xs text-ink-secondary tabular-nums">
              {summary?.totalTransactions ?? 0} transaksi selesai ·{' '}
              {summary?.voidedTransactions ?? 0} batal
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Laba Kotor</p>
            <p className="mt-1.5 text-xl font-bold text-primary-700 tabular-nums sm:text-2xl">
              {formatRupiah(Number(summary?.grossProfit ?? 0))}
            </p>
            <p className="mt-1 text-xs text-ink-secondary tabular-nums">
              Margin kotor {summary?.profitMargin ?? '0.00'}%
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Total HPP (Modal)</p>
            <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
              {formatRupiah(Number(summary?.totalCostOfGoodsSold ?? 0))}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Harga pokok buah terjual</p>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Rata-rata Per Struk</p>
            <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
              {formatRupiah(Number(summary?.avgTransactionValue ?? 0))}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Nilai belanja rata-rata</p>
          </div>
        </div>
      </section>

      {/* Grafik Tren & Rincian Metode Bayar */}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-ink-primary">Tren Penjualan & Laba Kotor</h2>
          </div>

          {isLoading ? (
            <p className="py-12 text-center text-sm text-ink-muted">
              Memuat grafik laporan penjualan...
            </p>
          ) : (
            <SalesTrendChart timeline={summary?.timeline ?? []} groupBy={groupBy} />
          )}
        </section>

        <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
          <h2 className="mb-4 text-base font-bold text-ink-primary">Komposisi Metode Bayar</h2>

          {!summary || summary.paymentBreakdown.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              Belum ada pembayaran pada periode ini.
            </p>
          ) : (
            <div className="space-y-4">
              {summary.paymentBreakdown.map((item) => {
                const amount = Number(item.revenue);
                const share =
                  totalRevenueNum > 0 ? Math.round((amount / totalRevenueNum) * 100) : 0;
                return (
                  <div key={item.paymentMethod} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold text-ink-primary">
                        {formatPaymentMethodShort(item.paymentMethod)}
                      </span>
                      <span className="font-bold text-ink-primary tabular-nums">
                        {formatRupiah(amount)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                      <div
                        className="h-full rounded-full bg-primary-600 transition-all"
                        style={{ width: `${Math.min(100, Math.max(4, share))}%` }}
                      />
                    </div>
                    <p className="flex justify-between text-xs text-ink-muted tabular-nums">
                      <span>{item.transactions} transaksi</span>
                      <span>{share}% dari omzet</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Peringkat Produk Terlaris */}
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-ink-primary">Performa Produk Terlaris</h2>
            <p className="text-xs text-ink-muted">
              Kontribusi penjualan, HPP, dan margin per item pada periode terpilih.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-border-subtle bg-surface-subtle p-1">
              <button
                type="button"
                onClick={() => setSortBy('revenue')}
                aria-pressed={sortBy === 'revenue'}
                className={cn(
                  'min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors',
                  sortBy === 'revenue'
                    ? 'bg-primary-700 text-white'
                    : 'text-ink-secondary hover:text-ink-primary',
                )}
              >
                Omzet Tertinggi
              </button>
              <button
                type="button"
                onClick={() => setSortBy('qty')}
                aria-pressed={sortBy === 'qty'}
                className={cn(
                  'min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors',
                  sortBy === 'qty'
                    ? 'bg-primary-700 text-white'
                    : 'text-ink-secondary hover:text-ink-primary',
                )}
              >
                Kuantitas Terjual
              </button>
            </div>

            <label htmlFor={limitSelectId} className="sr-only">
              Jumlah produk ditampilkan
            </label>
            <select
              id={limitSelectId}
              value={topLimit}
              onChange={(e) => setTopLimit(Number(e.target.value))}
              className="min-h-10 rounded-xl border border-border-strong bg-surface-panel px-3 py-1.5 text-xs font-semibold text-ink-primary"
            >
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
          </div>
        </div>

        {!performance || performance.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">
            Belum ada data penjualan produk pada periode ini.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs font-semibold text-ink-secondary">
                    <th className="py-2.5 pr-3">#</th>
                    <th className="py-2.5 pr-4">Produk</th>
                    <th className="py-2.5 pr-4">Kategori</th>
                    <th className="py-2.5 pr-4 text-right">Terjual</th>
                    <th className="py-2.5 pr-4 text-right">Omzet</th>
                    <th className="py-2.5 pr-4 text-right">HPP</th>
                    <th className="py-2.5 pr-4 text-right">Laba Kotor</th>
                    <th className="py-2.5 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {performance.items.map((item, idx) => (
                    <tr key={item.productId} className="hover:bg-surface-subtle/60">
                      <td className="py-3 pr-3 font-medium text-ink-muted tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-ink-primary">{item.productName}</p>
                        <p className="text-xs text-ink-muted tabular-nums">
                          {item.transactionCount} transaksi
                        </p>
                      </td>
                      <td className="py-3 pr-4 text-ink-secondary">{item.categoryName}</td>
                      <td className="py-3 pr-4 text-right font-semibold text-ink-primary tabular-nums">
                        {formatQuantity(Number(item.totalQuantity), item.productType)}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-ink-primary tabular-nums">
                        {formatRupiah(Number(item.totalRevenue))}
                      </td>
                      <td className="py-3 pr-4 text-right text-ink-secondary tabular-nums">
                        {formatRupiah(Number(item.totalCost))}
                      </td>
                      <td className="py-3 pr-4 text-right font-semibold text-primary-700 tabular-nums">
                        {formatRupiah(Number(item.grossProfit))}
                      </td>
                      <td className="py-3 text-right font-semibold text-ink-primary tabular-nums">
                        {item.profitMargin}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border-subtle md:hidden">
              {performance.items.map((item, idx) => (
                <div key={item.productId} className="space-y-1.5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink-primary">
                        {idx + 1}. {item.productName}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {item.categoryName} · {item.transactionCount} transaksi
                      </p>
                    </div>
                    <span className="text-sm font-bold text-ink-primary tabular-nums">
                      {formatRupiah(Number(item.totalRevenue))}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary tabular-nums">
                    <span>
                      Terjual: {formatQuantity(Number(item.totalQuantity), item.productType)}
                    </span>
                    <span className="font-semibold text-primary-700">
                      Laba {formatRupiah(Number(item.grossProfit))} ({item.profitMargin}%)
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
