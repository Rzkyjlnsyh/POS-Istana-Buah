import { CheckCircle2, Plus, Printer } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { TransactionDto } from '@istana-buah/shared';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { formatRupiah } from '../utils/formatters';

export interface PosPaymentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionDto | null;
  onPrintReceipt: (transaction: TransactionDto) => void;
  onNewTransaction: () => void;
}

/**
 * Modal konfirmasi sukses pembayaran transaksi POS (M03-006).
 * Menampilkan nomor transaksi unik, rincian pembayaran, kembalian tunai,
 * serta tombol aksi cepat untuk cetak struk dan memulai transaksi baru.
 */
export function PosPaymentSuccessModal({
  isOpen,
  onClose,
  transaction,
  onPrintReceipt,
  onNewTransaction,
}: PosPaymentSuccessModalProps) {
  const newTxBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Otomatis fokus pada tombol "Transaksi Baru" untuk efisiensi kasir
    const timer = setTimeout(() => {
      newTxBtnRef.current?.focus();
    }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNewTransaction();
      } else if (e.key === 'p' || e.key === 'P') {
        if (transaction) {
          e.preventDefault();
          onPrintReceipt(transaction);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, transaction, onNewTransaction, onPrintReceipt]);

  if (!transaction) return null;

  const totalAmountNum = Number(transaction.totalAmount);
  const amountPaidNum = Number(transaction.amountPaid);
  const changeAmountNum = Number(transaction.changeAmount);
  const isCash = transaction.paymentMethod === 'CASH';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transaksi Berhasil Disimpan"
      size="default"
      className="text-center"
    >
      <div className="flex flex-col items-center">
        {/* Ikon Sukses */}
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3 shadow-inner">
          <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
        </div>

        <p className="text-xs font-semibold text-ink-secondary">Nomor Transaksi:</p>
        <div className="mt-1 inline-flex items-center rounded-xl border border-primary-500/30 bg-primary-50 px-3.5 py-1 text-sm font-black tracking-wider text-primary-900">
          {transaction.transactionNo}
        </div>

        {/* Kembalian Tunai (Highlight Menonjol jika Cash) */}
        {isCash ? (
          <div className="mt-5 w-full rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 p-4 shadow-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
              Uang Kembalian Pelanggan
            </span>
            <p className="mt-1 text-3xl font-black text-emerald-700">
              {formatRupiah(changeAmountNum)}
            </p>
          </div>
        ) : null}

        {/* Ringkasan Finansial */}
        <div className="mt-4 w-full divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-subtle p-3.5 text-xs text-ink-secondary">
          <div className="flex justify-between py-1.5">
            <span>Metode Pembayaran</span>
            <span className="font-bold text-ink-primary">
              {transaction.paymentMethod === 'CASH'
                ? 'Tunai (Cash)'
                : transaction.paymentMethod === 'QRIS'
                  ? 'QRIS Digital'
                  : 'Transfer Bank'}
            </span>
          </div>

          <div className="flex justify-between py-1.5">
            <span>Total Tagihan</span>
            <span className="font-bold text-ink-primary">{formatRupiah(totalAmountNum)}</span>
          </div>

          <div className="flex justify-between py-1.5">
            <span>Uang Diterima</span>
            <span className="font-bold text-ink-primary">{formatRupiah(amountPaidNum)}</span>
          </div>

          {!isCash ? (
            <div className="flex justify-between py-1.5">
              <span>Kembalian</span>
              <span className="font-bold text-ink-primary">{formatRupiah(changeAmountNum)}</span>
            </div>
          ) : null}

          {transaction.items && transaction.items.length > 0 ? (
            <div className="flex justify-between py-1.5 text-ink-muted">
              <span>Jumlah Item</span>
              <span>{transaction.items.length} macam barang</span>
            </div>
          ) : null}
        </div>

        {/* Tombol Aksi */}
        <div className="mt-6 flex w-full flex-col gap-2.5 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onPrintReceipt(transaction)}
            className="flex-1 justify-center py-2.5 text-xs font-bold"
          >
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            <span>Cetak Struk (P)</span>
          </Button>

          <Button
            ref={newTxBtnRef}
            type="button"
            variant="primary"
            onClick={onNewTransaction}
            className="flex-1 justify-center py-2.5 text-xs font-bold"
          >
            <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
            <span>Transaksi Baru (Enter)</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
