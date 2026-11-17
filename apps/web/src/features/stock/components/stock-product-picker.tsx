import type { ProductDto } from '@istana-buah/shared';
import { Plus, Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { formatQuantity } from '../../pos/utils/formatters';

export interface StockProductPickerProps {
  products: ProductDto[];
  excludedProductIds?: ReadonlySet<string>;
  onSelectProduct: (product: ProductDto) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Pencarian & pemilih produk aktif bersama untuk form Penerimaan Stok dan Stok Opname.
 */
export function StockProductPicker({
  products,
  excludedProductIds,
  onSelectProduct,
  label = 'Cari & Tambah Produk',
  placeholder = 'Ketik nama buah atau barcode...',
}: StockProductPickerProps) {
  const inputId = useId();
  const [query, setQuery] = useState('');

  const candidates = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const active = products.filter((p) => p.isActive);
    const filtered = trimmed
      ? active.filter(
          (p) =>
            p.name.toLowerCase().includes(trimmed) ||
            p.barcodes.some((b) => b.barcode.toLowerCase().includes(trimmed)),
        )
      : active;
    return filtered.slice(0, 8);
  }, [products, query]);

  return (
    <div className="space-y-2.5">
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink-primary">
          {label}
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <Input
            id={inputId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="pl-10"
          />
        </div>
      </div>

      {candidates.length > 0 ? (
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Daftar produk cepat"
        >
          {candidates.map((prod) => {
            const isAdded = excludedProductIds?.has(prod.id) ?? false;
            return (
              <Button
                key={prod.id}
                type="button"
                variant="secondary"
                disabled={isAdded}
                onClick={() => {
                  onSelectProduct(prod);
                  setQuery('');
                }}
                className="h-auto min-h-11 justify-between gap-2 px-3 py-2 text-left font-normal"
              >
                <span className="min-w-0 truncate font-medium text-ink-primary">{prod.name}</span>
                <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-ink-muted">
                  <span>{formatQuantity(Number(prod.stockQty), prod.productType)}</span>
                  <Plus className="h-3.5 w-3.5 text-primary-700" aria-hidden="true" />
                </span>
              </Button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          Tidak ada produk aktif yang cocok dengan pencarian &ldquo;{query}&rdquo;.
        </p>
      )}
    </div>
  );
}
