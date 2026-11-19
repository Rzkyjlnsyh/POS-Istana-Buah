import type { ShiftDto, ShiftStatus } from '@istana-buah/shared';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Lock,
  PlayCircle,
  RefreshCw,
  Search,
  ShoppingCart,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { Alert } from '../../../components/ui/alert';
import { Button, buttonVariants } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { webConfig } from '../../../config/app.config';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { useAuthStore } from '../../../stores/auth-store';
import {
  formatRupiah,
  formatTransactionDateTime,
  getStoreDateString,
  shiftYmdDate,
  toStoreDayBounds,
} from '../../pos/utils/formatters';
import { getActiveShift, getShifts } from '../api/shift-api';
import { CloseShiftModal, OpenShiftModal, ShiftDetailModal } from '../components/shift-modals';

type ShiftDatePreset = 'TODAY' | 'LAST_7_DAYS' | 'ALL';

const SHIFT_STATUS_META: Record<ShiftStatus, { label: string; badgeClass: string }> = {
  OPEN: {
    label: 'Sedang Buka',
    badgeClass: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink',
  },
  CLOSED: {
    label: 'Ditutup',
    badgeClass: 'border-border-subtle bg-surface-subtle text-ink-secondary',
  },
};

/**
 * Halaman Manajemen & Riwayat Shift Kasir (M06-002).
 */
