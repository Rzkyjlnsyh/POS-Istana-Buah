import { BarChart3, Package } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../../lib/cn';
import { SalesReportTab } from '../components/sales-report-tab';
import { StockReportTab } from '../components/stock-report-tab';

type ReportTabKey = 'SALES' | 'STOCK';

/**
 * Halaman Laporan Penjualan, Margin Kotor, Valuasi Stok & Ekspor (M07-002).
 * Hanya dapat diakses oleh OWNER dan MANAGER.
 */
export function ReportPage() {
  const [activeTab, setActiveTab] = useState<ReportTabKey>('SALES');

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">
            Laporan Penjualan & Stok
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Pantau omzet harian, margin laba kotor, produk terlaris, valuasi inventori, dan unduh
            laporan resmi.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Jenis laporan operasional"
          className="inline-flex rounded-xl border border-border-subtle bg-surface-panel p-1"
        >
          <button
            type="button"
            role="tab"
            id="report-tab-sales"
            aria-selected={activeTab === 'SALES'}
            aria-controls="report-panel-sales"
            onClick={() => setActiveTab('SALES')}
            className={cn(
              'inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors',
              activeTab === 'SALES'
                ? 'bg-primary-700 text-white'
                : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary',
            )}
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            <span>Laporan Penjualan</span>
          </button>

          <button
            type="button"
            role="tab"
            id="report-tab-stock"
            aria-selected={activeTab === 'STOCK'}
            aria-controls="report-panel-stock"
            onClick={() => setActiveTab('STOCK')}
            className={cn(
              'inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors',
              activeTab === 'STOCK'
                ? 'bg-primary-700 text-white'
                : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary',
            )}
          >
            <Package className="h-4 w-4" aria-hidden="true" />
            <span>Valuasi Stok</span>
          </button>
        </div>
      </div>

      {activeTab === 'SALES' ? (
        <div role="tabpanel" id="report-panel-sales" aria-labelledby="report-tab-sales">
          <SalesReportTab />
        </div>
      ) : (
        <div role="tabpanel" id="report-panel-stock" aria-labelledby="report-tab-stock">
          <StockReportTab />
        </div>
      )}
    </div>
  );
}
