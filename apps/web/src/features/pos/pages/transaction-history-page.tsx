import type { PaymentMethod, TransactionDto, TransactionStatus } from '@istana-buah/shared';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  Printer,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { Button, buttonVariants } from '../../../components/ui/button';
import { webConfig } from '../../../config/app.config';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { useAuthStore } from '../../../stores/auth-store';
import { getTransactionById, getTransactions, voidTransaction } from '../api/transaction-api';
import { PosReceiptModal } from '../components/pos-receipt-modal';
import { TransactionDetailPanel } from '../components/transaction-detail-panel';
import {
  formatPaymentMethodShort,
  formatRupiah,
  formatTransactionTime,
  getStoreDateString,
  shiftYmdDate,
  toStoreDayBounds,
  TRANSACTION_STATUS_META,
} from '../utils/formatters';

type DatePreset = 'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'ALL' | 'CUSTOM';

const DATE_PRESETS: Array<{ id: Exclude<DatePreset, 'CUSTOM'>; label: string }> = [
  { id: 'TODAY', label: 'Hari Ini' },
  { id: 'YESTERDAY', label: 'Kemarin' },
  { id: 'LAST_7_DAYS', label: '7 Hari' },
  { id: 'ALL', label: 'Semua' },
];

/**
 * Halaman Riwayat Transaksi POS (M03-008):
 * - Secara bawaan memuat transaksi hari ini sesuai zona waktu toko (WIB).
 * - Menyediakan filter rentang tanggal, pencarian nomor struk/kasir, metode bayar, dan status.
 * - Menampilkan panel detail lengkap transaksi, cetak ulang struk ESC/POS (Reprint),
 *   serta pembatalan (Void) khusus MANAGER/OWNER.
 */
