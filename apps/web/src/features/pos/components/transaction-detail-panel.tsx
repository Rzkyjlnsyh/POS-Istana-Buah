import type { TransactionDto } from '@istana-buah/shared';
import {
  AlertCircle,
  Ban,
  Check,
  Copy,
  Printer,
  ReceiptText,
  User as UserIcon,
} from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/cn';
import {
  formatPaymentMethodShort,
  formatQuantity,
  formatRupiah,
  formatTransactionDateTime,
  TRANSACTION_STATUS_META,
} from '../utils/formatters';

export interface TransactionDetailPanelProps {
  transaction: TransactionDto | null;
  isLoadingDetail?: boolean;
  canViewCost?: boolean;
  canVoid?: boolean;
  onReprint: (transaction: TransactionDto) => void;
  onVoidTransaction?: (transactionId: string, reason: string) => Promise<void>;
}

/**
 * Panel detail lengkap sebuah transaksi POS (M03-008).
 * - Menampilkan rincian item, kuantitas presisi, ringkasan pembayaran, dan status void.
 * - Menyembunyikan HPP (unitCost) untuk peran CASHIER sesuai NFR-SEC-09.
 * - Menyediakan aksi Cetak Ulang Struk dan pembatalan (Void) khusus MANAGER/OWNER.
 */
