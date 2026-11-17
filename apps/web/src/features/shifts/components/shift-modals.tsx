import type { ShiftDto } from '@istana-buah/shared';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { formatRupiah, formatTransactionDateTime } from '../../pos/utils/formatters';
import { closeShift, openShift } from '../api/shift-api';

const QUICK_OPENING_AMOUNTS = [200_000, 300_000, 500_000, 1_000_000] as const;

export interface OpenShiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpened: (shift: ShiftDto) => void;
}

/**
 * Modal Buka Shift Kasir (M06-002): input kas awal laci sebelum transaksi POS dimulai.
 */
export function OpenShiftModal({ isOpen, onClose, onOpened }: OpenShiftModalProps) {
  const cashId = useId();
  const notesId = useId();
  const [openingCash, setOpeningCash] = useState('500000');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setOpeningCash('500000');
      setNotes('');
      setErrorMessage(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const parsed = Number(openingCash);
    if (openingCash.trim() === '' || !Number.isFinite(parsed) || parsed < 0) {
      setErrorMessage('Nominal kas awal tidak boleh negatif.');
      return;
    }

    setIsSubmitting(true);
    try {
      const shift = await openShift({
        openingCash: parsed,
        notes: notes.trim() || null,
      });
      onOpened(shift);
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
      title="Buka Shift Kasir Baru"
      description="Catat modal uang tunai awal di laci kasir sebelum memulai pelayanan."
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Gagal membuka shift">
            {errorMessage}
          </Alert>
        ) : null}

        <div>
          <label htmlFor={cashId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Kas Awal di Laci (Rp)
          </label>
          <Input
            id={cashId}
            type="number"
            step="1000"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            className="text-right text-lg font-semibold tabular-nums"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {QUICK_OPENING_AMOUNTS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="secondary"
                onClick={() => setOpeningCash(String(preset))}
                className="tabular-nums"
              >
                {formatRupiah(preset)}
              </Button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor={notesId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Catatan Pembukaan (Opsional)
          </label>
          <Input
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contoh: Shift Pagi / pecahan receh lengkap..."
            maxLength={500}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Membuka Shift...' : 'Buka Shift Sekarang'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export interface CloseShiftModalProps {
  isOpen: boolean;
  shift: ShiftDto | null;
  onClose: () => void;
  onClosed: (shift: ShiftDto) => void;
}

/**
 * Modal Tutup Shift & Rekonsiliasi Kasir (M06-002): menampilkan kalkulasi kas vs kas fisik aktual.
 */
export function CloseShiftModal({ isOpen, shift, onClose, onClosed }: CloseShiftModalProps) {
  const cashId = useId();
  const notesId = useId();
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !shift) return;
    const expected = Number(shift.expectedCash ?? shift.openingCash);
    setClosingCash(String(Math.round(expected)));
    setNotes(shift.notes ?? '');
    setErrorMessage(null);
    setIsSubmitting(false);
  }, [isOpen, shift]);

  if (!shift) return null;

  const expectedCash = Number(shift.expectedCash ?? shift.openingCash);
  const parsedClosing = Number(closingCash);
  const hasValidClosing =
    closingCash.trim() !== '' && Number.isFinite(parsedClosing) && parsedClosing >= 0;
  const liveDiff = hasValidClosing ? parsedClosing - expectedCash : 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!hasValidClosing) {
      setErrorMessage('Nominal kas aktual penutupan tidak boleh negatif.');
      return;
    }

    setIsSubmitting(true);
    try {
      const closed = await closeShift(shift.id, {
        closingCash: parsedClosing,
        notes: notes.trim() || null,
      });
      onClosed(closed);
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
      title={`Tutup Shift ${shift.shiftNo}`}
      description={`Kasir: ${shift.cashierName} • Dibuka ${formatTransactionDateTime(shift.openedAt)}`}
      size="lg"
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Gagal menutup shift">
            {errorMessage}
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-3 rounded-xl border border-border-subtle bg-surface-subtle/50 p-4 text-sm tabular-nums sm:grid-cols-2">
          <div className="flex justify-between">
            <span className="text-ink-muted">Kas Awal</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(Number(shift.openingCash))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Penjualan Tunai</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(Number(shift.summary.cashSales))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Penjualan QRIS</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(Number(shift.summary.qrisSales))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Transfer &amp; Campuran</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(
                Number(shift.summary.bankTransferSales) + Number(shift.summary.mixedSales),
              )}
            </span>
          </div>
          <div className="flex justify-between border-t border-border-subtle pt-2 sm:col-span-2">
            <span className="font-semibold text-ink-primary">Estimasi Kas Seharusnya di Laci</span>
            <span className="font-bold text-primary-800">{formatRupiah(expectedCash)}</span>
          </div>
        </div>

        <div>
          <label htmlFor={cashId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Total Kas Aktual di Laci (Rp)
          </label>
          <Input
            id={cashId}
            type="number"
            step="100"
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            className="text-right text-lg font-semibold tabular-nums"
          />
          {hasValidClosing ? (
            <p
              className={cn(
                'mt-1.5 text-right text-sm font-semibold tabular-nums',
                liveDiff < 0
                  ? 'text-semantic-danger-ink'
                  : liveDiff > 0
                    ? 'text-semantic-warning-ink'
                    : 'text-primary-800',
              )}
            >
              Selisih Kas:{' '}
              {liveDiff > 0
                ? `+${formatRupiah(liveDiff)} (Surplus)`
                : liveDiff < 0
                  ? `${formatRupiah(liveDiff)} (Kurang)`
                  : 'Rp 0 (Sesuai)'}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={notesId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            Catatan Penutupan Shift
          </label>
          <Input
            id={notesId}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Keterangan selisih kas atau serah terima..."
            maxLength={500}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Menutup Shift...' : 'Konfirmasi Tutup Shift'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export interface ShiftDetailModalProps {
  isOpen: boolean;
  shift: ShiftDto | null;
  onClose: () => void;
  onRequestCloseShift?: (shift: ShiftDto) => void;
}

export function ShiftDetailModal({
  isOpen,
  shift,
  onClose,
  onRequestCloseShift,
}: ShiftDetailModalProps) {
  if (!shift) return null;

  const diff = Number(shift.cashDifference ?? 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Laporan Shift ${shift.shiftNo}`}
      description={`Kasir: ${shift.cashierName}`}
      size="lg"
    >
      <div className="space-y-4 text-sm tabular-nums">
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-border-subtle bg-surface-subtle/40 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-ink-muted">Waktu Buka</p>
            <p className="font-medium text-ink-primary">
              {formatTransactionDateTime(shift.openedAt)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Waktu Tutup</p>
            <p className="font-medium text-ink-primary">
              {shift.closedAt ? formatTransactionDateTime(shift.closedAt) : 'Masih Berjalan'}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">
              Total Omset ({shift.totalTransactions} transaksi)
            </p>
            <p className="text-base font-bold text-primary-800">
              {formatRupiah(Number(shift.totalSales))}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">Transaksi Void</p>
            <p className="font-medium text-ink-primary">
              {shift.summary.voidedTransactions} transaksi
            </p>
          </div>
        </div>

        <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-ink-secondary">Kas Awal</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(Number(shift.openingCash))}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-ink-secondary">Penjualan Tunai</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(Number(shift.summary.cashSales))}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-ink-secondary">Penjualan QRIS</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(Number(shift.summary.qrisSales))}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-ink-secondary">Transfer Bank</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(Number(shift.summary.bankTransferSales))}
            </span>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <span className="text-ink-secondary">Pembayaran Campuran</span>
            <span className="font-medium text-ink-primary">
              {formatRupiah(Number(shift.summary.mixedSales))}
            </span>
          </div>
          <div className="flex justify-between bg-surface-subtle/50 px-4 py-2.5">
            <span className="font-semibold text-ink-primary">Estimasi Kas Akhir</span>
            <span className="font-semibold text-ink-primary">
              {formatRupiah(Number(shift.expectedCash ?? shift.openingCash))}
            </span>
          </div>
          {shift.closingCash !== null ? (
            <>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-ink-secondary">Kas Aktual Penutupan</span>
                <span className="font-semibold text-ink-primary">
                  {formatRupiah(Number(shift.closingCash))}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-ink-secondary">Selisih Kas</span>
                <span
                  className={cn(
                    'font-bold',
                    diff < 0 ? 'text-semantic-danger-ink' : 'text-primary-800',
                  )}
                >
                  {diff > 0 ? `+${formatRupiah(diff)}` : formatRupiah(diff)}
                </span>
              </div>
            </>
          ) : null}
        </div>

        {shift.notes ? <p className="text-xs text-ink-secondary">Catatan: {shift.notes}</p> : null}

        {shift.status === 'OPEN' && onRequestCloseShift ? (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              onClick={() => {
                onClose();
                onRequestCloseShift(shift);
              }}
            >
              Tutup Shift Ini
            </Button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
