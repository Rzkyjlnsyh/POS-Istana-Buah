import type { CategoryDto, ProductDto } from '@istana-buah/shared';
import { AlertCircle, Barcode, CheckCircle2, Package, Search, X } from 'lucide-react';
import React, { useRef } from 'react';
import { cn } from '../../../lib/cn';
import { formatQuantity, formatRupiah } from '../utils/formatters';

export interface PosProductSectionProps {
  products: ProductDto[];
  categories: CategoryDto[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectProduct: (product: ProductDto) => void;
  isLoading?: boolean;
}

export function PosProductSection({
  products,
  categories,
  selectedCategoryId,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onSelectProduct,
  isLoading = false,
}: PosProductSectionProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <section
      aria-label="Katalog produk dan pencarian"
      className="flex flex-1 flex-col overflow-hidden bg-surface-canvas"
    >
      {/* 1. Bar Pencarian & Scan Barcode */}
      <div className="border-b border-border-subtle bg-surface-panel p-3">
        <div className="relative flex items-center">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-muted">
            <Search className="h-4 w-4" aria-hidden="true" />
          </div>

          <input
            ref={searchInputRef}
            id="pos-product-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari nama produk atau scan barcode... (F4)"
            aria-label="Cari nama produk atau scan barcode"
            className="w-full rounded-xl border border-border-strong bg-surface-canvas py-2.5 pl-10 pr-20 text-sm font-medium text-ink-primary placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />

          <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Bersihkan pencarian"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink-primary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}

            <span className="hidden items-center gap-1 rounded border border-border-subtle bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-ink-muted sm:inline-flex">
              <Barcode className="h-3 w-3" aria-hidden="true" />
              <span>F4</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Tabs Kategori Horisontal */}
      <div className="border-b border-border-subtle bg-surface-panel px-3 py-2">
        <div
          role="tablist"
          aria-label="Filter kategori produk"
          className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategoryId === null}
            onClick={() => onSelectCategory(null)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              selectedCategoryId === null
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-surface-muted text-ink-secondary hover:bg-border-subtle hover:text-ink-primary',
            )}
          >
            <span>Semua Produk</span>
          </button>

          {categories.map((cat) => {
            const isSelected = selectedCategoryId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelectCategory(cat.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  isSelected
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-surface-muted text-ink-secondary hover:bg-border-subtle hover:text-ink-primary',
                )}
              >
                <span>{cat.name}</span>
                {cat.productCount !== undefined && cat.productCount > 0 ? (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.2 text-xs font-bold',
                      isSelected ? 'bg-primary-700 text-white' : 'bg-surface-panel text-ink-muted',
                    )}
                  >
                    {cat.productCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Grid Produk */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-ink-muted">
            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary-600 border-t-transparent" />
            <p className="text-sm font-medium">Memuat produk...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-strong bg-surface-panel p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted">
              <Package className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink-primary">Produk tidak ditemukan</p>
              <p className="mt-1 text-xs text-ink-muted">
                {searchQuery
                  ? `Tidak ada produk dengan kata kunci "${searchQuery}"`
                  : 'Belum ada produk aktif pada kategori ini'}
              </p>
            </div>
            {searchQuery || selectedCategoryId ? (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  onSelectCategory(null);
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border-strong bg-surface-panel px-3 py-1.5 text-xs font-semibold text-ink-primary hover:bg-surface-muted"
              >
                <span>Reset Pencarian & Filter</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => {
              const price =
                product.productType === 'WEIGHT'
                  ? Number(product.pricePerKg ?? 0)
                  : Number(product.pricePerUnit ?? 0);

              const stock = Number(product.stockQty ?? 0);
              const minAlert = product.minStockAlert ? Number(product.minStockAlert) : 0;
              const isOutOfStock = stock <= 0;
              const isLowStock = !isOutOfStock && minAlert > 0 && stock <= minAlert;

              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={isOutOfStock}
                  onClick={() => onSelectProduct(product)}
                  className={cn(
                    'group relative flex flex-col justify-between rounded-xl border p-3 text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
                    isOutOfStock
                      ? 'cursor-not-allowed border-border-subtle bg-surface-muted/50 opacity-60'
                      : 'border-border-subtle bg-surface-panel shadow-sm hover:border-primary-500 hover:shadow-md active:scale-[0.98]',
                  )}
                >
                  <div>
                    {/* Header Card: Badges */}
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-xs font-bold tracking-wide uppercase',
                          product.productType === 'WEIGHT'
                            ? 'bg-primary-50 text-primary-700 border border-primary-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200',
                        )}
                      >
                        {product.productType === 'WEIGHT' ? 'Timbang (kg)' : 'Satuan (pcs)'}
                      </span>

                      {isOutOfStock ? (
                        <span className="flex items-center gap-0.5 text-xs font-semibold text-semantic-danger-ink">
                          <AlertCircle className="h-3 w-3" aria-hidden="true" />
                          <span>Habis</span>
                        </span>
                      ) : isLowStock ? (
                        <span className="flex items-center gap-0.5 text-xs font-semibold text-semantic-warning-ink">
                          <span>Sisa {formatQuantity(stock, product.productType)}</span>
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-ink-muted">
                          {formatQuantity(stock, product.productType)}
                        </span>
                      )}
                    </div>

                    {/* Nama Produk */}
                    <p className="line-clamp-2 text-xs font-bold leading-snug text-ink-primary group-hover:text-primary-700">
                      {product.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {product.category?.name ?? 'Kategori'}
                    </p>
                  </div>

                  {/* Harga & Aksi Beli */}
                  <div className="mt-3 flex items-baseline justify-between border-t border-border-subtle pt-2">
                    <div>
                      <span className="text-xs font-extrabold text-primary-700 sm:text-sm">
                        {formatRupiah(price)}
                      </span>
                      <span className="text-xs text-ink-muted">
                        /{product.productType === 'WEIGHT' ? 'kg' : 'pcs'}
                      </span>
                    </div>

                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-50 text-primary-600 group-hover:bg-primary-600 group-hover:text-white transition-colors">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
