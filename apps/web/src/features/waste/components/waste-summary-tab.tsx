import type { WasteSummaryGroupBy, WasteSummaryReportDto } from '@istana-buah/shared';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import {
  formatQuantity,
  formatRupiah,
  getStoreDateString,
  shiftYmdDate,
  toStoreDayBounds,
} from '../../pos/utils/formatters';
import { getWasteSummary } from '../api/waste-api';
import { WASTE_TYPE_META } from '../utils/waste-meta';

interface WasteSummaryTabProps {
  refreshToken: number;
}

/**
 * Tab Laporan Kerugian & Penyusutan Buah Harian/Bulanan (FR-WST-05).
 */
export function WasteSummaryTab({ refreshToken }: WasteSummaryTabProps) {
  const startId = useId();
  const endId = useId();
  const todayYmd = useMemo(() => getStoreDateString(), []);

  const [startYmd, setStartYmd] = useState<string>(() => shiftYmdDate(todayYmd, -29));
  const [endYmd, setEndYmd] = useState<string>(todayYmd);
  const [groupBy, setGroupBy] = useState<WasteSummaryGroupBy>('day');

  const [summary, setSummary] = useState<WasteSummaryReportDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (startYmd > endYmd) {
      setErrorMessage('Tanggal awal laporan penyusutan tidak boleh melebihi tanggal akhir.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const bounds = toStoreDayBounds(startYmd, endYmd);
      const data = await getWasteSummary({ ...bounds, groupBy });
      setSummary(data);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [startYmd, endYmd, groupBy]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary, refreshToken]);

  const totalCostNum = Number(summary?.totalEstimatedCost ?? 0);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor={startId}
                className="mb-1 block text-xs font-semibold text-ink-secondary"
              >
                Dari Tanggal
              </label>
              <input
                id={startId}
                type="date"
                value={startYmd}
                max={endYmd}
                onChange={(e) => setStartYmd(e.target.value)}
                className="min-h-11 rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary tabular-nums"
              />
            </div>

            <div>
              <label
                htmlFor={endId}
                className="mb-1 block text-xs font-semibold text-ink-secondary"
              >
                Sampai Tanggal
              </label>
              <input
                id={endId}
                type="date"
                value={endYmd}
                min={startYmd}
                onChange={(e) => setEndYmd(e.target.value)}
                className="min-h-11 rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary tabular-nums"
              />
            </div>

            <div className="inline-flex rounded-xl border border-border-subtle bg-surface-subtle p-1">
              <button
                type="button"
                onClick={() => setGroupBy('day')}
                aria-pressed={groupBy === 'day'}
                className={cn(
                  'min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors',
                  groupBy === 'day'
                    ? 'bg-primary-700 text-white'
                    : 'text-ink-secondary hover:text-ink-primary',
                )}
              >
                Harian
              </button>
              <button
                type="button"
                onClick={() => setGroupBy('month')}
                aria-pressed={groupBy === 'month'}
                className={cn(
                  'min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors',
                  groupBy === 'month'
                    ? 'bg-primary-700 text-white'
                    : 'text-ink-secondary hover:text-ink-primary',
                )}
              >
                Bulanan
              </button>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadSummary()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
            <span>Perbarui Ringkasan</span>
          </Button>
        </div>
      </section>

      {errorMessage ? (
        <Alert variant="danger" title="Gagal memuat laporan penyusutan">
          {errorMessage}
        </Alert>
      ) : null}

      <section aria-label="Ringkasan kerugian penyusutan">
        <div className="grid divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-panel sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Total Insiden Susut</p>
            <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
              {summary?.totalRecords ?? 0} Catatan
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Dalam rentang tanggal terpilih</p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Total Kuantitas Tersusut</p>
            <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
              {summary?.totalQuantity ?? '0'} Unit/Kg
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Akumulasi kuantitas terkeluar</p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Total Estimasi Kerugian HPP</p>
            <p className="mt-1.5 text-xl font-bold text-semantic-danger-ink tabular-nums sm:text-2xl">
              {formatRupiah(totalCostNum)}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Dihitung berdasarkan HPP per item</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
          <h2 className="mb-4 text-base font-bold text-ink-primary">Komposisi Jenis Penyusutan</h2>
          {!summary || summary.byType.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              Belum ada data penyusutan pada periode ini.
            </p>
          ) : (
            <div className="space-y-3.5">
              {summary.byType.map((item) => {
                const cost = Number(item.totalEstimatedCost);
                const share = totalCostNum > 0 ? Math.round((cost / totalCostNum) * 100) : 0;
                return (
                  <div key={item.wasteType} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-semibold text-ink-primary">
                        {WASTE_TYPE_META[item.wasteType].label}
                      </span>
                      <span className="font-bold text-semantic-danger-ink tabular-nums">
                        {formatRupiah(cost)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
                      <div
                        className="h-full rounded-full bg-semantic-warning-ink transition-all"
                        style={{ width: `${Math.min(100, Math.max(4, share))}%` }}
                      />
                    </div>
                    <p className="flex justify-between text-xs text-ink-muted tabular-nums">
                      <span>{item.count} kejadian</span>
                      <span>{share}% dari kerugian</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
          <h2 className="mb-4 text-base font-bold text-ink-primary">Produk Kerugian Tertinggi</h2>
          {!summary || summary.topProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              Belum ada produk tercatat menyusut pada periode ini.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {summary.topProducts.slice(0, 8).map((prod) => (
                <li key={prod.productId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-primary">
                      {prod.productName}
                    </p>
                    <p className="text-xs text-ink-muted tabular-nums">
                      {prod.categoryName} ·{' '}
                      {formatQuantity(Number(prod.totalQuantity), prod.productType)} ({prod.count}{' '}
                      kali)
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-semantic-danger-ink tabular-nums">
                    {formatRupiah(Number(prod.totalEstimatedCost))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
