import type { DashboardSummaryDto } from '@istana-buah/shared';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { formatRupiah } from '../../pos/utils/formatters';

interface DashboardKpiStripProps {
  summary: DashboardSummaryDto;
}

function formatComparisonBadge(changePercent: string | null): {
  text: string;
  tone: 'up' | 'down' | 'flat';
} {
  if (changePercent === null) {
    return { text: 'Baru hari ini', tone: 'flat' };
  }
  const num = Number(changePercent);
  if (num > 0) {
    return { text: `+${num.toFixed(1)}% vs kemarin`, tone: 'up' };
  }
  if (num < 0) {
    return { text: `${num.toFixed(1)}% vs kemarin`, tone: 'down' };
  }
  return { text: '0.0% vs kemarin', tone: 'flat' };
}

/**
 * Strip 4 metrik KPI utama toko secara real-time (FR-DSH-01, FR-DSH-05).
 */
export function DashboardKpiStrip({ summary }: DashboardKpiStripProps) {
  const revBadge = formatComparisonBadge(summary.comparison.revenueChangePercent);

  return (
    <section aria-label="Ringkasan KPI hari ini">
      <div className="grid divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-panel sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink-muted">Omzet Hari Ini</p>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums',
                revBadge.tone === 'up' &&
                  'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink',
                revBadge.tone === 'down' &&
                  'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink',
                revBadge.tone === 'flat' &&
                  'border-border-subtle bg-surface-subtle text-ink-secondary',
              )}
            >
              {revBadge.tone === 'up' ? (
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
              ) : null}
              {revBadge.tone === 'down' ? (
                <TrendingDown className="h-3 w-3" aria-hidden="true" />
              ) : null}
              {revBadge.text}
            </span>
          </div>
          <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
            {formatRupiah(Number(summary.today.revenue))}
          </p>
          <p className="mt-1 text-xs text-ink-secondary tabular-nums">
            Kemarin: {formatRupiah(Number(summary.yesterday.revenue))}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-ink-muted">Laba Kotor Hari Ini</p>
          <p className="mt-1.5 text-xl font-bold text-primary-700 tabular-nums sm:text-2xl">
            {formatRupiah(Number(summary.today.grossProfit))}
          </p>
          <p className="mt-1 text-xs text-ink-secondary tabular-nums">
            Margin {summary.today.profitMargin}% · HPP{' '}
            {formatRupiah(Number(summary.today.costOfGoodsSold))}
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-ink-muted">Transaksi Hari Ini</p>
          <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
            {summary.today.transactions} Struk
          </p>
          <p className="mt-1 text-xs text-ink-secondary tabular-nums">
            Rata-rata {formatRupiah(Number(summary.today.avgTransactionValue))} ·{' '}
            {summary.today.voidedTransactions} batal
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <p className="text-xs font-medium text-ink-muted">Peringatan Stok & Utang</p>
          <p
            className={cn(
              'mt-1.5 text-xl font-bold tabular-nums sm:text-2xl',
              summary.lowStock.totalCount > 0 ? 'text-semantic-danger-ink' : 'text-ink-primary',
            )}
          >
            {summary.lowStock.totalCount} SKU Menipis
          </p>
          <p className="mt-1 text-xs text-ink-secondary tabular-nums">
            {summary.lowStock.outOfStockCount} habis · {summary.unpaidPurchaseOrders.count} PO belum
            lunas
          </p>
        </div>
      </div>
    </section>
  );
}
