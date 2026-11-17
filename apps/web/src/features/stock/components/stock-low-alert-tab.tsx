import type { CategoryDto, LowStockAlertItemDto } from '@istana-buah/shared';
import { AlertTriangle, CheckCircle2, PackagePlus, Search } from 'lucide-react';
import { useId } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { formatQuantity } from '../../pos/utils/formatters';

export interface StockLowAlertTabProps {
  alerts: LowStockAlertItemDto[];
  categories: CategoryDto[];
  isLoading: boolean;
  searchTerm: string;
  selectedCategoryId: string;
  onSearchChange: (val: string) => void;
  onCategoryChange: (val: string) => void;
  onQuickReceive: (item: LowStockAlertItemDto) => void;
}

/**
 * Tab Peringatan Stok Menipis (M04-002): menampilkan buah/produk aktif dengan stok <= minStockAlert.
 */
export function StockLowAlertTab({
  alerts,
  categories,
  isLoading,
  searchTerm,
  selectedCategoryId,
  onSearchChange,
  onCategoryChange,
  onQuickReceive,
}: StockLowAlertTabProps) {
  const searchId = useId();
  const categoryId = useId();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label htmlFor={searchId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Cari Produk Menipis
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Cari nama produk..."
              className="pl-10"
            />
          </div>
        </div>
        <div>
          <label htmlFor={categoryId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Kategori
          </label>
          <select
            id={categoryId}
            value={selectedCategoryId}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3.5 text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
          >
            <option value="">Semua Kategori</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-subtle/50 px-4 py-10 text-center text-sm text-ink-muted">
          Memuat daftar peringatan stok minimum...
        </div>
      ) : alerts.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-subtle/40 px-4 py-10 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-primary-700" aria-hidden="true" />
          <p className="mt-2 font-medium text-ink-primary">
            Semua stok produk aman di atas batas minimum
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Produk dengan sisa stok di bawah atau sama dengan batas peringatan akan muncul otomatis
            di sini.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border-subtle md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border-subtle bg-surface-subtle text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Produk
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Kategori
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Stok Saat Ini
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Minimum Alert
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Kekurangan
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface-panel">
                {alerts.map((item) => {
                  const isOut = Number(item.stockQty) <= 0;
                  return (
                    <tr key={item.id} className="hover:bg-surface-subtle/40">
                      <td className="px-4 py-3 font-medium text-ink-primary">
                        <div className="flex items-center gap-2">
                          <AlertTriangle
                            className={
                              isOut
                                ? 'h-4 w-4 shrink-0 text-semantic-danger-ink'
                                : 'h-4 w-4 shrink-0 text-semantic-warning-ink'
                            }
                            aria-hidden="true"
                          />
                          <span>{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{item.categoryName}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-semantic-danger-ink">
                        {formatQuantity(Number(item.stockQty), item.productType)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                        {formatQuantity(Number(item.minStockAlert), item.productType)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-semantic-warning-ink">
                        {formatQuantity(Number(item.deficit), item.productType)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => onQuickReceive(item)}
                        >
                          <PackagePlus className="h-4 w-4" aria-hidden="true" />
                          <span>Terima Stok</span>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {alerts.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border-subtle bg-surface-panel p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-primary">{item.name}</p>
                    <p className="text-xs text-ink-muted">{item.categoryName}</p>
                  </div>
                  <span className="rounded-full border border-semantic-danger-border bg-semantic-danger-bg px-2.5 py-0.5 text-xs font-semibold tabular-nums text-semantic-danger-ink">
                    {formatQuantity(Number(item.stockQty), item.productType)}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs text-ink-secondary tabular-nums">
                  <span>Min: {formatQuantity(Number(item.minStockAlert), item.productType)}</span>
                  <span>Kurang: {formatQuantity(Number(item.deficit), item.productType)}</span>
                </div>
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => onQuickReceive(item)}
                  >
                    <PackagePlus className="h-4 w-4" aria-hidden="true" />
                    <span>Terima Stok</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