export function TransactionDetailPanel({
  transaction,
  isLoadingDetail = false,
  canViewCost = false,
  canVoid = false,
  onReprint,
  onVoidTransaction,
}: TransactionDetailPanelProps) {
  const voidInputId = useId();
  const voidErrorId = useId();

  const [copiedNo, setCopiedNo] = useState(false);
  const [isVoidFormOpen, setIsVoidFormOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);

  // Reset state form void & status salin setiap berganti transaksi terpilih
  useEffect(() => {
    setCopiedNo(false);
    setIsVoidFormOpen(false);
    setVoidReason('');
    setVoidError(null);
    setIsVoiding(false);
  }, [transaction?.id]);

  if (isLoadingDetail && !transaction) {
    return (
      <section
        aria-label="Detail transaksi"
        aria-busy="true"
        className="rounded-2xl border border-border-subtle bg-surface-panel p-5 shadow-panel"
      >
        <div className="space-y-3 animate-pulse">
          <div className="h-6 w-48 rounded-lg bg-surface-subtle" />
          <div className="h-4 w-36 rounded-lg bg-surface-subtle" />
          <div className="border-t border-border-subtle pt-4 space-y-2">
            <div className="h-12 rounded-xl bg-surface-subtle" />
            <div className="h-12 rounded-xl bg-surface-subtle" />
          </div>
        </div>
      </section>
    );
  }

  if (!transaction) {
    return (
      <section
        aria-label="Detail transaksi"
        className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-border-subtle bg-surface-panel p-8 text-center shadow-panel"
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-subtle text-ink-muted">
          <ReceiptText className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-ink-primary">Pilih Transaksi untuk Detail</h2>
        <p className="mt-1 max-w-xs text-sm text-ink-secondary">
          Klik salah satu baris transaksi di daftar untuk meninjau daftar barang, rincian bayar, dan
          mencetak ulang struk.
        </p>
      </section>
    );
  }

  const statusMeta = TRANSACTION_STATUS_META[transaction.status];
  const subtotalNum = Number(transaction.subtotal);
  const discountNum = Number(transaction.discountAmount);
  const taxNum = Number(transaction.taxAmount);
  const totalNum = Number(transaction.totalAmount);
  const paidNum = Number(transaction.amountPaid);
  const changeNum = Number(transaction.changeAmount);
  const allowVoidAction =
    canVoid && transaction.status === 'COMPLETED' && Boolean(onVoidTransaction);

  const handleCopyTrxNo = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(transaction.transactionNo);
      }
    } catch {
      // Abaikan jika clipboard ditolak
    }
    setCopiedNo(true);
    setTimeout(() => setCopiedNo(false), 2000);
  };

  const handleConfirmVoid = async () => {
    const trimmed = voidReason.trim();
    if (trimmed.length < 3) {
      setVoidError('Alasan pembatalan wajib diisi minimal 3 karakter.');
      return;
    }
    if (!onVoidTransaction) return;

    setVoidError(null);
    setIsVoiding(true);
    try {
      await onVoidTransaction(transaction.id, trimmed);
      setIsVoidFormOpen(false);
      setVoidReason('');
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal membatalkan transaksi. Periksa izin akun dan koneksi.';
      setVoidError(msg);
    } finally {
      setIsVoiding(false);
    }
  };

  return (
    <section
      aria-label={`Detail transaksi ${transaction.transactionNo}`}
      aria-busy={isLoadingDetail || isVoiding}
      className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-panel shadow-panel"
    >
      {/* Header Detail */}
      <div className="border-b border-border-subtle bg-surface-subtle/60 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-ink-primary tabular-nums">
                {transaction.transactionNo}
              </h2>
              <button
                type="button"
                onClick={() => void handleCopyTrxNo()}
                aria-label={`Salin nomor transaksi ${transaction.transactionNo}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-subtle bg-surface-panel text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-primary-700"
              >
                {copiedNo ? (
                  <Check className="h-4 w-4 text-primary-700" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-0.5 text-xs text-ink-secondary tabular-nums">
              {formatTransactionDateTime(transaction.transactedAt)}
            </p>
          </div>

          <span
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold',
              statusMeta.badgeClass,
            )}
          >
            {statusMeta.label}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-secondary">
          <span className="inline-flex items-center gap-1.5">
            <UserIcon className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
            Kasir:{' '}
            <strong className="font-semibold text-ink-primary">{transaction.cashierName}</strong>
          </span>
          <span>
            Metode:{' '}
            <strong className="font-semibold text-ink-primary">
              {formatPaymentMethodShort(transaction.paymentMethod)}
            </strong>
          </span>
        </div>
      </div>

      {/* Info Pembatalan (Void) atau Catatan */}
      {transaction.status === 'VOIDED' ? (
        <div
          role="note"
          className="border-b border-semantic-danger-border bg-semantic-danger-bg px-5 py-3 text-xs text-semantic-danger-ink"
        >
          <p className="font-semibold">
            Transaksi ini telah dibatalkan (Void) — stok telah dikembalikan.
          </p>
          {transaction.voidReason ? (
            <p className="mt-0.5">Alasan: {transaction.voidReason}</p>
          ) : null}
          {transaction.voidedAt ? (
            <p className="mt-0.5 tabular-nums">
              Waktu void: {formatTransactionDateTime(transaction.voidedAt)}
            </p>
          ) : null}
        </div>
      ) : null}

      {transaction.notes ? (
        <div className="border-b border-border-subtle bg-surface-subtle/40 px-5 py-2.5 text-xs text-ink-secondary">
          <span className="font-semibold text-ink-primary">Catatan: </span>
          <span>{transaction.notes}</span>
        </div>
      ) : null}

      {/* Daftar Item Belanja */}
      <div className="border-b border-border-subtle px-5 py-4">
        <div className="mb-2.5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-primary">Daftar Barang</h3>
          <span className="text-xs text-ink-muted tabular-nums">
            {transaction.items.length} item
          </span>
        </div>

        {transaction.items.length === 0 ? (
          <p className="py-3 text-xs text-ink-muted">Rincian item belum dimuat.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {transaction.items.map((item) => {
              const qtyNum = Number(item.quantity);
              const priceNum = Number(item.unitPrice);
              const itemDiscNum = Number(item.discountAmount);
              const lineTotalNum = Number(item.lineTotal);
              const showCost = canViewCost && item.unitCost !== null && item.unitCost !== undefined;

              return (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-primary">{item.productName}</p>
                    <p className="text-xs text-ink-secondary tabular-nums">
                      {formatQuantity(qtyNum, item.productType)} × {formatRupiah(priceNum)}
                      {itemDiscNum > 0 ? ` · Diskon ${formatRupiah(itemDiscNum)}` : ''}
                    </p>
                    {showCost ? (
                      <p className="text-xs text-ink-muted tabular-nums">
                        HPP satuan: {formatRupiah(Number(item.unitCost))}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm font-bold text-ink-primary tabular-nums">
                    {formatRupiah(lineTotalNum)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Ringkasan Nominal Pembayaran */}
      <div className="border-b border-border-subtle bg-surface-subtle/30 px-5 py-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-ink-secondary">
          <span>Subtotal</span>
          <span className="font-medium text-ink-primary tabular-nums">
            {formatRupiah(subtotalNum)}
          </span>
        </div>
        {discountNum > 0 ? (
          <div className="flex justify-between text-primary-700">
            <span>Diskon Transaksi</span>
            <span className="font-semibold tabular-nums">-{formatRupiah(discountNum)}</span>
          </div>
        ) : null}
        {taxNum > 0 ? (
          <div className="flex justify-between text-ink-secondary">
            <span>Pajak (PPN)</span>
            <span className="font-medium text-ink-primary tabular-nums">
              {formatRupiah(taxNum)}
            </span>
          </div>
        ) : null}

        <div className="flex justify-between border-t border-border-subtle pt-2.5 text-base font-bold text-ink-primary">
          <span>Total Belanja</span>
          <span className="tabular-nums">{formatRupiah(totalNum)}</span>
        </div>

        <div className="flex justify-between text-xs text-ink-secondary">
          <span>Uang Dibayar</span>
          <span className="font-semibold text-ink-primary tabular-nums">
            {formatRupiah(paidNum)}
          </span>
        </div>
        <div className="flex justify-between text-xs text-primary-700">
          <span>Kembalian</span>
          <span className="font-bold tabular-nums">{formatRupiah(changeNum)}</span>
        </div>
      </div>

      {/* Form Konfirmasi Void Inline (Khusus MANAGER / OWNER) */}
      {isVoidFormOpen && allowVoidAction ? (
        <div className="border-b border-semantic-danger-border bg-semantic-danger-bg/60 px-5 py-4 space-y-3">
          <div className="flex items-start gap-2 text-xs text-semantic-danger-ink">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="font-semibold">
              Membatalkan transaksi akan mengembalikan stok barang secara otomatis dan dicatat di
              audit log.
            </p>
          </div>

          <div>
            <label
              htmlFor={voidInputId}
              className="block text-xs font-semibold text-ink-primary mb-1"
            >
              Alasan Pembatalan (Wajib)
            </label>
            <input
              id={voidInputId}
              type="text"
              value={voidReason}
              disabled={isVoiding}
              onChange={(e) => {
                setVoidReason(e.target.value);
                if (voidError) setVoidError(null);
              }}
              aria-invalid={voidError ? 'true' : undefined}
              aria-describedby={voidError ? voidErrorId : undefined}
              placeholder="Cth: Salah input timbangan buah oleh kasir"
              className="h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            {voidError ? (
              <p
                id={voidErrorId}
                role="alert"
                className="mt-1 text-xs font-semibold text-semantic-danger-ink"
              >
                {voidError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isVoiding}
              onClick={() => {
                setIsVoidFormOpen(false);
                setVoidError(null);
              }}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              isLoading={isVoiding}
              loadingText="Membatalkan…"
              onClick={() => void handleConfirmVoid()}
            >
              Konfirmasi Void Transaksi
            </Button>
          </div>
        </div>
      ) : null}

      {/* Tombol Aksi Utama */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Button
          type="button"
          variant="primary"
          onClick={() => onReprint(transaction)}
          className="flex-1 sm:flex-initial"
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          <span>Cetak Ulang Struk</span>
        </Button>

        {allowVoidAction && !isVoidFormOpen ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setIsVoidFormOpen(true)}
            className="w-full sm:w-auto"
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            <span>Batalkan (Void)</span>
          </Button>
        ) : null}
      </div>
    </section>
  );
}
