import type { DashboardSummaryDto } from '@istana-buah/shared';
import { AlertTriangle, ArrowRight, Clock, Package } from 'lucide-react';
import { Link, useInRouterContext } from 'react-router';
import { cn } from '../../../lib/cn';
import { formatQuantity, formatRupiah } from '../../pos/utils/formatters';

interface DashboardOperationalPanelsProps {
  summary: DashboardSummaryDto;
}

/**
 * Panel Produk Terlaris Hari Ini, Alert Stok Menipis & Status Shift Aktif (FR-DSH-03, FR-DSH-04).
 */
export function DashboardOperationalPanels({ summary }: DashboardOperationalPanelsProps) {
  const inRouter = useInRouterContext();

  const renderNavLink = (to: string, label: string) =>
    inRouter ? (
      <Link
        to={to}
        className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary-700 hover:text-primary-900"
      >
        <span>{label}</span>
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    ) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* Produk Terlaris Hari Ini */}
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink-primary">Produk Terlaris Hari Ini</h2>
          {renderNavLink('/reports', 'Laporan Lengkap')}
        </div>

        {summary.topProductsToday.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border-subtle bg-surface-subtle p-5 text-center">
            <Package className="mb-2 h-5 w-5 text-ink-muted" aria-hidden="true" />
            <p className="text-sm text-ink-muted">Belum ada penjualan produk hari ini.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {summary.topProductsToday.map((item, idx) => (
              <li key={item.productId} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-primary">
                    {idx + 1}. {item.productName}
                  </p>
                  <p className="text-xs text-ink-muted tabular-nums">
                    {formatQuantity(Number(item.totalQuantity), item.productType)} · Margin{' '}
                    {item.profitMargin}%
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-ink-primary tabular-nums">
                  {formatRupiah(Number(item.totalRevenue))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Alert Stok Menipis */}
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={cn(
                'h-4 w-4',
                summary.lowStock.totalCount > 0 ? 'text-semantic-danger-ink' : 'text-ink-muted',
              )}
              aria-hidden="true"
            />
            <h2 className="text-base font-bold text-ink-primary">Alert Stok Menipis</h2>
          </div>
          {renderNavLink('/stock', 'Kelola Stok')}
        </div>

        {summary.lowStock.items.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border-subtle bg-surface-subtle p-5 text-center text-sm text-ink-muted">
            Semua stok produk aman di atas batas minimum.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {summary.lowStock.items.map((item) => {
              const isOut = Number(item.stockQty) <= 0;
              return (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-semantic-danger-border bg-semantic-danger-bg px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-semantic-danger-ink">
                      {item.name}
                    </p>
                    <p className="text-xs text-semantic-danger-ink/90 tabular-nums">
                      Min. {formatQuantity(Number(item.minStockAlert), item.productType)} · Kurang{' '}
                      {formatQuantity(Number(item.deficit), item.productType)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-semantic-danger-border bg-surface-panel px-2.5 py-0.5 text-xs font-bold text-semantic-danger-ink tabular-nums">
                    {isOut ? 'Habis' : formatQuantity(Number(item.stockQty), item.productType)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Ringkasan Shift Aktif & Keuangan Operasional */}
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary-700" aria-hidden="true" />
            <h2 className="text-base font-bold text-ink-primary">Shift Kasir & Operasional</h2>
          </div>
          {renderNavLink('/shifts', 'Pantau Shift')}
        </div>

        {summary.openShifts.items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-subtle bg-surface-subtle p-4 text-center text-xs text-ink-muted">
            Saat ini belum ada shift kasir yang terbuka.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {summary.openShifts.items.map((sh) => (
              <li key={sh.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-primary">
                    {sh.cashierName}
                  </p>
                  <p className="text-xs text-ink-muted tabular-nums">
                    {sh.shiftNo} · {sh.totalTransactions} trx
                  </p>
                </div>
                <p className="shrink-0 text-sm font-bold text-primary-700 tabular-nums">
                  {formatRupiah(Number(sh.totalSales))}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-2 border-t border-border-subtle pt-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Tagihan PO Belum Lunas</span>
            <span className="font-semibold text-ink-primary tabular-nums">
              {formatRupiah(Number(summary.unpaidPurchaseOrders.totalOutstandingDebt))}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-ink-muted">Penyusutan Buah Hari Ini</span>
            <span className="font-semibold text-ink-primary tabular-nums">
              {summary.todayWaste.count} catatan (
              {formatRupiah(Number(summary.todayWaste.totalEstimatedCost))})
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
