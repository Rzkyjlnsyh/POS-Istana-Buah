import {
  AlertTriangle,
  Clock,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router';
import { webConfig } from '../../config/app.config';
import { logoutRequest } from '../../features/auth/api/auth-api';
import { useNetworkStatus } from '../../hooks/use-network-status';
import { cn } from '../../lib/cn';
import { ROLE_LABELS_ID } from '../../routes/navigation-config';
import { useAuthStore } from '../../stores/auth-store';
import { OrchardBrandMark } from '../common/brand-mark';
import { Button, buttonVariants } from '../ui/button';

const posClockFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});

function formatPosClock(now: Date = new Date()): string {
  return `${posClockFormatter.format(now).replace('.', ':')} WIB`;
}

/**
 * Shell layar Kasir POS sesuai wireframe Bagian 8.2.1
 * (Header sticky: Logo | Nama Kasir | Status Online | Waktu | Navigasi Shift & Akun | Keluar).
 */
export function PosShellLayout() {
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();

  const user = useAuthStore((state) => state.user);
  const getRefreshToken = useAuthStore((state) => state.getRefreshToken);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [clockText, setClockText] = useState<string>(() => formatPosClock());
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockText(formatPosClock());
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  if (!user) {
    return null;
  }

  const canAccessAdmin = user.role === 'OWNER' || user.role === 'MANAGER';

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const refreshToken = getRefreshToken();
    try {
      await logoutRequest(refreshToken);
    } catch {
      // Tetap lanjut bersihkan sesi lokal
    } finally {
      clearSession();
      setIsLoggingOut(false);
      await navigate('/login', { replace: true });
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-surface-canvas text-ink-primary">
      <a
        href="#pos-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-xl focus:border focus:border-border-strong focus:bg-surface-panel focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-ink-primary focus:shadow-elevated focus:outline-2 focus:outline-white"
      >
        Lewati ke area kasir utama
      </a>

      <header className="sticky top-0 z-30 border-b border-primary-800 bg-primary-900 text-white">
        <div className="flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <OrchardBrandMark size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight sm:text-base">
                {webConfig.appName}
              </p>
              <p className="truncate text-xs text-primary-100">
                Kasir: <span className="font-semibold text-white">{user.fullName}</span> (
                {ROLE_LABELS_ID[user.role]})
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <span
              className={cn(
                'hidden items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold md:inline-flex',
                isOnline
                  ? 'border-primary-700 bg-primary-800 text-primary-50'
                  : 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
              )}
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Online</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Offline</span>
                </>
              )}
            </span>

            <span className="hidden rounded-xl border border-primary-800 bg-primary-800/70 px-3 py-1.5 text-xs font-semibold text-primary-50 tabular-nums xl:inline-block">
              {clockText}
            </span>

            <Link
              to="/shifts"
              className={cn(buttonVariants({ variant: 'headerOutline', size: 'default' }))}
            >
              <Clock className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">Shift Kasir</span>
            </Link>

            {canAccessAdmin ? (
              <Link
                to="/dashboard"
                className={cn(buttonVariants({ variant: 'headerOutline', size: 'default' }))}
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only lg:not-sr-only">Panel Admin</span>
              </Link>
            ) : null}

            <Link
              to="/account/password"
              className={cn(buttonVariants({ variant: 'headerOutline', size: 'default' }))}
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only xl:not-sr-only">Ubah Password</span>
            </Link>

            <span aria-hidden="true" className="mx-0.5 h-6 w-px bg-primary-700" />

            <Button
              variant="headerOutline"
              isLoading={isLoggingOut}
              loadingText="Keluar…"
              onClick={() => {
                void handleLogout();
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Keluar</span>
            </Button>
          </div>
        </div>

        <div aria-live="polite">
          {!isOnline ? (
            <div className="flex items-center justify-center gap-2 border-t border-semantic-warning-border bg-semantic-warning-bg px-4 py-2 text-xs font-semibold text-semantic-warning-ink">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Mode offline aktif — transaksi tetap tersimpan lokal dan otomatis disinkronkan
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <main id="pos-main-content" className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
