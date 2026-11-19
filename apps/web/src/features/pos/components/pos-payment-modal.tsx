import {
  AlertCircle,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  QrCode,
  Send,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CreateTransactionInput, PaymentMethod, TransactionDto } from '@istana-buah/shared';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import {
  OfflineStockError,
  isNetworkFailureError,
  saveOfflineTransaction,
} from '../../../lib/db/offline-transaction-service';
import { useAuthStore } from '../../../stores/auth-store';
import { createTransaction } from '../api/transaction-api';
import { usePosCartStore } from '../stores/pos-cart-store';
import { formatRupiah } from '../utils/formatters';
import { QrisQrCode } from './qris-qr-code';

export interface PosPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMethod?: PaymentMethod;
  activeShiftId?: string | null;
  onSuccess: (transaction: TransactionDto) => void;
}

interface BankAccountInfo {
  code: string;
  name: string;
  accountNumber: string;
  accountName: string;
}

const BANK_ACCOUNTS: BankAccountInfo[] = [
  {
    code: 'BCA',
    name: 'Bank Central Asia',
    accountNumber: '1234567890',
    accountName: 'PT Istana Buah Semarang',
  },
  {
    code: 'MANDIRI',
    name: 'Bank Mandiri',
    accountNumber: '1370012345678',
    accountName: 'PT Istana Buah Semarang',
  },
  {
    code: 'BRI',
    name: 'Bank Rakyat Indonesia',
    accountNumber: '002101000123456',
    accountName: 'PT Istana Buah Semarang',
  },
];

/**
 * Modal proses checkout pembayaran POS (M03-006):
 * - Tab Tunai (CASH): Uang pas, preset pecahan nominal, live kembalian, dan numpad
 * - Tab QRIS: Tampilan QR statis/dinamis, timer 5 menit, konfirmasi pembayaran
 * - Tab Transfer Bank: Salin nomor rekening, catatan referensi, konfirmasi
 */
