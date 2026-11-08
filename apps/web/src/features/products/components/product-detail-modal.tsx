import type { ProductDto } from '@istana-buah/shared';
import {
  AlertTriangle,
  Barcode as BarcodeIcon,
  Calendar,
  Layers,
  Package,
  Pencil,
  Printer,
  Scale,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';

export interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductDto | null;
  onEdit?: (product: ProductDto) => void;
  onDelete?: (product: ProductDto) => void;
  onPrintBarcode?: (product: ProductDto, barcode?: string) => void;
  canManage: boolean;
  canViewHpp: boolean;
}

function formatRupiah(amount: string | null): string {
  if (!amount) return '-';
  const val = parseFloat(amount);
  if (isNaN(val)) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function formatQuantity(qtyStr: string, type: 'WEIGHT' | 'UNIT'): string {
  const val = parseFloat(qtyStr);
  if (isNaN(val)) return '0';
  if (type === 'WEIGHT') {
    return `${val.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} kg`;
  }
  return `${Math.round(val).toLocaleString('id-ID')} pcs`;
}

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

/**
 * Modal detail produk lengkap dengan indikator stok, daftar barcode, dan proteksi HPP (M02-005).
 */
export function ProductDetailModal({
  isOpen,
  onClose,
  product,
  onEdit,
  onDelete,
  onPrintBarcode,
  canManage,
  canViewHpp,
}: ProductDetailModalProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (!product) {
    return null;
  }

  const stockNum = parseFloat(product.stockQty);
  const minStockNum = product.minStockAlert ? parseFloat(product.minStockAlert) : null;
  const isLowStock = minStockNum !== null && stockNum <= minStockNum;

  const sellingPrice = product.productType === 'WEIGHT' ? product.pricePerKg : product.pricePerUnit;
  const costPrice = product.productType === 'WEIGHT' ? product.costPerKg : product.costPerUnit;

  let marginPct: string | null = null;
  if (sellingPrice && costPrice) {
    const s = parseFloat(sellingPrice);
    const c = parseFloat(costPrice);
    if (!isNaN(s) && !isNaN(c) && s > 0) {
      marginPct = (((s - c) / s) * 100).toFixed(1);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detail Produk"
      description={`Informasi lengkap produk #${product.id.slice(0, 8)}`}
      size="lg"
    >
      <div className="space-y-6 text-sm">
        {/* Header Profil Produk */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface-canvas shadow-sm">
            {product.imageUrl && !imageFailed ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover"
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-surface-subtle text-emerald-800">
                <Package className="h-10 w-10 opacity-70" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  product.productType === 'WEIGHT'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                }`}
              >
                {product.productType === 'WEIGHT' ? (
                  <>
                    <Scale className="h-3 w-3" aria-hidden="true" /> Timbang (Kg)
                  </>
                ) : (
                  <>
                    <Package className="h-3 w-3" aria-hidden="true" /> Satuan (Pcs)
                  </>
                )}
              </span>

              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  product.isActive
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    : 'bg-neutral-100 text-neutral-700 border border-neutral-300'
                }`}
              >
                {product.isActive ? 'Aktif' : 'Nonaktif'}
              </span>

              {isLowStock ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" /> Stok Menipis
                </span>
              ) : null}
            </div>

            <h2 className="text-xl font-bold tracking-tight text-ink-primary">{product.name}</h2>
            <p className="flex items-center gap-1 text-xs text-ink-secondary">
              <Layers className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
              Kategori:{' '}
              <span className="font-semibold text-ink-primary">{product.category.name}</span>
            </p>
          </div>
        </div>

        {/* Banner Stok Menipis bila kondisi tercapai */}
        {isLowStock ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <div>
              <p className="font-bold">Peringatan: Stok berada pada atau di bawah batas minimum!</p>
              <p className="mt-0.5 leading-relaxed">
                Stok saat ini adalah{' '}
                <span className="font-bold">
                  {formatQuantity(product.stockQty, product.productType)}
                </span>
                , sedangkan batas minimum yang diatur adalah{' '}
                <span className="font-bold">
                  {product.minStockAlert
                    ? formatQuantity(product.minStockAlert, product.productType)
                    : '-'}
                </span>
                .
              </p>
            </div>
          </div>
        ) : null}

        {/* Grid Harga & Stok */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Card Harga Jual */}
          <div className="rounded-xl border border-border-subtle bg-surface-canvas p-4 space-y-1">
            <span className="text-xs font-semibold text-ink-muted">Harga Jual Konsumen</span>
            <p className="text-xl font-extrabold text-emerald-800 tabular-nums">
              {formatRupiah(sellingPrice)}{' '}
              <span className="text-xs font-normal text-ink-secondary">
                / {product.productType === 'WEIGHT' ? 'kg' : 'pcs'}
              </span>
            </p>
          </div>

          {/* Card Stok Tersedia */}
          <div className="rounded-xl border border-border-subtle bg-surface-canvas p-4 space-y-1">
            <span className="text-xs font-semibold text-ink-muted">Stok Tersedia</span>
            <p
              className={`text-xl font-extrabold tabular-nums ${
                isLowStock ? 'text-amber-700' : 'text-ink-primary'
              }`}
            >
              {formatQuantity(product.stockQty, product.productType)}
            </p>
            <p className="text-xs text-ink-muted">
              Batas minimum:{' '}
              {product.minStockAlert
                ? formatQuantity(product.minStockAlert, product.productType)
                : 'Tidak disetel'}
            </p>
          </div>

          {/* Card HPP - Khusus Manajer/Owner (NFR-SEC-09) */}
          {canViewHpp ? (
            <div className="rounded-xl border border-border-subtle bg-surface-canvas p-4 space-y-1 sm:col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-muted">
                  HPP (Harga Pokok Penjualan) — Khusus Manajer/Owner
                </span>
                {marginPct !== null ? (
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    Est. Margin {marginPct}%
                  </span>
                ) : null}
              </div>
              <p className="text-base font-bold text-ink-primary tabular-nums">
                {costPrice ? (
                  <>
                    {formatRupiah(costPrice)}{' '}
                    <span className="text-xs font-normal text-ink-secondary">
                      / {product.productType === 'WEIGHT' ? 'kg' : 'pcs'}
                    </span>
                  </>
                ) : (
                  <span className="text-sm font-normal text-ink-muted">Belum disetel</span>
                )}
              </p>
            </div>
          ) : null}
        </div>

        {/* Daftar Barcode */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-secondary">
            <BarcodeIcon className="h-4 w-4" aria-hidden="true" />
            Daftar Barcode ({product.barcodes.length})
          </h3>
          {product.barcodes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border-subtle p-3 text-xs text-ink-muted">
              Belum ada barcode terdaftar untuk produk ini.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {product.barcodes.map((bc) => (
                <div
                  key={bc.id}
                  className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-canvas px-3 py-1.5 text-xs font-mono font-medium text-ink-primary"
                >
                  <BarcodeIcon className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                  <span className="tabular-nums tracking-wide">{bc.barcode}</span>
                  {bc.isPrimary ? (
                    <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-xs font-sans font-bold text-white uppercase">
                      Utama
                    </span>
                  ) : null}
                  {onPrintBarcode ? (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onPrintBarcode(product, bc.barcode);
                      }}
                      aria-label={`Cetak label barcode ${bc.barcode}`}
                      className="ml-0.5 rounded p-1 text-ink-muted hover:bg-emerald-50 hover:text-emerald-700"
                    >
                      <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deskripsi */}
        {product.description ? (
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
              Deskripsi Produk
            </h3>
            <p className="rounded-xl border border-border-subtle bg-surface-canvas p-3 text-xs leading-relaxed text-ink-primary whitespace-pre-wrap">
              {product.description}
            </p>
          </div>
        ) : null}

        {/* Info Audit & Timestamps */}
        <div className="flex flex-col gap-1 border-t border-border-subtle pt-3 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Dibuat: {formatDate(product.createdAt)}
          </span>
          <span>Diperbarui: {formatDate(product.updatedAt)}</span>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse justify-end gap-3 pt-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            Tutup
          </Button>

          {onPrintBarcode && product.barcodes.length > 0 ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onClose();
                onPrintBarcode(product);
              }}
              className="w-full sm:w-auto"
            >
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Cetak Barcode
            </Button>
          ) : null}

          {canManage && onDelete ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onClose();
                onDelete(product);
              }}
              className="w-full text-red-700 hover:bg-red-50 hover:text-red-800 border-red-200 sm:w-auto"
            >
              <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Hapus
            </Button>
          ) : null}

          {canManage && onEdit ? (
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                onClose();
                onEdit(product);
              }}
              className="w-full sm:w-auto"
            >
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Edit Produk
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