export function TransactionHistoryPage() {
  const inRouter = useInRouterContext();
  const user = useAuthStore((state) => state.user);
  const canViewAllCashiers = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const canVoid = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const searchInputId = useId();
  const startDateId = useId();
  const endDateId = useId();
  const paymentSelectId = useId();
  const statusSelectId = useId();

  const todayYmd = useMemo(() => getStoreDateString(), []);

  const [datePreset, setDatePreset] = useState<DatePreset>('TODAY');
  const [startYmd, setStartYmd] = useState<string>(todayYmd);
  const [endYmd, setEndYmd] = useState<string>(todayYmd);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | 'ALL'>('ALL');
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | 'ALL'>('ALL');
  const [page, setPage] = useState<number>(1);

  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [totalItems, setTotalItems] = useState<number>(0);
  const [selectedTx, setSelectedTx] = useState<TransactionDto | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [receiptTx, setReceiptTx] = useState<TransactionDto | null>(null);

  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const selectedTxIdRef = useRef<string | null>(null);

  // Sync ref untuk menjaga pilihan aktif setelah refresh tanpa memasukkan selectedTx ke deps fetch
  useEffect(() => {
    selectedTxIdRef.current = selectedTx?.id ?? null;
  }, [selectedTx?.id]);

  // Debounce pencarian teks nomor struk / nama kasir (250ms)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const handleSelectPreset = (preset: Exclude<DatePreset, 'CUSTOM'>) => {
    const nowYmd = getStoreDateString();
    setDatePreset(preset);
    setPage(1);
    if (preset === 'TODAY') {
      setStartYmd(nowYmd);
      setEndYmd(nowYmd);
    } else if (preset === 'YESTERDAY') {
      const yesterday = shiftYmdDate(nowYmd, -1);
      setStartYmd(yesterday);
      setEndYmd(yesterday);
    } else if (preset === 'LAST_7_DAYS') {
      setStartYmd(shiftYmdDate(nowYmd, -6));
      setEndYmd(nowYmd);
    } else {
      setStartYmd('');
      setEndYmd('');
    }
  };

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const range =
        startYmd || endYmd
          ? toStoreDayBounds(startYmd || endYmd, endYmd || startYmd)
          : { startDate: undefined, endDate: undefined };

      const res = await getTransactions({
        page,
        limit: webConfig.historyPageSize,
        startDate: range.startDate,
        endDate: range.endDate,
        paymentMethod: paymentMethod === 'ALL' ? undefined : paymentMethod,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: debouncedSearch.trim() || undefined,
      });

      setTransactions(res.items);
      setTotalItems(res.meta.total);

      setSelectedTx((prev) => {
        if (prev) {
          const updated = res.items.find((it) => it.id === prev.id);
          if (updated) return updated;
        }
        return res.items[0] ?? null;
      });
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
      setTransactions([]);
      setTotalItems(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, startYmd, endYmd, paymentMethod, statusFilter, debouncedSearch]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  const resolveFullTransaction = useCallback(
    async (tx: TransactionDto): Promise<TransactionDto> => {
      try {
        const fresh = await getTransactionById(tx.id);
        return fresh;
      } catch {
        return tx;
      }
    },
    [],
  );

  const handleSelectRow = async (tx: TransactionDto) => {
    setSelectedTx(tx);
    setIsLoadingDetail(true);
    try {
      const fresh = await getTransactionById(tx.id);
      if (selectedTxIdRef.current === tx.id || selectedTxIdRef.current === null) {
        setSelectedTx(fresh);
      }
    } catch {
      // Tetap gunakan data baris bila jaringan gagal memuat ulang detail
    } finally {
      setIsLoadingDetail(false);
    }

    if (typeof detailPanelRef.current?.scrollIntoView === 'function' && window.innerWidth < 1024) {
      detailPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleReprint = async (tx: TransactionDto) => {
    const fullTx = tx.receiptData && tx.items.length > 0 ? tx : await resolveFullTransaction(tx);
    setSelectedTx(fullTx);
    setReceiptTx(fullTx);
  };

  const handleVoid = async (transactionId: string, reason: string) => {
    const updated = await voidTransaction(transactionId, reason);
    setTransactions((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    setSelectedTx(updated);
    setBanner({
      type: 'success',
      message: `Transaksi ${updated.transactionNo} berhasil dibatalkan (Void) dan stok telah dipulihkan.`,
    });
  };

  const pageSummary = useMemo(() => {
    let completedTotal = 0;
    let voidedCount = 0;
    for (const tx of transactions) {
      if (tx.status === 'VOIDED') {
        voidedCount += 1;
      } else if (tx.status === 'COMPLETED') {
        completedTotal += Number(tx.totalAmount);
      }
    }
    return { completedTotal, voidedCount };
  }, [transactions]);

  const totalPages = Math.max(1, Math.ceil(totalItems / webConfig.historyPageSize));

  return (
    <div className="mx-auto flex w-full max-w-container flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
      {/* Header Halaman */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {inRouter ? (
            <Link
              to="/pos"
              className={cn(buttonVariants({ variant: 'secondary', size: 'default' }), 'shrink-0')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Kembali ke Kasir</span>
            </Link>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight text-ink-primary sm:text-2xl">
              Riwayat Transaksi
            </h1>
            <p className="text-xs text-ink-secondary sm:text-sm">
              {canViewAllCashiers
                ? 'Pantau seluruh transaksi toko, periksa rincian, cetak ulang struk, atau void transaksi.'
                : 'Daftar transaksi kasir Anda hari ini beserta detail barang dan cetak ulang struk.'}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          disabled={isLoading}
          onClick={() => void fetchTransactions()}
          aria-label="Muat ulang daftar transaksi"
        >
          <RefreshCw
            className={cn('h-4 w-4', isLoading ? 'animate-spin' : '')}
            aria-hidden="true"
          />
          <span>Muat Ulang</span>
        </Button>
      </header>

      {/* Banner Notifikasi Aksi (Reprint / Void) */}
      {banner ? (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={cn(
            'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-semibold',
            banner.type === 'success'
              ? 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink'
              : 'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink',
          )}
        >
          <div className="flex items-center gap-2">
            {banner.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{banner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBanner(null)}
            className="min-h-11 px-2 text-xs font-semibold underline hover:no-underline"
          >
            Tutup
          </button>
        </div>
      ) : null}

      {/* Panel Filter & Ringkasan Harian (Single Frame) */}
      <section
        aria-label="Filter dan ringkasan transaksi"
        className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-panel shadow-panel"
      >
        {/* Pita Ringkasan Terbagi Garis 1px */}
        <div className="grid grid-cols-1 divide-y divide-border-subtle border-b border-border-subtle bg-surface-subtle/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-5 py-3.5">
            <p className="text-xs font-medium text-ink-secondary">Jumlah Transaksi</p>
            <p className="mt-0.5 text-xl font-bold text-ink-primary tabular-nums">{totalItems}</p>
          </div>
          <div className="px-5 py-3.5">
            <p className="text-xs font-medium text-ink-secondary">
              Total Penjualan Selesai{totalPages > 1 ? ' (Halaman Ini)' : ''}
            </p>
            <p className="mt-0.5 text-xl font-bold text-primary-700 tabular-nums">
              {formatRupiah(pageSummary.completedTotal)}
            </p>
          </div>
          <div className="px-5 py-3.5">
            <p className="text-xs font-medium text-ink-secondary">Dibatalkan (Void)</p>
            <p className="mt-0.5 text-xl font-bold text-ink-primary tabular-nums">
              {pageSummary.voidedCount}
            </p>
          </div>
        </div>

        {/* Kontrol Filter */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* Preset Rentang Hari */}
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Pilih periode cepat"
          >
            {DATE_PRESETS.map((preset) => {
              const isActive = datePreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => handleSelectPreset(preset.id)}
                  className={cn(
                    'min-h-11 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-primary-700',
                    isActive
                      ? 'border-primary-700 bg-primary-700 text-white'
                      : 'border-border-subtle bg-surface-canvas text-ink-primary hover:bg-surface-subtle',
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Grid Input Filter */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="sm:col-span-2 lg:col-span-1">
              <label
                htmlFor={searchInputId}
                className="block text-xs font-semibold text-ink-secondary mb-1"
              >
                Cari No. Struk / Kasir
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <input
                  id={searchInputId}
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="TRX-... atau kasir"
                  className="h-11 w-full rounded-xl border border-border-strong bg-surface-panel pl-9 pr-3 text-sm text-ink-primary placeholder:text-ink-muted focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor={startDateId}
                className="block text-xs font-semibold text-ink-secondary mb-1"
              >
                Dari Tanggal
              </label>
              <input
                id={startDateId}
                type="date"
                value={startYmd}
                onChange={(e) => {
                  setDatePreset('CUSTOM');
                  setStartYmd(e.target.value);
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-sm text-ink-primary tabular-nums focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <div>
              <label
                htmlFor={endDateId}
                className="block text-xs font-semibold text-ink-secondary mb-1"
              >
                Sampai Tanggal
              </label>
              <input
                id={endDateId}
                type="date"
                value={endYmd}
                onChange={(e) => {
                  setDatePreset('CUSTOM');
                  setEndYmd(e.target.value);
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-sm text-ink-primary tabular-nums focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>

            <div>
              <label
                htmlFor={paymentSelectId}
                className="block text-xs font-semibold text-ink-secondary mb-1"
              >
                Metode Bayar
              </label>
              <select
                id={paymentSelectId}
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value as PaymentMethod | 'ALL');
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-sm text-ink-primary focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="ALL">Semua Metode</option>
                <option value="CASH">Tunai (Cash)</option>
                <option value="QRIS">QRIS Digital</option>
                <option value="BANK_TRANSFER">Transfer Bank</option>
                <option value="MIXED">Kombinasi</option>
              </select>
            </div>

            <div>
              <label
                htmlFor={statusSelectId}
                className="block text-xs font-semibold text-ink-secondary mb-1"
              >
                Status Transaksi
              </label>
              <select
                id={statusSelectId}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as TransactionStatus | 'ALL');
                  setPage(1);
                }}
                className="h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-sm text-ink-primary focus:border-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              >
                <option value="ALL">Semua Status</option>
                <option value="COMPLETED">Selesai</option>
                <option value="VOIDED">Dibatalkan</option>
                <option value="PENDING">Menunggu</option>
                <option value="PENDING_SYNC">Antre Sinkron</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Konten Utama: Daftar Transaksi (7 kolom) + Panel Detail (5 kolom) */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
        {/* Daftar Transaksi */}
        <section
          aria-label="Daftar riwayat transaksi"
          aria-busy={isLoading}
          className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-panel shadow-panel lg:col-span-7"
        >
          {errorMessage ? (
            <div role="alert" className="p-6 text-center space-y-3">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-semantic-danger-bg text-semantic-danger-ink">
                <AlertCircle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-primary">
                  Gagal memuat riwayat transaksi
                </p>
                <p className="mt-1 text-xs text-ink-secondary">{errorMessage}</p>
              </div>
              <Button type="button" variant="secondary" onClick={() => void fetchTransactions()}>
                Coba Lagi
              </Button>
            </div>
          ) : isLoading && transactions.length === 0 ? (
            <div className="divide-y divide-border-subtle p-4 animate-pulse">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="flex items-center justify-between py-3.5">
                  <div className="space-y-2">
                    <div className="h-4 w-40 rounded bg-surface-subtle" />
                    <div className="h-3 w-24 rounded bg-surface-subtle" />
                  </div>
                  <div className="h-5 w-24 rounded bg-surface-subtle" />
                </div>
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-subtle text-ink-muted">
                <History className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="text-base font-semibold text-ink-primary">
                Belum ada transaksi ditemukan
              </h2>
              <p className="mt-1 max-w-sm text-xs text-ink-secondary">
                Coba perluas rentang tanggal ke 7 hari terakhir atau hapus filter pencarian yang
                aktif.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleSelectPreset('LAST_7_DAYS')}
                >
                  Tampilkan 7 Hari Terakhir
                </Button>
                {inRouter ? (
                  <Link
                    to="/pos"
                    className={buttonVariants({ variant: 'primary', size: 'default' })}
                  >
                    Buka Layar Kasir
                  </Link>
                ) : null}
              </div>
            </div>
          ) : (
            <>
              {/* Tampilan Tabel Desktop / Tablet */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-subtle bg-surface-subtle/60 text-xs font-semibold text-ink-secondary">
                      <th scope="col" className="px-4 py-3">
                        No. Struk & Waktu
                      </th>
                      <th scope="col" className="px-3 py-3">
                        Metode
                      </th>
                      <th scope="col" className="px-3 py-3">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-3 text-right">
                        Total
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {transactions.map((tx) => {
                      const isSelected = selectedTx?.id === tx.id;
                      const meta = TRANSACTION_STATUS_META[tx.status];

                      return (
                        <tr
                          key={tx.id}
                          onClick={() => void handleSelectRow(tx)}
                          className={cn(
                            'cursor-pointer transition-colors',
                            isSelected ? 'bg-primary-50' : 'hover:bg-surface-canvas',
                          )}
                        >
                          <td className="px-4 py-3 align-middle">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleSelectRow(tx);
                              }}
                              aria-pressed={isSelected}
                              className="text-left focus-visible:outline-2 focus-visible:outline-primary-700 rounded"
                            >
                              <p className="font-bold text-ink-primary tabular-nums">
                                {tx.transactionNo}
                              </p>
                              <p className="text-xs text-ink-secondary tabular-nums">
                                {formatTransactionTime(tx.transactedAt)}
                                {canViewAllCashiers ? ` · ${tx.cashierName}` : ''}
                              </p>
                            </button>
                          </td>
                          <td className="px-3 py-3 align-middle text-xs font-medium text-ink-primary">
                            {formatPaymentMethodShort(tx.paymentMethod)}
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                                meta.badgeClass,
                              )}
                            >
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-middle text-right font-bold text-ink-primary tabular-nums">
                            {formatRupiah(Number(tx.totalAmount))}
                          </td>
                          <td className="px-4 py-3 align-middle text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleReprint(tx);
                              }}
                              aria-label={`Cetak ulang struk ${tx.transactionNo}`}
                              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-xs font-semibold text-ink-primary transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-primary-700"
                            >
                              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Cetak</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Tampilan List Responsif Mobile (<md) */}
              <ul
                className="divide-y divide-border-subtle md:hidden"
                aria-label="Daftar transaksi mobile"
              >
                {transactions.map((tx) => {
                  const isSelected = selectedTx?.id === tx.id;
                  const meta = TRANSACTION_STATUS_META[tx.status];

                  return (
                    <li
                      key={tx.id}
                      className={cn(
                        'p-4 transition-colors',
                        isSelected ? 'bg-primary-50' : 'bg-surface-panel',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => void handleSelectRow(tx)}
                          className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-primary-700 rounded"
                        >
                          <p className="text-sm font-bold text-ink-primary tabular-nums">
                            {tx.transactionNo}
                          </p>
                          <p className="mt-0.5 text-xs text-ink-secondary tabular-nums">
                            {formatTransactionTime(tx.transactedAt)} ·{' '}
                            {formatPaymentMethodShort(tx.paymentMethod)}
                            {canViewAllCashiers ? ` · ${tx.cashierName}` : ''}
                          </p>
                        </button>

                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                            meta.badgeClass,
                          )}
                        >
                          {meta.label}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2">
                        <span className="text-base font-bold text-ink-primary tabular-nums">
                          {formatRupiah(Number(tx.totalAmount))}
                        </span>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void handleSelectRow(tx)}
                          >
                            Detail
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            onClick={() => void handleReprint(tx)}
                            aria-label={`Cetak ulang struk ${tx.transactionNo}`}
                          >
                            <Printer className="h-4 w-4" aria-hidden="true" />
                            <span>Cetak</span>
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Paginasi */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface-subtle/40 px-4 py-3 text-xs text-ink-secondary">
                <span className="tabular-nums">
                  Halaman <strong className="text-ink-primary">{page}</strong> dari{' '}
                  <strong className="text-ink-primary">{totalPages}</strong> ({totalItems}{' '}
                  transaksi)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={page <= 1 || isLoading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Sebelumnya</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={page >= totalPages || isLoading}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <span>Berikutnya</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Panel Detail Transaksi Terpilih */}
        <div ref={detailPanelRef} className="lg:sticky lg:top-20 lg:col-span-5">
          <TransactionDetailPanel
            transaction={selectedTx}
            isLoadingDetail={isLoadingDetail}
            canViewCost={canViewAllCashiers}
            canVoid={canVoid}
            onReprint={(tx) => void handleReprint(tx)}
            onVoidTransaction={handleVoid}
          />
        </div>
      </div>

      {/* Modal Pratinjau & Cetak Ulang Struk ESC/POS (M03-007 + M03-008) */}
      <PosReceiptModal
        isOpen={receiptTx !== null}
        onClose={() => setReceiptTx(null)}
        transaction={receiptTx}
        onPrinted={(method) => {
          if (receiptTx) {
            setBanner({
              type: 'success',
              message: `Struk ${receiptTx.transactionNo} berhasil dikirim ulang ke printer (${method.toUpperCase()}).`,
            });
          }
        }}
      />
    </div>
  );
}