export function PosPaymentModal({
  isOpen,
  onClose,
  initialMethod = 'CASH',
  activeShiftId = null,
  onSuccess,
}: PosPaymentModalProps) {
  const user = useAuthStore((state) => state.user);
  const items = usePosCartStore((state) => state.items);
  const globalDiscount = usePosCartStore((state) => state.globalDiscount);
  const getTotalAmount = usePosCartStore((state) => state.getTotalAmount);
  const getSubtotal = usePosCartStore((state) => state.getSubtotal);

  const subtotal = getSubtotal();
  const totalPayable = getTotalAmount();

  const [activeMethod, setActiveMethod] = useState<PaymentMethod>(initialMethod);
  const [cashInputString, setCashInputString] = useState<string>('');
  const [selectedBank, setSelectedBank] = useState<string>('BCA');
  const [transferReference, setTransferReference] = useState<string>('');
  const [copiedBankCode, setCopiedBankCode] = useState<string | null>(null);
  const [qrisTimerSeconds, setQrisTimerSeconds] = useState<number>(300); // 5 menit
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cashInputRef = useRef<HTMLInputElement>(null);

  // Inisialisasi ulang ketika modal dibuka
  useEffect(() => {
    if (isOpen) {
      setActiveMethod(initialMethod);
      setCashInputString('');
      setTransferReference('');
      setCopiedBankCode(null);
      setQrisTimerSeconds(300);
      setErrorMessage(null);
      setIsSubmitting(false);

      // Fokus pada input pembayaran tunai jika metode awal CASH
      if (initialMethod === 'CASH') {
        const timer = setTimeout(() => {
          cashInputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [isOpen, initialMethod]);

  // Timer QRIS 5 menit countdown
  useEffect(() => {
    if (!isOpen || activeMethod !== 'QRIS') return;

    const interval = setInterval(() => {
      setQrisTimerSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, activeMethod]);

  // Nominal uang tunai yang diinput
  const amountPaidCash = useMemo(() => {
    const parsed = parseInt(cashInputString.replace(/\D/g, ''), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [cashInputString]);

  // Perhitungan kembalian dan kekurangan
  const changeAmount = Math.max(0, amountPaidCash - totalPayable);
  const shortageAmount = Math.max(0, totalPayable - amountPaidCash);

  // Rekomendasi nominal pecahan cepat (Fast Cash Presets)
  const cashPresets = useMemo(() => {
    const presets: number[] = [totalPayable]; // Uang Pas selalu ada

    const roundUpTo = (val: number, step: number) => {
      const remainder = val % step;
      return remainder === 0 ? val : val + (step - remainder);
    };

    const next10k = roundUpTo(totalPayable, 10000);
    const next20k = roundUpTo(totalPayable, 20000);
    const next50k = roundUpTo(totalPayable, 50000);
    const next100k = roundUpTo(totalPayable, 100000);

    [next10k, next20k, next50k, next100k, 50000, 100000, 200000].forEach((nominal) => {
      if (nominal >= totalPayable && !presets.includes(nominal)) {
        presets.push(nominal);
      }
    });

    return presets.slice(0, 5); // Ambil maksimal 5 tombol preset
  }, [totalPayable]);

  // Handler Numpad Tunai
  const handleNumpadPress = (digit: string) => {
    setErrorMessage(null);
    if (digit === 'C') {
      setCashInputString('');
    } else if (digit === 'BACKSPACE') {
      setCashInputString((prev) => prev.slice(0, -1));
    } else if (digit === '00' || digit === '000') {
      if (!cashInputString) return;
      setCashInputString((prev) => prev + digit);
    } else {
      setCashInputString((prev) => prev + digit);
    }
  };

  // Handler Salin Nomor Rekening
  const handleCopyAccountNumber = async (accNumber: string, bankCode: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(accNumber);
      }
    } catch {
      // Abaikan jika izin clipboard ditolak browser
    }
    setCopiedBankCode(bankCode);
    setTimeout(() => setCopiedBankCode(null), 2000);
  };

  // Submit Pembayaran Transaksi
  const handleProcessPayment = useCallback(async () => {
    if (items.length === 0) {
      setErrorMessage('Keranjang belanja kosong');
      return;
    }

    let finalAmountPaid = 0;
    if (activeMethod === 'CASH') {
      if (amountPaidCash < totalPayable) {
        setErrorMessage(
          `Nominal tunai kurang ${formatRupiah(shortageAmount)}. Pembayaran belum mencukupi.`,
        );
        return;
      }
      finalAmountPaid = amountPaidCash;
    } else {
      // Untuk QRIS dan Transfer Bank, nominal bayar = total belanja
      finalAmountPaid = totalPayable;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const transactionPayload: CreateTransactionInput = {
      clientId,
      paymentMethod: activeMethod,
      amountPaid: finalAmountPaid,
      discountAmount: globalDiscount > 0 ? globalDiscount : undefined,
      notes:
        activeMethod === 'BANK_TRANSFER' && transferReference.trim()
          ? `Transfer [${selectedBank}]: ${transferReference.trim()}`
          : undefined,
      items: items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount > 0 ? item.discountAmount : undefined,
      })),
    };

    try {
      const saveOfflineFallback = async () => {
        const saved = await saveOfflineTransaction({
          input: transactionPayload,
          cartItems: items.map((item) => ({
            productId: item.productId,
            name: item.name,
            productType: item.productType,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount,
          })),
          cashierId: user?.id ?? 'offline-cashier',
          cashierName: user?.fullName ?? 'Kasir Offline',
          shiftId: activeShiftId,
        });
        onSuccess(saved.transaction);
        onClose();
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await saveOfflineFallback();
        return;
      }

      try {
        const createdTx = await createTransaction(transactionPayload);
        onSuccess(createdTx);
        onClose();
      } catch (err: unknown) {
        if (isNetworkFailureError(err)) {
          await saveOfflineFallback();
          return;
        }
        throw err;
      }
    } catch (err: unknown) {
      if (err instanceof OfflineStockError) {
        setErrorMessage(err.message);
      } else {
        const errorMsg =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
            : null;
        setErrorMessage(
          errorMsg ?? 'Gagal memproses transaksi. Periksa koneksi internet atau stok.',
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    items,
    activeMethod,
    amountPaidCash,
    totalPayable,
    shortageAmount,
    globalDiscount,
    transferReference,
    selectedBank,
    user?.id,
    user?.fullName,
    activeShiftId,
    onSuccess,
    onClose,
  ]);

  // Listener Shortcut Keyboard F1 (Cash), F2 (QRIS), F3 (Transfer), Enter
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setActiveMethod('CASH');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setActiveMethod('QRIS');
      } else if (e.key === 'F3') {
        e.preventDefault();
        setActiveMethod('BANK_TRANSFER');
      } else if (e.key === 'Enter' && !isSubmitting) {
        // Jangan submit jika sedang mengetik di input transfer
        if (document.activeElement?.id === 'transfer-ref-input') return;
        e.preventDefault();
        void handleProcessPayment();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, handleProcessPayment]);

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const isPaymentValid =
    activeMethod === 'CASH' ? amountPaidCash >= totalPayable && totalPayable > 0 : totalPayable > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Proses Pembayaran"
      description={`Total tagihan belanja: ${formatRupiah(totalPayable)}`}
      size="xl"
      className="max-h-[92vh] overflow-y-auto"
    >
      {/* Banner Pesan Error */}
      {errorMessage ? (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-xl border border-semantic-danger-border bg-semantic-danger-bg p-3 text-xs font-semibold text-semantic-danger-ink"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {/* Header Ringkasan Tagihan */}
      <div className="mb-4 grid grid-cols-1 gap-2 rounded-2xl border border-border-subtle bg-surface-subtle p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium text-ink-secondary">Subtotal ({items.length} item)</p>
          <p className="text-sm font-bold text-ink-primary">{formatRupiah(subtotal)}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-ink-secondary">Total Diskon</p>
          <p className="text-sm font-bold text-emerald-700">
            {globalDiscount > 0 ? `-${formatRupiah(globalDiscount)}` : 'Rp 0'}
          </p>
        </div>
        <div className="border-t border-border-subtle pt-2 sm:border-t-0 sm:pt-0">
          <p className="text-xs font-bold text-primary-800">Total Harus Dibayar</p>
          <p className="text-lg font-black text-primary-900 sm:text-xl">
            {formatRupiah(totalPayable)}
          </p>
        </div>
      </div>

      {/* Tab Switcher Metode Pembayaran */}
      <div
        className="mb-6 flex rounded-xl border border-border-subtle bg-surface-subtle p-1"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeMethod === 'CASH'}
          onClick={() => setActiveMethod('CASH')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
            activeMethod === 'CASH'
              ? 'bg-surface-panel text-primary-800 shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          <Banknote className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <span>Tunai (Cash)</span>
          <kbd className="hidden rounded bg-neutral-200/60 px-1 py-0.5 text-xs text-ink-muted sm:inline-block">
            F1
          </kbd>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeMethod === 'QRIS'}
          onClick={() => setActiveMethod('QRIS')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
            activeMethod === 'QRIS'
              ? 'bg-surface-panel text-primary-800 shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          <QrCode className="h-4 w-4 text-rose-600" aria-hidden="true" />
          <span>QRIS</span>
          <kbd className="hidden rounded bg-neutral-200/60 px-1 py-0.5 text-xs text-ink-muted sm:inline-block">
            F2
          </kbd>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeMethod === 'BANK_TRANSFER'}
          onClick={() => setActiveMethod('BANK_TRANSFER')}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-bold transition-all ${
            activeMethod === 'BANK_TRANSFER'
              ? 'bg-surface-panel text-primary-800 shadow-sm'
              : 'text-ink-secondary hover:text-ink-primary'
          }`}
        >
          <CreditCard className="h-4 w-4 text-blue-700" aria-hidden="true" />
          <span>Transfer Bank</span>
          <kbd className="hidden rounded bg-neutral-200/60 px-1 py-0.5 text-xs text-ink-muted sm:inline-block">
            F3
          </kbd>
        </button>
      </div>

      {/* Konten Tab 1: Pembayaran Tunai */}
      {activeMethod === 'CASH' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Input & Preset Uang Tunai (7 kolom) */}
            <div className="space-y-3 lg:col-span-7">
              <div>
                <label
                  htmlFor="cash-amount-input"
                  className="block text-xs font-bold text-ink-primary mb-1"
                >
                  Uang Diterima dari Pelanggan (Rp)
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-ink-muted">
                    Rp
                  </span>
                  <input
                    ref={cashInputRef}
                    id="cash-amount-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={amountPaidCash > 0 ? amountPaidCash.toLocaleString('id-ID') : ''}
                    onChange={(e) => {
                      const clean = e.target.value.replace(/\D/g, '');
                      setCashInputString(clean);
                      setErrorMessage(null);
                    }}
                    className="h-12 w-full rounded-xl border border-border-strong bg-surface-panel pl-10 pr-4 text-lg font-black text-ink-primary placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
              </div>

              {/* Tombol Pecahan Cepat (Fast Cash Presets) */}
              <div>
                <p className="text-xs font-semibold text-ink-secondary mb-1.5">Pilihan Cepat:</p>
                <div className="flex flex-wrap gap-2">
                  {cashPresets.map((nominal, idx) => (
                    <button
                      key={nominal}
                      type="button"
                      onClick={() => {
                        setCashInputString(String(nominal));
                        setErrorMessage(null);
                      }}
                      className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                        amountPaidCash === nominal
                          ? 'border-primary-600 bg-primary-50 text-primary-800'
                          : 'border-border-subtle bg-surface-panel text-ink-primary hover:bg-surface-subtle'
                      }`}
                    >
                      {idx === 0 ? 'Uang Pas: ' : ''}
                      {formatRupiah(nominal)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tampilan Kembalian / Kekurangan */}
              <div
                className={`rounded-2xl border p-4 transition-colors ${
                  amountPaidCash >= totalPayable && amountPaidCash > 0
                    ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
                    : amountPaidCash > 0
                      ? 'border-amber-200 bg-amber-50/80 text-amber-900'
                      : 'border-border-subtle bg-surface-subtle text-ink-muted'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider">
                    {amountPaidCash >= totalPayable ? 'Kembalian' : 'Kekurangan'}
                  </span>
                  {amountPaidCash >= totalPayable && amountPaidCash > 0 ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      Lunas
                    </span>
                  ) : null}
                </div>
                <p
                  className={`mt-1 text-2xl font-black ${
                    amountPaidCash >= totalPayable
                      ? 'text-emerald-700'
                      : amountPaidCash > 0
                        ? 'text-amber-700'
                        : 'text-ink-secondary'
                  }`}
                >
                  {amountPaidCash >= totalPayable
                    ? formatRupiah(changeAmount)
                    : formatRupiah(shortageAmount)}
                </p>
              </div>
            </div>

            {/* Numpad Sentuh (5 kolom) */}
            <div className="grid grid-cols-3 gap-2 lg:col-span-5">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', '000'].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleNumpadPress(val)}
                  className="flex h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-panel text-base font-bold text-ink-primary shadow-xs transition-colors hover:bg-surface-subtle active:scale-95"
                >
                  {val}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleNumpadPress('C')}
                className="col-span-1 flex h-11 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-sm font-bold text-rose-700 shadow-xs transition-colors hover:bg-rose-100 active:scale-95"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handleNumpadPress('BACKSPACE')}
                className="col-span-2 flex h-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-subtle text-xs font-bold text-ink-secondary shadow-xs transition-colors hover:bg-surface-panel active:scale-95"
              >
                ⌫ Hapus
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Konten Tab 2: Pembayaran QRIS */}
      {activeMethod === 'QRIS' ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            {/* SVG Visualisasi QRIS */}
            <div className="w-full max-w-[280px]">
              <QrisQrCode amount={totalPayable} />
            </div>

            {/* Petunjuk & Status QRIS */}
            <div className="flex-1 space-y-3">
              <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-4">
                <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary mb-2">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    Waktu Berlaku QRIS:
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      qrisTimerSeconds < 60 ? 'text-rose-600' : 'text-ink-primary'
                    }`}
                  >
                    {formatTimer(qrisTimerSeconds)}
                  </span>
                </div>
                <ol className="list-decimal pl-4 text-xs space-y-1.5 text-ink-secondary">
                  <li>Arahkan pelanggan untuk memindai QR code di layar.</li>
                  <li>
                    Pelanggan dapat membayar via GoPay, OVO, ShopeePay, Dana, BCA Mobile, dll.
                  </li>
                  <li>
                    Pastikan nominal yang tertera pada ponsel pelanggan:{' '}
                    <strong>{formatRupiah(totalPayable)}</strong>.
                  </li>
                  <li>
                    Klik tombol &quot;Konfirmasi Pembayaran QRIS&quot; setelah status berhasil
                    terverifikasi.
                  </li>
                </ol>
              </div>

              {qrisTimerSeconds === 0 ? (
                <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  <span>Waktu QRIS telah habis.</span>
                  <button
                    type="button"
                    onClick={() => setQrisTimerSeconds(300)}
                    className="font-bold underline hover:no-underline"
                  >
                    Perbarui QR
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Konten Tab 3: Transfer Bank */}
      {activeMethod === 'BANK_TRANSFER' ? (
        <div className="space-y-4">
          <p className="text-xs font-semibold text-ink-secondary">
            Pilih Rekening Tujuan Transfer:
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {BANK_ACCOUNTS.map((bank) => {
              const isSelected = selectedBank === bank.code;
              const isCopied = copiedBankCode === bank.code;

              return (
                <div
                  key={bank.code}
                  onClick={() => setSelectedBank(bank.code)}
                  className={`flex flex-col justify-between rounded-2xl border p-3.5 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary-600 bg-primary-50/60 ring-2 ring-primary-500/20'
                      : 'border-border-subtle bg-surface-panel hover:bg-surface-subtle'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-ink-primary">{bank.code}</span>
                      {isSelected ? (
                        <Check className="h-4 w-4 text-primary-700" aria-hidden="true" />
                      ) : null}
                    </div>
                    <p className="text-xs text-ink-secondary">{bank.name}</p>
                    <p className="mt-1 font-mono text-sm font-bold text-ink-primary">
                      {bank.accountNumber}
                    </p>
                    <p className="text-xs text-ink-muted">a/n {bank.accountName}</p>
                  </div>

                  <button
                    type="button"
                    aria-label={`Salin rekening ${bank.code}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCopyAccountNumber(bank.accountNumber, bank.code);
                    }}
                    className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-border-strong bg-surface-panel py-1.5 text-xs font-semibold text-ink-primary hover:bg-surface-subtle active:scale-95"
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        <span className="text-emerald-700">Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-ink-secondary" aria-hidden="true" />
                        <span>Salin Rekening</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          <div>
            <label
              htmlFor="transfer-ref-input"
              className="block text-xs font-bold text-ink-primary mb-1"
            >
              Nomor Referensi / Catatan Bukti Transfer (Opsional)
            </label>
            <input
              id="transfer-ref-input"
              type="text"
              placeholder="Contoh: Ref BCA 889021 atau Nama Pengirim"
              value={transferReference}
              onChange={(e) => setTransferReference(e.target.value)}
              className="h-10 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-xs text-ink-primary placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        </div>
      ) : null}

      {/* Footer Aksi Modal */}
      <div className="mt-6 flex flex-col-reverse items-center justify-end gap-3 border-t border-border-subtle pt-4 sm:flex-row">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          Batal (Esc)
        </Button>

        <Button
          type="button"
          variant="primary"
          onClick={() => void handleProcessPayment()}
          disabled={!isPaymentValid || isSubmitting}
          className="w-full sm:w-auto min-w-[200px]"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Menyimpan Transaksi...
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Send className="h-4 w-4" aria-hidden="true" />
              <span>
                {activeMethod === 'CASH'
                  ? 'Konfirmasi Pembayaran (Enter)'
                  : activeMethod === 'QRIS'
                    ? 'Konfirmasi QRIS Diterima'
                    : 'Konfirmasi Transfer Diterima'}
              </span>
            </span>
          )}
        </Button>
      </div>
    </Modal>
  );
}
