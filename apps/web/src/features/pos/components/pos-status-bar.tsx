import { Clock, HelpCircle, Layers, RefreshCw } from 'lucide-react';

export interface PosStatusBarProps {
  shiftName?: string;
  transactionCount?: number;
  syncQueueCount?: number;
}

export function PosStatusBar({
  shiftName = 'Shift 1 (Pagi)',
  transactionCount = 0,
  syncQueueCount = 0,
}: PosStatusBarProps) {
  return (
    <footer
      aria-label="Status kasir dan petunjuk pintasan keyboard"
      className="border-t border-border-subtle bg-surface-panel px-4 py-2 text-xs text-ink-secondary"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Shift & Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-medium text-ink-primary">
            <Clock className="h-3.5 w-3.5 text-primary-600" aria-hidden="true" />
            <span>
              Shift: <span className="font-semibold text-primary-700">{shiftName}</span>
            </span>
          </div>

          <div className="hidden items-center gap-1.5 sm:flex">
            <Layers className="h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
            <span>
              Transaksi Hari Ini:{' '}
              <span className="font-semibold text-ink-primary">{transactionCount}</span>
            </span>
          </div>

          {syncQueueCount > 0 ? (
            <div className="flex items-center gap-1.5 text-semantic-warning-ink">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              <span>
                Antrean Sinkronisasi: <span className="font-semibold">{syncQueueCount}</span>
              </span>
            </div>
          ) : null}
        </div>

        {/* Right: Keyboard Shortcuts Guide */}
        <div className="hidden items-center gap-2 text-ink-muted md:flex">
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-medium">Pintasan:</span>
          <div className="flex items-center gap-1.5">
            <kbd className="rounded border border-border-strong bg-surface-canvas px-1.5 py-0.5 text-xs font-semibold text-ink-primary">
              F1
            </kbd>
            <span>Tunai</span>
            <span className="text-border-strong">·</span>
            <kbd className="rounded border border-border-strong bg-surface-canvas px-1.5 py-0.5 text-xs font-semibold text-ink-primary">
              F2
            </kbd>
            <span>QRIS</span>
            <span className="text-border-strong">·</span>
            <kbd className="rounded border border-border-strong bg-surface-canvas px-1.5 py-0.5 text-xs font-semibold text-ink-primary">
              F3
            </kbd>
            <span>Transfer</span>
            <span className="text-border-strong">·</span>
            <kbd className="rounded border border-border-strong bg-surface-canvas px-1.5 py-0.5 text-xs font-semibold text-ink-primary">
              F4
            </kbd>
            <span>Cari</span>
            <span className="text-border-strong">·</span>
            <kbd className="rounded border border-border-strong bg-surface-canvas px-1.5 py-0.5 text-xs font-semibold text-ink-primary">
              Esc
            </kbd>
            <span>Batal</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
