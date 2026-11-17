import type { CategoryDto, CurrentStockReportDto } from '@istana-buah/shared';
import { RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { getCategories } from '../../categories/api/category-api';
import { formatQuantity, formatRupiah } from '../../pos/utils/formatters';
import { getCurrentStockReport } from '../api/report-api';

function getStockStatusBadge(
  isOutOfStock: boolean,
  isLowStock: boolean,
): {
  label: string;
  badgeClass: string;
} {
  if (isOutOfStock) {
    return {
      label: 'Habis',
      badgeClass: 'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink',
    };
  }
  if (isLowStock) {
    return {
      label: 'Menipis',
      badgeClass: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
    };
  }
  return {
    label: 'Aman',
    badgeClass: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink',
  };
}

/**
 * Tab Laporan Posisi & Valuasi Stok Saat Ini (M07-002).
 */
export function StockReportTab() {
  const searchInputId = useId();
  const categorySelectId = useId();
  const lowStockCheckboxId = useId();

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [report, setReport] = useState<CurrentStockReportDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchTerm === debouncedSearch) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  useEffect(() => {
    void getCategories({ isActive: true, limit: 100 })
      .then((cats) => setCategories(cats))
      .catch(() => setCategories([]));
  }, []);

  const loadStockReport = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await getCurrentStockReport({
        ...(categoryId ? { categoryId } : {}),
        ...(lowStockOnly ? { lowStockOnly: true } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      });
      setReport(data);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, lowStockOnly, debouncedSearch]);

  useEffect(() => {
    void loadStockReport();
  }, [loadStockReport]);

  return (
    <div className="space-y-5">
      {/* Filter Valuasi Stok */}
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor={searchInputId}
                className="mb-1 block text-xs font-semibold text-ink-secondary"
              >
                Cari Produk
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <Input
                  id={searchInputId}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Nama produk..."
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor={categorySelectId}
                className="mb-1 block text-xs font-semibold text-ink-secondary"
              >
                Kategori
              </label>
              <select
                id={categorySelectId}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary"
              >
                <option value="">Semua Kategori</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center pb-1">
              <label
                htmlFor={lowStockCheckboxId}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-primary"
              >
                <input
                  id={lowStockCheckboxId}
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(e) => setLowStockOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-border-strong text-primary-700 focus:ring-primary-700"
                />
                <span>Hanya Stok Menipis / Habis</span>
              </label>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadStockReport()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
            <span>Segarkan Stok</span>
          </Button>
        </div>
      </section>

      {errorMessage ? (
        <Alert variant="danger" title="Gagal memuat valuasi stok">
          {errorMessage}
        </Alert>
      ) : null}

      {/* Ringkasan KPI Valuasi Stok */}
      <section aria-label="Ringkasan valuasi inventori">
        <div className="grid divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-panel sm:grid-cols-2 sm:divide-y-0 sm:divide-x lg:grid-cols-4">
          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Total SKU Ditampilkan</p>
            <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
              {report?.totalProducts ?? 0} SKU
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Produk aktif & tercatat</p>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Perlu Perhatian</p>
            <p className="mt-1.5 text-xl font-bold text-semantic-warning-ink tabular-nums sm:text-2xl">
              {report?.lowStockCount ?? 0} Menipis
            </p>
            <p className="mt-1 text-xs text-ink-secondary tabular-nums">
              {report?.outOfStockCount ?? 0} SKU stok habis
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Nilai Modal (HPP)</p>
            <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
              {formatRupiah(Number(report?.totalStockCostValue ?? 0))}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Estimasi modal tertanam</p>
          </div>

          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Potensi Nilai Jual Ritel</p>
            <p className="mt-1.5 text-xl font-bold text-primary-700 tabular-nums sm:text-2xl">
              {formatRupiah(Number(report?.totalStockRetailValue ?? 0))}
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Valuasi berdasarkan harga jual</p>
          </div>
        </div>
      </section>

      {/* Tabel & Daftar Valuasi Stok */}
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
        <h2 className="mb-4 text-base font-bold text-ink-primary">Posisi & Valuasi Stok</h2>

        {isLoading ? (
          <p className="py-10 text-center text-sm text-ink-muted">Memuat posisi stok...</p>
        ) : !report || report.items.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">
            Tidak ada produk yang sesuai filter saat ini.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs font-semibold text-ink-secondary">
                    <th className="py-2.5 pr-4">Produk</th>
                    <th className="py-2.5 pr-4">Kategori</th>
                    <th className="py-2.5 pr-4 text-right">Stok</th>
                    <th className="py-2.5 pr-4 text-right">Batas Min.</th>
                    <th className="py-2.5 pr-4 text-right">HPP Satuan</th>
                    <th className="py-2.5 pr-4 text-right">Harga Jual</th>
                    <th className="py-2.5 pr-4 text-right">Nilai Modal</th>
                    <th className="py-2.5 pr-4 text-right">Nilai Jual</th>
                    <th className="py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {report.items.map((item) => {
                    const status = getStockStatusBadge(item.isOutOfStock, item.isLowStock);
                    return (
                      <tr key={item.id} className="hover:bg-surface-subtle/60">
                        <td className="py-3 pr-4 font-semibold text-ink-primary">{item.name}</td>
                        <td className="py-3 pr-4 text-ink-secondary">{item.categoryName}</td>
                        <td className="py-3 pr-4 text-right font-semibold text-ink-primary tabular-nums">
                          {formatQuantity(Number(item.stockQty), item.productType)}
                        </td>
                        <td className="py-3 pr-4 text-right text-ink-muted tabular-nums">
                          {item.minStockAlert !== null
                            ? formatQuantity(Number(item.minStockAlert), item.productType)
                            : '-'}
                        </td>
                        <td className="py-3 pr-4 text-right text-ink-secondary tabular-nums">
                          {formatRupiah(Number(item.unitCost))}
                        </td>
                        <td className="py-3 pr-4 text-right text-ink-secondary tabular-nums">
                          {formatRupiah(Number(item.unitPrice))}
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold text-ink-primary tabular-nums">
                          {formatRupiah(Number(item.stockCostValue))}
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold text-primary-700 tabular-nums">
                          {formatRupiah(Number(item.stockRetailValue))}
                        </td>
                        <td className="py-3 text-right">
                          <span
                            className={cn(
                              'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                              status.badgeClass,
                            )}
                          >
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border-subtle md:hidden">
              {report.items.map((item) => {
                const status = getStockStatusBadge(item.isOutOfStock, item.isLowStock);
                return (
                  <div key={item.id} className="space-y-1.5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink-primary">{item.name}</p>
                        <p className="text-xs text-ink-muted">{item.categoryName}</p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          status.badgeClass,
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary tabular-nums">
                      <span>
                        Stok: {formatQuantity(Number(item.stockQty), item.productType)} (HPP{' '}
                        {formatRupiah(Number(item.unitCost))})
                      </span>
                      <span className="font-semibold text-primary-700">
                        Valuasi Modal: {formatRupiah(Number(item.stockCostValue))}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
