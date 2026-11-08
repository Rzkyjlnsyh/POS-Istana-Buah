import type { CategoryDto, ProductDto } from '@istana-buah/shared';
import { Barcode, Camera, ChevronLeft, ChevronRight, Package, Search, X } from 'lucide-react';
import React, { useRef } from 'react';
import { cn } from '../../../lib/cn';
import { PosProductCard } from './pos-product-card';

export interface PosProductSectionProps {
  products: ProductDto[];
  categories: CategoryDto[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectProduct: (product: ProductDto) => void;
  onOpenScannerModal?: () => void;
  onBarcodeSubmit?: (barcode: string) => void;
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
  onOpenScannerModal,
  onBarcodeSubmit,
  isLoading = false,
}: PosProductSectionProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollOffset = direction === 'left' ? -200 : 200;
      if (typeof categoryScrollRef.current.scrollBy === 'function') {
        categoryScrollRef.current.scrollBy({ left: scrollOffset, behavior: 'smooth' });
      } else {
        categoryScrollRef.current.scrollLeft += scrollOffset;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim() && onBarcodeSubmit) {
      e.preventDefault();
      onBarcodeSubmit(searchQuery.trim());
    }
  };

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
            onKeyDown={handleKeyDown}
            placeholder="Cari nama produk atau scan barcode... (F4)"
            aria-label="Cari nama produk atau scan barcode"
            className="w-full rounded-xl border border-border-strong bg-surface-canvas py-2.5 pl-10 pr-28 text-sm font-medium text-ink-primary placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />

          <div className="absolute inset-y-0 right-0 flex items-center pr-2 gap-1.5">
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

            {onOpenScannerModal ? (
              <button
                type="button"
                onClick={onOpenScannerModal}
                aria-label="Buka pemindai kamera barcode"
                title="Buka kamera untuk memindai barcode"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}

            <span className="hidden items-center gap-1 rounded border border-border-subtle bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-ink-muted sm:inline-flex">
              <Barcode className="h-3 w-3" aria-hidden="true" />
              <span>F4</span>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Tabs Kategori Horisontal dengan Tombol Geser */}
      <div className="relative border-b border-border-subtle bg-surface-panel px-3 py-2">
        <div className="flex items-center gap-1">
          {/* Tombol Geser Kiri */}
          <button
            type="button"
            onClick={() => scrollCategories('left')}
            aria-label="Geser kategori ke kiri"
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-panel text-ink-muted hover:bg-surface-muted hover:text-ink-primary sm:flex"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* List Tab */}
          <div
            ref={categoryScrollRef}
            role="tablist"
            aria-label="Filter kategori produk"
            className="flex flex-1 items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar scroll-smooth"
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
                        isSelected
                          ? 'bg-primary-700 text-white'
                          : 'bg-surface-panel text-ink-muted',
                      )}
                    >
                      {cat.productCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Tombol Geser Kanan */}
          <button
            type="button"
            onClick={() => scrollCategories('right')}
            aria-label="Geser kategori ke kanan"
            className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-panel text-ink-muted hover:bg-surface-muted hover:text-ink-primary sm:flex"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 3. Grid Produk (Scrollable) */}
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
            {products.map((product) => (
              <PosProductCard
                key={product.id}
                product={product}
                onSelect={onSelectProduct}
                searchQuery={searchQuery}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
