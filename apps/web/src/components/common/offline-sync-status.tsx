import { AlertTriangle, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { webConfig } from '../../config/app.config';
import { formatRupiah } from '../../features/pos/utils/formatters';
import { useNetworkStatus } from '../../hooks/use-network-status';
import { useAuthStore } from '../../stores/auth-store';
import { useOfflineSyncStore } from '../../stores/offline-sync-store';
import { cn } from '../../lib/cn';
import { Button } from '../ui/button';
import { Modal } from '../ui/modal';

/**
 * Mengatur siklus sinkronisasi otomatis saat kembali online dan interval berkala (M11-002 / TC-OFFLINE-002).
 */
export function useOfflineSyncLifecycle() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const refreshStatus = useOfflineSyncStore((state) => state.refreshStatus);
  const syncNow = useOfflineSyncStore((state) => state.syncNow);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void refreshStatus();

    const handleOnline = () => {
      void syncNow(true).catch(() => undefined);
    };

    window.addEventListener('online', handleOnline);
    const intervalId = window.setInterval(() => {
      if (navigator.onLine && useOfflineSyncStore.getState().pendingCount > 0) {
        void syncNow(false).catch(() => undefined);
      }
    }, webConfig.offlineSyncIntervalMs);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated, refreshStatus, syncNow]);
}

/**
 * Indikator status antrean sinkronisasi offline di header aplikasi beserta modal resolusi konflik (NFR-OFF-04/05).
 */
export function OfflineSyncStatusButton() {
  useOfflineSyncLifecycle();

  const isOnline = useNetworkStatus();
  const isSyncing = useOfflineSyncStore((state) => state.isSyncing);
  const pendingCount = useOfflineSyncStore((state) => state.pendingCount);
  const conflictCount = useOfflineSyncStore((state) => state.conflictCount);
  const items = useOfflineSyncStore((state) => state.items);
  const syncNow = useOfflineSyncStore((state) => state.syncNow);
  const retryItem = useOfflineSyncStore((state) => state.retryItem);
  const dismissConflict = useOfflineSyncStore((state) => state.dismissConflict);
  const isDurationWarning = useOfflineSyncStore((state) => state.isOfflineDurationWarningActive());

  const [isModalOpen, setIsModalOpen] = useState(false);

  const totalActionable = pendingCount + conflictCount;
  const showTrigger = totalActionable > 0 || isSyncing || isDurationWarning;
  if (!isModalOpen && !showTrigger) {
    return null;
  }

  return (
    <>
      {showTrigger ? (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          aria-label={
            conflictCount > 0
              ? `${conflictCount} konflik sinkronisasi offline perlu ditinjau`
              : `${pendingCount} transaksi menunggu sinkronisasi`
          }
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
            conflictCount > 0
              ? 'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink hover:opacity-95'
              : 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink hover:opacity-95',
          )}
        >
          {conflictCount > 0 ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <RefreshCw
              className={cn('h-3.5 w-3.5 shrink-0', isSyncing ? 'animate-spin' : undefined)}
              aria-hidden="true"
            />
          )}
          <span>
            {isSyncing
              ? 'Menyinkronkan…'
              : conflictCount > 0
                ? `Konflik Sync (${conflictCount})`
                : `Antrean Sync (${pendingCount})`}
          </span>
        </button>
      ) : null}

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Antrean & Resolusi Sinkronisasi Offline"
        description="Pantau transaksi offline yang menunggu dikirim atau selesaikan konflik stok dengan server."
        size="lg"
      >
        <div className="space-y-4">
          {isDurationWarning ? (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-semantic-warning-border bg-semantic-warning-bg p-3 text-xs font-medium text-semantic-warning-ink"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Perangkat menyimpan transaksi offline lebih dari {webConfig.offlineMaxWarningHours}{' '}
                jam. Segera hubungkan internet untuk sinkronisasi berkala tanpa mengganggu kasir.
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-surface-subtle p-3">
            <div className="text-xs text-ink-secondary">
              <p className="font-semibold text-ink-primary">
                Status: {isOnline ? 'Siap Online' : 'Offline — Koneksi terputus'}
              </p>
              <p>
                {pendingCount} menunggu sinkronisasi · {conflictCount} konflik perlu ditinjau
              </p>
            </div>
            <Button
              size="default"
              disabled={!isOnline || isSyncing || pendingCount === 0}
              isLoading={isSyncing}
              loadingText="Menyinkronkan…"
              onClick={() => {
                void syncNow(true);
              }}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Sinkronkan Sekarang</span>
            </Button>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle py-8 text-center text-sm text-ink-secondary">
              <CheckCircle2 className="h-8 w-8 text-primary-600" aria-hidden="true" />
              <p className="font-semibold text-ink-primary">Semua transaksi offline tersinkron!</p>
            </div>
          ) : (
            <ul
              className="max-h-80 space-y-2 overflow-y-auto pr-1"
              aria-label="Daftar transaksi offline"
            >
              {items.map((item) => {
                const isConflict = item.syncStatus === 'CONFLICT';
                const errorText = item.conflictReason ?? item.lastError;
                return (
                  <li
                    key={item.clientId}
                    className="rounded-xl border border-border-subtle bg-surface-panel p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-ink-primary">{item.transactionNo}</p>
                        <p className="text-ink-secondary">
                          {formatRupiah(Number(item.totalAmount))} · {item.paymentMethod} ·{' '}
                          <span
                            className={cn(
                              'font-semibold',
                              isConflict ? 'text-semantic-danger-ink' : 'text-semantic-warning-ink',
                            )}
                          >
                            {isConflict ? 'KONFLIK' : item.syncStatus}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="secondary"
                          size="default"
                          disabled={!isOnline || isSyncing}
                          onClick={() => {
                            void retryItem(item.clientId);
                          }}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Coba Ulang</span>
                        </Button>
                        {isConflict ? (
                          <Button
                            variant="destructive"
                            size="default"
                            disabled={isSyncing}
                            onClick={() => {
                              void dismissConflict(item.clientId);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Tandai Selesai Lokal</span>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {errorText ? (
                      <p className="mt-2 rounded-lg border border-semantic-danger-border bg-semantic-danger-bg px-2.5 py-1.5 font-medium text-semantic-danger-ink">
                        {errorText}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    </>
  );
}