export function ShiftPage() {
  const inRouter = useInRouterContext();
  const user = useAuthStore((s) => s.user);
  const canSearchAll = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const searchId = useId();
  const statusId = useId();
  const todayYmd = useMemo(() => getStoreDateString(), []);

  const [activeShift, setActiveShift] = useState<ShiftDto | null>(null);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);

  const [datePreset, setDatePreset] = useState<ShiftDatePreset>('LAST_7_DAYS');
  const [statusFilter, setStatusFilter] = useState<ShiftStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const [isOpenModal, setIsOpenModal] = useState(false);
  const [closingTarget, setClosingTarget] = useState<ShiftDto | null>(null);
  const [detailTarget, setDetailTarget] = useState<ShiftDto | null>(null);

  const pageSize = webConfig.historyPageSize;

  useEffect(() => {
    if (searchTerm === debouncedSearch) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const range: { startDate?: string; endDate?: string } =
        datePreset === 'TODAY'
          ? toStoreDayBounds(todayYmd, todayYmd)
          : datePreset === 'LAST_7_DAYS'
            ? toStoreDayBounds(shiftYmdDate(todayYmd, -6), todayYmd)
            : {};

      const [activeRes, listRes] = await Promise.all([
        getActiveShift(),
        getShifts({
          page,
          limit: pageSize,
          ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
          ...(range.startDate ? { startDate: range.startDate } : {}),
          ...(range.endDate ? { endDate: range.endDate } : {}),
          ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        }),
      ]);

      setActiveShift(activeRes);
      setShifts(listRes.items);
      setTotalItems(listRes.meta.total);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [datePreset, todayYmd, page, pageSize, statusFilter, debouncedSearch]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Shift Kasir</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Kelola kas awal saat buka shift, pantau penjualan berjalan, dan rekonsiliasi tutup
            shift.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => void loadData()}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
          <span>Segarkan Data</span>
        </Button>
      </div>

      {errorMessage ? (
        <Alert variant="danger" title="Gagal memuat data shift">
          {errorMessage}
        </Alert>
      ) : null}

      {successBanner ? (
        <Alert variant="success" title="Berhasil">
          {successBanner}
        </Alert>
      ) : null}

      {/* Kartu Shift Aktif User */}
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
        {activeShift ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-800">
                  <Clock className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink-primary tabular-nums">
                    Shift Aktif: {activeShift.shiftNo}
                  </h2>
                  <p className="text-xs text-ink-muted">
                    Dibuka oleh {activeShift.cashierName} pada{' '}
                    {formatTransactionDateTime(activeShift.openedAt)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {inRouter ? (
                  <Link to="/pos" className={cn(buttonVariants({ variant: 'secondary' }))}>
                    <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                    <span>Buka Layar Kasir</span>
                  </Link>
                ) : null}
                <Button type="button" onClick={() => setClosingTarget(activeShift)}>
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  <span>Tutup Shift</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-4 tabular-nums lg:grid-cols-4">
              <div>
                <p className="text-xs text-ink-muted">Kas Awal</p>
                <p className="mt-0.5 text-base font-bold text-ink-primary">
                  {formatRupiah(Number(activeShift.openingCash))}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Total Penjualan</p>
                <p className="mt-0.5 text-base font-bold text-primary-800">
                  {formatRupiah(Number(activeShift.totalSales))}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Estimasi Kas Laci</p>
                <p className="mt-0.5 text-base font-bold text-ink-primary">
                  {formatRupiah(Number(activeShift.expectedCash ?? activeShift.openingCash))}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Transaksi Selesai</p>
                <p className="mt-0.5 text-base font-bold text-ink-primary">
                  {activeShift.totalTransactions} struk
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-ink-primary">Belum Ada Shift Terbuka</h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Buka shift kasir terlebih dahulu dengan modal kas laci agar seluruh transaksi POS
                tercatat pada sesi Anda.
              </p>
            </div>
            <Button type="button" onClick={() => setIsOpenModal(true)}>
              <PlayCircle className="h-4 w-4" aria-hidden="true" />
              <span>Buka Shift Kasir</span>
            </Button>
          </div>
        )}
      </section>

      {/* Riwayat Shift */}
      <section className="space-y-4 rounded-2xl border border-border-subtle bg-surface-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-ink-primary">Riwayat Shift Kasir</h2>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter periode shift">
            {(
              [
                { id: 'TODAY', label: 'Hari Ini' },
                { id: 'LAST_7_DAYS', label: '7 Hari' },
                { id: 'ALL', label: 'Semua' },
              ] as const
            ).map((p) => (
              <Button
                key={p.id}
                type="button"
                variant={datePreset === p.id ? 'primary' : 'secondary'}
                aria-pressed={datePreset === p.id}
                onClick={() => {
                  setDatePreset(p.id);
                  setPage(1);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor={searchId} className="mb-1 block text-xs font-medium text-ink-secondary">
              {canSearchAll ? 'Cari Nomor Shift / Kasir' : 'Cari Nomor Shift'}
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <Input
                id={searchId}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={canSearchAll ? 'SHIFT- atau nama kasir...' : 'SHIFT-...'}
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <label htmlFor={statusId} className="mb-1 block text-xs font-medium text-ink-secondary">
              Status Shift
            </label>
            <select
              id={statusId}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as ShiftStatus | 'ALL');
                setPage(1);
              }}
              className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3.5 text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
            >
              <option value="ALL">Semua Status</option>
              <option value="OPEN">Sedang Buka</option>
              <option value="CLOSED">Ditutup</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-xl border border-border-subtle bg-surface-subtle/40 px-4 py-10 text-center text-sm text-ink-muted">
            Memuat riwayat shift kasir...
          </div>
        ) : shifts.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-surface-subtle/40 px-4 py-10 text-center text-sm text-ink-muted">
            Belum ada riwayat shift yang cocok dengan filter.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border-subtle md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border-subtle bg-surface-subtle text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Shift
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Kasir
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Kas Awal
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Total Omset
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Selisih Kas
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle bg-surface-panel">
                  {shifts.map((sh) => {
                    const meta = SHIFT_STATUS_META[sh.status];
                    const diff = sh.cashDifference !== null ? Number(sh.cashDifference) : null;
                    return (
                      <tr key={sh.id} className="hover:bg-surface-subtle/40">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-ink-primary tabular-nums">
                            {sh.shiftNo}
                          </p>
                          <p className="text-xs text-ink-muted tabular-nums">
                            {formatTransactionDateTime(sh.openedAt)}
                          </p>
                        </td>
                        <td className="px-4 py-3 font-medium text-ink-primary">{sh.cashierName}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                              meta.badgeClass,
                            )}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                          {formatRupiah(Number(sh.openingCash))}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-primary">
                          {formatRupiah(Number(sh.totalSales))}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-3 text-right font-semibold tabular-nums',
                            diff === null
                              ? 'text-ink-muted'
                              : diff < 0
                                ? 'text-semantic-danger-ink'
                                : 'text-primary-800',
                          )}
                        >
                          {diff === null
                            ? '-'
                            : diff > 0
                              ? `+${formatRupiah(diff)}`
                              : formatRupiah(diff)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Detail ${sh.shiftNo}`}
                              onClick={() => setDetailTarget(sh)}
                            >
                              <Eye className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            {sh.status === 'OPEN' ? (
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setClosingTarget(sh)}
                              >
                                Tutup
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-2.5 md:hidden">
              {shifts.map((sh) => {
                const meta = SHIFT_STATUS_META[sh.status];
                return (
                  <div
                    key={sh.id}
                    className="rounded-xl border border-border-subtle bg-surface-panel p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink-primary tabular-nums">{sh.shiftNo}</p>
                        <p className="text-xs text-ink-muted">
                          {sh.cashierName} &bull; {formatTransactionDateTime(sh.openedAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-xs font-medium',
                          meta.badgeClass,
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="mt-2.5 flex justify-between text-xs tabular-nums">
                      <span>Kas Awal: {formatRupiah(Number(sh.openingCash))}</span>
                      <span className="font-semibold text-ink-primary">
                        Omset: {formatRupiah(Number(sh.totalSales))}
                      </span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setDetailTarget(sh)}
                      >
                        Detail Laporan
                      </Button>
                      {sh.status === 'OPEN' ? (
                        <Button
                          type="button"
                          className="flex-1"
                          onClick={() => setClosingTarget(sh)}
                        >
                          Tutup Shift
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-ink-secondary">
              <span className="tabular-nums">
                Halaman {page} dari {totalPages} ({totalItems} shift)
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Halaman shift sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Halaman shift berikutnya"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      <OpenShiftModal
        isOpen={isOpenModal}
        onClose={() => setIsOpenModal(false)}
        onOpened={(opened) => {
          setSuccessBanner(`Shift ${opened.shiftNo} berhasil dibuka.`);
          void loadData();
        }}
      />

      <CloseShiftModal
        isOpen={closingTarget !== null}
        shift={closingTarget}
        onClose={() => setClosingTarget(null)}
        onClosed={(closed) => {
          setSuccessBanner(`Shift ${closed.shiftNo} berhasil ditutup dengan laporan rekonsiliasi.`);
          setDetailTarget(closed);
          void loadData();
        }}
      />

      <ShiftDetailModal
        isOpen={detailTarget !== null}
        shift={detailTarget}
        onClose={() => setDetailTarget(null)}
        onRequestCloseShift={(sh) => setClosingTarget(sh)}
      />
    </div>
  );
}
