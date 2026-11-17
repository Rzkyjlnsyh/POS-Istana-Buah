import type { PurchaseOrderDto } from '@istana-buah/shared';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import {
  formatQuantity,
  formatRupiah,
  formatTransactionDateTime,
} from '../../pos/utils/formatters';
import { receiveStock } from '../../stock/api/stock-api';
import { cancelPurchaseOrder, payPurchaseOrder } from '../api/supplier-api';
import { PO_STATUS_META } from '../utils/supplier-meta';

export interface PurchaseOrderPayModalProps {
  isOpen: boolean;
  purchaseOrder: PurchaseOrderDto | null;
  onClose: () => void;
  onUpdated: (po: PurchaseOrderDto) => void;
}

export function PurchaseOrderPayModal({
  isOpen,
  purchaseOrder,
  onClose,
  onUpdated,
}: PurchaseOrderPayModalProps) {
  const amountId = useId();
  const notesId = useId();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !purchaseOrder) return;
    setAmount(String(Math.round(Number(purchaseOrder.remainingDebt))));
    setNotes('');
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [isOpen, purchaseOrder]);

  if (!purchaseOrder) return null;

  const remainingDebt = Number(purchaseOrder.remainingDebt);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const num = Number(amount);
    if (!Number.isFinite(num) || num <= 0) {
      setErrorMessage('Nominal pembayaran harus lebih besar dari 0.');
      return;
    }
    if (num > remainingDebt + 0.01) {
      setErrorMessage('Nominal pembayaran melebihi sisa hutang PO.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await payPurchaseOrder(purchaseOrder.id, {
        amount: num,
        notes: notes.trim() || null,
      });
      onUpdated(updated);
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
      title={`Bayar Hutang ${purchaseOrder.referenceNo ?? 'PO'}`}
      description={`Supplier: ${purchaseOrder.supplierName}`}
      size="sm"
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Pembayaran gagal">
            {errorMessage}
          </Alert>
        ) : null}

        <div className="rounded-xl border border-border-subtle bg-surface-subtle/50 p-3 text-sm tabular-nums">
          <div className="flex justify-between">
            <span className="text-ink-muted">Total PO</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(Number(purchaseOrder.totalAmount))}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-ink-muted">Sisa Hutang</span>
            <span className="font-semibold text-semantic-danger-ink">
              {formatRupiah(remainingDebt)}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor={amountId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Nominal Pelunasan (Rp)
          </label>
          <Input
            id={amountId}
            type="number"
            step="100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="tabular-nums"
          />
        </div>

        <div>
          <label htmlFor={notesId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Catatan Pembayaran
          </label>
          <Input
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Transfer BCA / tunai..."
            maxLength={255}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Memproses...' : 'Catat Pembayaran'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export interface PurchaseOrderReceiveModalProps {
  isOpen: boolean;
  purchaseOrder: PurchaseOrderDto | null;
  onClose: () => void;
  onReceived: () => void;
}

export function PurchaseOrderReceiveModal({
  isOpen,
  purchaseOrder,
  onClose,
  onReceived,
}: PurchaseOrderReceiveModalProps) {
  const notesId = useId();
  const [drafts, setDrafts] = useState<
    Array<{
      productId: string;
      productName: string;
      productType: 'WEIGHT' | 'UNIT';
      quantity: string;
      unitCost: string;
    }>
  >([]);
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !purchaseOrder) return;
    setDrafts(
      purchaseOrder.items.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        productType: it.productType,
        quantity: String(Number(it.quantity)),
        unitCost: String(Math.round(Number(it.unitCost))),
      })),
    );
    setNotes('');
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [isOpen, purchaseOrder]);

  if (!purchaseOrder) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const payloadItems = [];
    for (const d of drafts) {
      const q = Number(d.quantity);
      const c = Number(d.unitCost);
      if (!Number.isFinite(q) || q < 0) {
        setErrorMessage(`Kuantitas terima "${d.productName}" tidak valid.`);
        return;
      }
      if (q > 0) {
        payloadItems.push({
          productId: d.productId,
          quantity: q,
          ...(Number.isFinite(c) && c >= 0 ? { unitCost: c } : {}),
        });
      }
    }

    if (payloadItems.length === 0) {
      setErrorMessage('Minimal satu item harus memiliki kuantitas diterima > 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      await receiveStock({
        purchaseOrderId: purchaseOrder.id,
        supplierId: purchaseOrder.supplierId,
        items: payloadItems,
        notes: notes.trim() || null,
      });
      onReceived();
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
      title={`Terima Barang ${purchaseOrder.referenceNo ?? 'PO'}`}
      description={`Supplier: ${purchaseOrder.supplierName}. Stok gudang akan bertambah otomatis.`}
      size="lg"
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Penerimaan PO gagal">
            {errorMessage}
          </Alert>
        ) : null}

        <div className="max-h-64 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle">
          {drafts.map((d) => (
            <div
              key={d.productId}
              className="grid grid-cols-1 gap-2.5 p-3 sm:grid-cols-12 sm:items-center"
            >
              <div className="sm:col-span-5">
                <p className="text-sm font-medium text-ink-primary">{d.productName}</p>
              </div>
              <div className="flex items-center gap-1.5 sm:col-span-3">
                <Input
                  type="number"
                  step={d.productType === 'WEIGHT' ? '0.001' : '1'}
                  aria-label={`Qty diterima ${d.productName}`}
                  value={d.quantity}
                  onChange={(e) =>
                    setDrafts((prev) =>
                      prev.map((row) =>
                        row.productId === d.productId ? { ...row, quantity: e.target.value } : row,
                      ),
                    )
                  }
                  className="text-right tabular-nums"
                />
                <span className="text-xs text-ink-muted">
                  {d.productType === 'WEIGHT' ? 'kg' : 'pcs'}
                </span>
              </div>
              <div className="sm:col-span-4">
                <Input
                  type="number"
                  step="100"
                  aria-label={`HPP terima ${d.productName}`}
                  value={d.unitCost}
                  onChange={(e) =>
                    setDrafts((prev) =>
                      prev.map((row) =>
                        row.productId === d.productId ? { ...row, unitCost: e.target.value } : row,
                      ),
                    )
                  }
                  className="text-right tabular-nums"
                />
              </div>
            </div>
          ))}
        </div>

        <div>
          <label htmlFor={notesId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Catatan Penerimaan (Opsional)
          </label>
          <Input
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Diterima lengkap kondisi segar..."
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Menyimpan...' : 'Konfirmasi Terima Stok'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export interface PurchaseOrderDetailModalProps {
  isOpen: boolean;
  purchaseOrder: PurchaseOrderDto | null;
  onClose: () => void;
  onCancelled: (po: PurchaseOrderDto) => void;
}

