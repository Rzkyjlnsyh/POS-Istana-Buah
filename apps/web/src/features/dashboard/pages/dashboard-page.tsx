import type { DashboardChartsDto, DashboardSummaryDto } from '@istana-buah/shared';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { formatRupiah } from '../../pos/utils/formatters';
import { SalesTrendChart } from '../../reports/components/sales-trend-chart';
import { getDashboardCharts, getDashboardSummary } from '../api/dashboard-api';
import { DashboardKpiStrip } from '../components/dashboard-kpi-strip';
import { DashboardOperationalPanels } from '../components/dashboard-operational-panels';

type ChartWindowDays = 7 | 14 | 30;

const CHART_DAY_OPTIONS: ReadonlyArray<{ days: ChartWindowDays; label: string }> = [
  { days: 7, label: '7 Hari' },
  { days: 14, label: '14 Hari' },
  { days: 30, label: '30 Hari' },
];

/**
 * Halaman Dashboard Owner & Manajer (M08-002).
 * Menampilkan KPI real-time, grafik penjualan 7/14/30 hari, produk terlaris hari ini,
 * alert stok menipis, serta ringkasan shift aktif secara responsif (375px–1440px).
 */
export function DashboardPage() {
  const [chartDays, setChartDays] = useState<ChartWindowDays>(7);
  const [summary, setSummary] = useState<DashboardSummaryDto | null>(null);
  const [charts, setCharts] = useState<DashboardChartsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [summaryRes, chartsRes] = await Promise.all([
        getDashboardSummary({ topLimit: 5, lowStockLimit: 5 }),
        getDashboardCharts({ days: chartDays }),
      ]);
      setSummary(summaryRes);
      setCharts(chartsRes);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [chartDays]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">
            Ringkasan Operasional Toko
          </h1>
          <p className="mt-1 text-sm text-ink-secondary tabular-nums">
            {summary
              ? `Pemantauan langsung tanggal ${summary.todayDate} dibandingkan ${summary.yesterdayDate}.`
              : 'Pantau omzet real-time, performa produk, shift aktif, dan peringatan stok.'}
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => void loadDashboard()}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
          <span>Segarkan Dashboard</span>
        </Button>
      </div>

      {errorMessage ? (
        <Alert variant="danger" title="Gagal memuat ringkasan dashboard">
          {errorMessage}
        </Alert>
      ) : null}

      {summary ? <DashboardKpiStrip summary={summary} /> : null}

      {/* Grafik Penjualan 7/14/30 Hari + Komposisi Kategori */}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5 lg:col-span-2">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-ink-primary">
                Grafik Penjualan {chartDays} Hari Terakhir
              </h2>
              {charts ? (
                <p className="text-xs text-ink-muted tabular-nums">
                  Total omzet {formatRupiah(Number(charts.totalRevenue))} · Laba{' '}
                  {formatRupiah(Number(charts.totalGrossProfit))} ({charts.totalTransactions} trx)
                </p>
              ) : null}
            </div>

            <div className="inline-flex rounded-xl border border-border-subtle bg-surface-subtle p-1">
              {CHART_DAY_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setChartDays(opt.days)}
                  aria-pressed={chartDays === opt.days}
                  className={cn(
                    'min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors',
                    chartDays === opt.days
                      ? 'bg-primary-700 text-white'
                      : 'text-ink-secondary hover:text-ink-primary',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading && !charts ? (
            <p className="py-12 text-center text-sm text-ink-muted">Memuat grafik penjualan...</p>
          ) : (
            <SalesTrendChart timeline={charts?.timeline ?? []} groupBy="day" />
          )}
        </section>

        <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
          <h2 className="mb-4 text-base font-bold text-ink-primary">
            Kontribusi Kategori ({chartDays} Hari)
          </h2>

          {!charts || charts.categoryBreakdown.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              Belum ada penjualan kategori pada periode ini.
            </p>
          ) : (
            <div className="space-y-3.5">
              {charts.categoryBreakdown.slice(0, 6).map((cat) => {
                const pctNum = Number(cat.percentage);
                return (
                  <div key={cat.categoryId} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-semibold text-ink-primary">
                        {cat.categoryName}
                      </span>
                      <span className="shrink-0 font-bold text-ink-primary tabular-nums">
                        {formatRupiah(Number(cat.revenue))}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                      <div
                        className="h-full rounded-full bg-primary-600 transition-all"
                        style={{ width: `${Math.min(100, Math.max(4, Math.round(pctNum)))}%` }}
                      />
                    </div>
                    <p className="text-right text-xs text-ink-muted tabular-nums">
                      {cat.percentage}% omzet item
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {summary ? <DashboardOperationalPanels summary={summary} /> : null}
    </div>
  );
}
