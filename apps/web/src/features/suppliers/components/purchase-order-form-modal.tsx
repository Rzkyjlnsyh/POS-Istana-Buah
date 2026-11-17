import type { ProductDto, PurchaseOrderDto, SupplierDto } from '@istana-buah/shared';
import { Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { normalizeApiError } from '../../../lib/api/api-error';
import { formatRupiah } from '../../pos/utils/formatters';
import { StockProductPicker } from '../../stock/components/stock-product-picker';
import { createPurchaseOrder } from '../api/supplier-api';

interface PoDraftItem {
  product: ProductDto;
  quantity: string;
  unitCost: string;
}

export interface PurchaseOrderFormModalProps {
  isOpen: boolean;
  suppliers: SupplierDto[];
  products: ProductDto[];
  defaultSupplierId?: string;
  onClose: () => void;
  onCreated: (po: PurchaseOrderDto) => void;
}

/**
 * Modal pembuatan Purchase Order baru dengan pemilihan produk dan perhitungan nilai order otomatis.
 */
export function PurchaseOrderFormModal({
  isOpen,
  suppliers,
  products,
  defaultSupplierId = '',
  onClose,
  onCreated,
}: PurchaseOrderFormModalProps) {
  const supplierSelectId = useId();
  const paidInputId = useId();
  const notesInputId = useId();

  const [supplierId, setSupplierId] = useState(defaultSupplierId);
  const [items, setItems] = useState<PoDraftItem[]>([]);
  const [paidAmount, setPaidAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.isActive), [suppliers]);

  useEffect(() => {
    if (!isOpen) return;
    setSupplierId(defaultSupplierId || (activeSuppliers[0]?.id ?? ''));
    setItems([]);
    setPaidAmount('0');
    setNotes('');
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [isOpen, defaultSupplierId, activeSuppliers]);

  const selectedIds = useMemo(() => new Set(items.map((it) => it.product.id)), [items]);

  const handleAddProduct = (prod: ProductDto) => {
    const fallbackCost = prod.productType === 'WEIGHT' ? prod.costPerKg : prod.costPerUnit;
    setItems((prev) => {
      if (prev.some((i) => i.product.id === prod.id)) return prev;
      return [
        ...prev,
        {
          product: prod,
          quantity: prod.productType === 'WEIGHT' ? '10' : '12',
          unitCost: fallbackCost ? String(Math.round(Number(fallbackCost))) : '10000',
        },
      ];
    });
  };

  const totalOrder = useMemo(() => {
    return items.reduce((sum, item) => {
      const q = Number(item.quantity);
      const c = Number(item.unitCost);
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(c) || c < 0) return sum;
      return sum + Math.round(q * c);
    }, 0);
  }, [items]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!supplierId) {
      setErrorMessage('Pilih supplier untuk Purchase Order terlebih dahulu.');
      return;
    }
    if (items.length === 0) {
      setErrorMessage('Tambahkan minimal satu produk ke Purchase Order.');
      return;
    }

    const payloadItems = [];
    for (const item of items) {
      const q = Number(item.quantity);
      const c = Number(item.unitCost);
      if (!Number.isFinite(q) || q <= 0) {
        setErrorMessage(`Kuantitas "${item.product.name}" harus lebih besar dari 0.`);
        return;
      }
      if (!Number.isFinite(c) || c < 0) {
        setErrorMessage(`Harga beli satuan "${item.product.name}" tidak valid.`);
        return;
      }
      payloadItems.push({ productId: item.product.id, quantity: q, unitCost: c });
    }

    const dp = paidAmount.trim() === '' ? 0 : Number(paidAmount);
    if (!Number.isFinite(dp) || dp < 0) {
      setErrorMessage('Nominal pembayaran awal (DP) tidak valid.');
      return;
    }
    if (dp > totalOrder + 0.01) {
      setErrorMessage('Pembayaran awal (DP) tidak boleh melebihi total Purchase Order.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createPurchaseOrder({
        supplierId,
        items: payloadItems,
        paidAmount: dp,
        notes: notes.trim() || null,
      });
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Buat Purchase Order (PO)"
      description="Catat rencana pembelian ke supplier beserta estimasi harga beli satuan."
      size="xl"
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Gagal membuat PO">
            {errorMessage}
          </Alert>
        ) : null}

        <div>
          <label
            htmlFor={supplierSelectId}
            className="mb-1.5 block text-sm font-medium text-ink-primary"
          >
            Pilih Supplier <span className="text-semantic-danger-ink">*</span>
          </label>
          <select
            id={supplierSelectId}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3.5 text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
          >
            <option value="">-- Pilih Supplier --</option>
            {activeSuppliers.map((sup) => (
              <option key={sup.id} value={sup.id}>
                {sup.name}
              </option>
            ))}
          </select>
        </div>

        <StockProductPicker
          products={products}
          excludedProductIds={selectedIds}
          onSelectProduct={handleAddProduct}
          label="Tambah Item Produk ke PO"
        />

        {items.length > 0 ? (
          <div className="max-h-60 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle bg-surface-panel">
            {items.map((item) => {
              const lineTotal = Math.round(Number(item.quantity || 0) * Number(item.unitCost || 0));
              const suffix = item.product.productType === 'WEIGHT' ? 'kg' : 'pcs';
              return (
                <div
                  key={item.product.id}
                  className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-12 sm:items-center"
                >
                  <div className="sm:col-span-4">
                    <p className="text-sm font-medium text-ink-primary">{item.product.name}</p>
                  </div>
                  <div className="flex items-center gap-1.5 sm:col-span-3">
                    <Input
                      type="number"
                      step={item.product.productType === 'WEIGHT' ? '0.001' : '1'}
                      aria-label={`Kuantitas PO ${item.product.name}`}
                      value={item.quantity}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row) =>
                            row.product.id === item.product.id
                              ? { ...row, quantity: e.target.value }
                              : row,
                          ),
                        )
                      }
                      className="text-right tabular-nums"
                    />
                    <span className="text-xs text-ink-muted">{suffix}</span>
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      type="number"
                      step="100"
                      aria-label={`Harga beli PO ${item.product.name}`}
                      value={item.unitCost}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row) =>
                            row.product.id === item.product.id
                              ? { ...row, unitCost: e.target.value }
                              : row,
                          ),
                        )
                      }
                      className="text-right tabular-nums"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-1 sm:col-span-2 sm:justify-end">
                    <span className="text-xs font-semibold tabular-nums text-ink-primary">
                      {formatRupiah(Number.isFinite(lineTotal) ? lineTotal : 0)}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Hapus ${item.product.name} dari PO`}
                      onClick={() =>
                        setItems((prev) => prev.filter((r) => r.product.id !== item.product.id))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-semantic-danger-ink" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor={paidInputId}
              className="mb-1.5 block text-sm font-medium text-ink-primary"
            >
              Pembayaran Awal / DP (Rp)
            </label>
            <Input
              id={paidInputId}
              type="number"
              step="1000"
              min="0"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <div>
            <label
              htmlFor={notesInputId}
              className="mb-1.5 block text-sm font-medium text-ink-primary"
            >
              Catatan PO (Opsional)
            </label>
            <Input
              id={notesInputId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Kiriman kloter pagi..."
              maxLength={500}
            />
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-border-subtle pt-3 sm:flex-row sm:items-center">
          <div className="text-sm tabular-nums">
            <span className="text-ink-secondary">Total Nilai PO: </span>
            <strong className="text-base font-bold text-ink-primary">
              {formatRupiah(totalOrder)}
            </strong>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={isSubmitting || items.length === 0}>
              {isSubmitting ? 'Menyimpan PO...' : 'Simpan Purchase Order'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