export function PurchaseOrderDetailModal({
  isOpen,
  purchaseOrder,
  onClose,
  onCancelled,
}: PurchaseOrderDetailModalProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    setErrorMessage(null);
    setIsCancelling(false);
  }, [isOpen, purchaseOrder?.id]);

  if (!purchaseOrder) return null;

  const meta = PO_STATUS_META[purchaseOrder.status];

  const handleCancel = async () => {
    setIsCancelling(true);
    setErrorMessage(null);
    try {
      const updated = await cancelPurchaseOrder(purchaseOrder.id);
      onCancelled(updated);
      onClose();
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Detail PO ${purchaseOrder.referenceNo ?? ''}`}
      size="lg"
    >
      <div className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Gagal membatalkan PO">
            {errorMessage}
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-2 rounded-xl border border-border-subtle bg-surface-subtle/40 p-3.5 text-sm sm:grid-cols-2">
          <div>
            <span className="text-ink-muted">Supplier:</span>{' '}
            <strong className="text-ink-primary">{purchaseOrder.supplierName}</strong>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-ink-muted">Status:</span>
            <span
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                meta.badgeClass,
              )}
            >
              {meta.label}
            </span>
          </div>
          <div className="text-xs text-ink-muted">
            Dibuat: {formatTransactionDateTime(purchaseOrder.createdAt)} oleh{' '}
            {purchaseOrder.createdByName ?? '-'}
          </div>
          {purchaseOrder.deliveredAt ? (
            <div className="text-xs text-ink-muted">
              Diterima: {formatTransactionDateTime(purchaseOrder.deliveredAt)}
            </div>
          ) : null}
        </div>

        <div className="max-h-60 overflow-y-auto rounded-xl border border-border-subtle">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border-subtle bg-surface-subtle text-xs font-semibold text-ink-secondary">
              <tr>
                <th scope="col" className="px-3 py-2.5">
                  Produk
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Kuantitas
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Harga Beli
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {purchaseOrder.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 font-medium text-ink-primary">{it.productName}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                    {formatQuantity(Number(it.quantity), it.productType)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                    {formatRupiah(Number(it.unitCost))}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink-primary">
                    {formatRupiah(Number(it.totalCost))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-border-subtle pt-3 sm:flex-row sm:items-center">
          <div className="space-x-4 text-sm tabular-nums">
            <span>
              Total: <strong>{formatRupiah(Number(purchaseOrder.totalAmount))}</strong>
            </span>
            <span>
              Terbayar: <strong>{formatRupiah(Number(purchaseOrder.paidAmount))}</strong>
            </span>
            <span
              className={
                Number(purchaseOrder.remainingDebt) > 0
                  ? 'text-semantic-danger-ink'
                  : 'text-primary-800'
              }
            >
              Sisa: <strong>{formatRupiah(Number(purchaseOrder.remainingDebt))}</strong>
            </span>
          </div>
          {purchaseOrder.status === 'PENDING' ? (
            <Button
              type="button"
              variant="destructive"
              disabled={isCancelling}
              onClick={() => void handleCancel()}
            >
              {isCancelling ? 'Membatalkan...' : 'Batalkan PO'}
            </Button>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
