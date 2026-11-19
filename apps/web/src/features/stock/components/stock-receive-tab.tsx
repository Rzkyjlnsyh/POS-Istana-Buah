import type { ProductDto, StockReceiveResultDto } from '@istana-buah/shared';
import { PackageCheck, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { normalizeApiError } from '../../../lib/api/api-error';
import { formatQuantity, formatRupiah } from '../../pos/utils/formatters';
import { receiveStock } from '../api/stock-api';
import { StockProductPicker } from './stock-product-picker';

export interface ReceiveDraftRow {
  product: ProductDto;
  quantity: string;
  unitCost: string;
}

export interface StockReceiveTabProps {
  products: ProductDto[];
  preselectedProduct?: ProductDto | null;
  onPreselectedConsumed?: () => void;
  onStockUpdated: () => void;
}

/**
 * Tab Penerimaan Barang / Restock Gudang (M04-002 / TC-STK-001).
 */
export function StockReceiveTab({
  products,
  preselectedProduct,
  onPreselectedConsumed,
  onStockUpdated,
}: StockReceiveTabProps) {
  const notesInputId = useId();
  const [rows, setRows] = useState<ReceiveDraftRow[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<StockReceiveResultDto | null>(null);

  const addProductRow = (product: ProductDto) => {
    setErrorMessage(null);
    const defaultCost = product.productType === 'WEIGHT' ? product.costPerKg : product.costPerUnit;
    setRows((prev) => {
      if (prev.some((r) => r.product.id === product.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          product,
          quantity: product.productType === 'WEIGHT' ? '10' : '12',
          unitCost: defaultCost ? String(Math.round(Number(defaultCost))) : '',
        },
      ];
    });
  };

  useEffect(() => {
    if (preselectedProduct) {
      addProductRow(preselectedProduct);
      onPreselectedConsumed?.();
    }
  }, [preselectedProduct, onPreselectedConsumed]);

  const selectedIds = useMemo(() => new Set(rows.map((r) => r.product.id)), [rows]);

  const updateRowField = (productId: string, field: 'quantity' | 'unitCost', value: string) => {
    setRows((prev) => prev.map((r) => (r.product.id === productId ? { ...r, [field]: value } : r)));
  };

  const removeRow = (productId: string) => {
    setRows((prev) => prev.filter((r) => r.product.id !== productId));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setLastResult(null);

    if (rows.length === 0) {
      setErrorMessage('Tambahkan minimal satu produk untuk mencatat penerimaan barang.');
      return;
    }

    const itemsPayload = [];
    for (const row of rows) {
      const qty = Number(row.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setErrorMessage(`Kuantitas masuk "${row.product.name}" harus lebih besar dari 0.`);
        return;
      }
      const trimmedCost = row.unitCost.trim();
      const parsedCost = trimmedCost === '' ? undefined : Number(trimmedCost);
      if (parsedCost !== undefined && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
        setErrorMessage(`Harga beli "${row.product.name}" tidak valid.`);
        return;
      }
      itemsPayload.push({
        productId: row.product.id,
        quantity: qty,
        ...(parsedCost !== undefined ? { unitCost: parsedCost } : {}),
      });
    }

    setIsSubmitting(true);
    try {
      const result = await receiveStock({
        items: itemsPayload,
        notes: notes.trim() || null,
      });
      setLastResult(result);
      setRows([]);
      setNotes('');
      onStockUpdated();
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalEstimatedCost = useMemo(() => {
    return rows.reduce((acc, r) => {
      const qty = Number(r.quantity);
      const cost = Number(r.unitCost);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(cost) || cost <= 0) {
        return acc;
      }
      return acc + qty * cost;
    }, 0);
  }, [rows]);

  return (
    <div className="space-y-5">
      {errorMessage ? (
        <Alert variant="danger" title="Gagal mencatat penerimaan">
          {errorMessage}
        </Alert>
      ) : null}

      {lastResult ? (
        <Alert variant="success" title="Penerimaan stok berhasil disimpan">
          <p>{lastResult.totalItems} item stok berhasil ditambahkan ke gudang.</p>
          <ul className="mt-1.5 list-disc pl-4 text-xs tabular-nums">
            {lastResult.movements.map((mov) => (
              <li key={mov.id}>
                {mov.productName}: {formatQuantity(Number(mov.balanceBefore), mov.productType)}{' '}
                &rarr; {formatQuantity(Number(mov.balanceAfter), mov.productType)}
              </li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <StockProductPicker
        products={products}
        excludedProductIds={selectedIds}
        onSelectProduct={addProductRow}
        label="Pilih Produk Masuk Gudang"
      />

      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong bg-surface-subtle/40 px-4 py-8 text-center text-sm text-ink-muted">
            Pilih satu atau beberapa produk di atas untuk mulai mencatat penerimaan barang.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-panel">
            <div className="hidden border-b border-border-subtle bg-surface-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary md:grid md:grid-cols-12 md:gap-3">
              <span className="col-span-3">Produk</span>
              <span className="col-span-2 text-right">Stok Awal</span>
              <span className="col-span-2">Qty Masuk</span>
              <span className="col-span-2">Harga Beli (HPP)</span>
              <span className="col-span-2 text-right">Proyeksi Akhir</span>
              <span className="col-span-1 text-right">Hapus</span>
            </div>

            <div className="divide-y divide-border-subtle">
              {rows.map((row) => {
                const qtyNum = Number(row.quantity);
                const currentNum = Number(row.product.stockQty);
                const projected =
                  Number.isFinite(qtyNum) && qtyNum > 0 ? currentNum + qtyNum : currentNum;
                const unitSuffix = row.product.productType === 'WEIGHT' ? 'kg' : 'pcs';

                return (
                  <div
                    key={row.product.id}
                    className="grid grid-cols-1 gap-3 p-3.5 md:grid-cols-12 md:items-center md:px-4 md:py-3"
                  >
                    <div className="md:col-span-3">
                      <p className="font-semibold text-ink-primary md:font-medium">
                        {row.product.name}
                      </p>
                      <p className="text-xs text-ink-muted tabular-nums md:hidden">
                        Stok awal: {formatQuantity(currentNum, row.product.productType)}
                      </p>
                    </div>

                    <div className="hidden text-right text-sm tabular-nums text-ink-secondary md:col-span-2 md:block">
                      {formatQuantity(currentNum, row.product.productType)}
                    </div>

                    <div className="md:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-ink-secondary md:sr-only">
                        Qty Masuk ({unitSuffix})
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          step={row.product.productType === 'WEIGHT' ? '0.001' : '1'}
                          min={row.product.productType === 'WEIGHT' ? '0.001' : '1'}
                          aria-label={`Kuantitas masuk ${row.product.name}`}
                          value={row.quantity}
                          onChange={(e) =>
                            updateRowField(row.product.id, 'quantity', e.target.value)
                          }
                          className="text-right tabular-nums"
                        />
                        <span className="text-xs font-medium text-ink-muted">{unitSuffix}</span>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-ink-secondary md:sr-only">
                        Harga Beli (HPP)
                      </span>
                      <Input
                        type="number"
                        step="100"
                        min="0"
                        aria-label={`Harga beli satuan ${row.product.name}`}
                        placeholder="Opsional"
                        value={row.unitCost}
                        onChange={(e) => updateRowField(row.product.id, 'unitCost', e.target.value)}
                        className="text-right tabular-nums"
                      />
                    </div>

                    <div className="flex items-center justify-between text-sm tabular-nums md:col-span-2 md:justify-end">
                      <span className="text-xs text-ink-muted md:hidden">Proyeksi Akhir</span>
                      <span className="font-semibold text-primary-800">
                        {formatQuantity(projected, row.product.productType)}
                      </span>
                    </div>

                    <div className="flex justify-end md:col-span-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Hapus ${row.product.name}`}
                        onClick={() => removeRow(row.product.id)}
                      >
                        <Trash2 className="h-4 w-4 text-semantic-danger-ink" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
          <div className="md:col-span-2">
            <label
              htmlFor={notesInputId}
              className="mb-1.5 block text-sm font-medium text-ink-primary"
            >
              Catatan Penerimaan (Opsional)
            </label>
            <Input
              id={notesInputId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Kiriman pagi dari supplier kebun / nomor surat jalan..."
              maxLength={500}
            />
          </div>

          <div className="flex flex-col gap-2 md:items-end">
            {totalEstimatedCost > 0 ? (
              <p className="text-xs font-medium text-ink-secondary tabular-nums">
                Estimasi Nilai Masuk:{' '}
                <span className="font-semibold text-ink-primary">
                  {formatRupiah(totalEstimatedCost)}
                </span>
              </p>
            ) : null}
            <Button
              type="submit"
              disabled={isSubmitting || rows.length === 0}
              className="w-full md:w-auto"
            >
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Penerimaan Stok'}</span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
