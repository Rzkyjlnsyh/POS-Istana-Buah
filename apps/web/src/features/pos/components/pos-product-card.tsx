import type { ProductDto } from '@istana-buah/shared';
import { AlertCircle, Barcode, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import React, { memo, useState } from 'react';
import { cn } from '../../../lib/cn';
import { formatQuantity, formatRupiah } from '../utils/formatters';

export interface PosProductCardProps {
  product: ProductDto;
  onSelect: (product: ProductDto) => void;
  searchQuery?: string;
}

function highlightMatch(text: string, query?: string): React.ReactNode {
  if (!query || !query.trim()) return text;
  const trimmed = query.trim();
  const escaped = trimmed.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.toLowerCase() === trimmed.toLowerCase()) {
      return (
        <mark
          key={index}
          className="rounded-sm bg-primary-100 px-0.5 text-primary-900 font-extrabold"
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

export const PosProductCard = memo(function PosProductCard({
  product,
  onSelect,
  searchQuery,
}: PosProductCardProps) {
  const [imageError, setImageError] = useState(false);

  const price =
    product.productType === 'WEIGHT'
      ? Number(product.pricePerKg ?? 0)
      : Number(product.pricePerUnit ?? 0);

  const stock = Number(product.stockQty ?? 0);
  const minAlert = product.minStockAlert ? Number(product.minStockAlert) : 0;
  const isOutOfStock = stock <= 0;
  const isLowStock = !isOutOfStock && minAlert > 0 && stock <= minAlert;
  const primaryBarcode = product.barcodes?.find((b) => b.isPrimary)?.barcode;

  return (
    <button
      type="button"
      disabled={isOutOfStock}
      onClick={() => onSelect(product)}
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden rounded-xl border text-left transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
        isOutOfStock
          ? 'cursor-not-allowed border-border-subtle bg-surface-muted/50 opacity-60'
          : 'border-border-subtle bg-surface-panel shadow-sm hover:border-primary-500 hover:shadow-md active:scale-[0.98]',
      )}
      style={{ contentVisibility: 'auto' }}
    >
      {/* 1. Area Gambar Produk / Fallback Icon */}
      <div className="relative h-28 w-full overflow-hidden bg-surface-muted sm:h-32">
        {product.imageUrl && !imageError ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            loading="lazy"
            decoding="async"
            onError={() => setImageError(true)}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-primary-50/50 text-primary-600">
            <ImageIcon className="h-8 w-8 stroke-1 text-primary-400" aria-hidden="true" />
          </div>
        )}

        {/* Badge Tipe Produk di Pojok Gambar */}
        <span
          className={cn(
            'absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-bold tracking-wide uppercase shadow-xs',
            product.productType === 'WEIGHT'
              ? 'bg-primary-700 text-white'
              : 'bg-blue-700 text-white',
          )}
        >
          {product.productType === 'WEIGHT' ? 'Timbang (kg)' : 'Satuan (pcs)'}
        </span>

        {/* Badge Stok Habis di Pojok Gambar */}
        {isOutOfStock ? (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-semantic-danger-ink px-1.5 py-0.5 text-xs font-bold text-white shadow-xs">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            <span>Habis</span>
          </span>
        ) : null}
      </div>

      {/* 2. Informasi Produk */}
      <div className="flex flex-1 flex-col justify-between p-3">
        <div>
          {/* Status Stok Tersedia */}
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="truncate text-ink-muted">{product.category?.name ?? 'Kategori'}</span>

            {!isOutOfStock ? (
              isLowStock ? (
                <span className="flex items-center gap-0.5 font-bold text-semantic-warning-ink">
                  <span>Sisa {formatQuantity(stock, product.productType)}</span>
                </span>
              ) : (
                <span className="font-medium text-ink-muted">
                  Stok: {formatQuantity(stock, product.productType)}
                </span>
              )
            ) : null}
          </div>

          {/* Nama Produk dengan highlight */}
          <p className="line-clamp-2 text-xs font-bold leading-snug text-ink-primary group-hover:text-primary-700 sm:text-sm">
            {highlightMatch(product.name, searchQuery)}
          </p>

          {/* Barcode primer (jika ada) */}
          {primaryBarcode ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-ink-muted font-mono">
              <Barcode className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{primaryBarcode}</span>
            </div>
          ) : null}
        </div>

        {/* 3. Harga & Tombol Beli */}
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
      </div>
    </button>
  );
});
