import { AlertTriangle, LogOut, Menu, Wifi, WifiOff, X } from 'lucide-react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { webConfig } from '../../config/app.config';
import { logoutRequest } from '../../features/auth/api/auth-api';
import { useNetworkStatus } from '../../hooks/use-network-status';
import { cn } from '../../lib/cn';
import {
  getVisibleNavItemsForRole,
  type NavGroup,
  ROLE_LABELS_ID,
} from '../../routes/navigation-config';
import { useAuthStore } from '../../stores/auth-store';
import { OrchardBrandMark } from '../common/brand-mark';
import { Button } from '../ui/button';

const ORDERED_NAV_GROUPS: readonly NavGroup[] = [
  'operations',
  'catalog',
  'warehouse',
  'management',
  'account',
];

/**
 * Shell aplikasi Admin / Manajer / Owner sesuai wireframe Bagian 8.2.2
 * (Header sticky + Sidebar terfilter peran <=4 item per grup + Dialog Drawer aksesibel + Banner Luring).
 */
export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useNetworkStatus();

  const user = useAuthStore((state) => state.user);
  const getRefreshToken = useAuthStore((state) => state.getRefreshToken);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mobileDrawerRef = useRef<HTMLDivElement | null>(null);
  const closeDrawerButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const desktopMedia = window.matchMedia('(min-width: 1024px)');
    const handleViewportChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsMobileMenuOpen(false);
      }
    };
    desktopMedia.addEventListener('change', handleViewportChange);
    return () => desktopMedia.removeEventListener('change', handleViewportChange);
  }, []);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeDrawerButtonRef.current?.focus();

    const triggerElement = menuTriggerRef.current;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsMobileMenuOpen(false);
        return;
      }

      if (event.key === 'Tab' && mobileDrawerRef.current) {
        const focusable = Array.from(
          mobileDrawerRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) {
          return;
        }
        const firstElement = focusable[0];
        const lastElement = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      triggerElement?.focus();
    };
  }, [isMobileMenuOpen]);

  if (!user) {
    return null;
  }

  const navItems = getVisibleNavItemsForRole(user.role);
  const groupedNav = ORDERED_NAV_GROUPS.map((group) =>
    navItems.filter((item) => item.group === group),
  ).filter((items) => items.length > 0);

  const shellSubtitle =
    user.role === 'CASHIER' ? 'Area Operasional Kasir' : 'Panel Manajemen & Operasional';

  const handleLogout = async () => {
    setIsLoggingOut(true);
    const refreshToken = getRefreshToken();
    try {
      await logoutRequest(refreshToken);
    } catch {
      // Sesi lokal tetap dibersihkan walaupun jaringan terputus
    } finally {
      clearSession();
      setIsLoggingOut(false);
      await navigate('/login', { replace: true });
    }
  };

  const renderNavigationLinks = (navLabel: string) => (
    <nav aria-label={navLabel} className="flex flex-1 flex-col gap-1 p-3">
      {groupedNav.map((groupItems, groupIndex) => (
        <Fragment key={groupItems[0]?.group ?? String(groupIndex)}>
          {groupIndex > 0 ? <hr className="my-2 border-border-subtle" /> : null}
          {groupItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-150',
                    isActive
                      ? 'bg-primary-900 font-semibold text-white'
                      : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-surface-canvas text-ink-primary">
      <a
        href="#admin-main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-xl focus:border focus:border-border-strong focus:bg-surface-panel focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-ink-primary focus:shadow-elevated focus:outline-2 focus:outline-white"
      >
        Lewati ke konten utama
      </a>

      <header className="sticky top-0 z-30 border-b border-primary-800 bg-primary-900 text-white">
        <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label={isMobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
              aria-expanded={isMobileMenuOpen}
              aria-controls={isMobileMenuOpen ? 'admin-mobile-drawer' : undefined}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-primary-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white lg:hidden"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Menu className="h-5 w-5" aria-hidden="true" />
              )}
            </button>

            <OrchardBrandMark size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight sm:text-base">
                {webConfig.appName}
              </p>
              <p className="hidden truncate text-xs text-primary-100 sm:block">{shellSubtitle}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
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
                  <span>Mode Offline</span>
                </>
              )}
            </span>

            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-white">{user.fullName}</p>
              <p className="text-xs text-primary-100">{ROLE_LABELS_ID[user.role]}</p>
            </div>

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
                Mode offline aktif — koneksi server terputus; perubahan akun &amp; master data
                memerlukan jaringan toko aktif
              </span>
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-border-subtle bg-surface-panel lg:flex lg:flex-col">
          {renderNavigationLinks('Menu navigasi utama')}
          <div className="border-t border-border-subtle px-4 py-3 text-xs text-ink-muted tabular-nums">
            v{webConfig.appVersion} · {ROLE_LABELS_ID[user.role]}
          </div>
        </aside>

        {isMobileMenuOpen ? (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div
              aria-hidden="true"
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-ink-primary/40"
            />
            <div
              ref={mobileDrawerRef}
              id="admin-mobile-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Drawer navigasi mobile"
              className="relative z-10 flex w-72 max-w-[85vw] flex-col border-r border-border-subtle bg-surface-panel shadow-elevated"
            >
              <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-primary">{user.fullName}</p>
                  <p className="text-xs text-ink-muted">
                    {ROLE_LABELS_ID[user.role]} · {isOnline ? 'Online' : 'Offline'}
                  </p>
                </div>
                <button
                  ref={closeDrawerButtonRef}
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Tutup drawer navigasi"
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {renderNavigationLinks('Menu navigasi mobile')}
              </div>
              <div className="border-t border-border-subtle px-4 py-3 text-xs text-ink-muted tabular-nums">
                v{webConfig.appVersion} · {ROLE_LABELS_ID[user.role]}
              </div>
            </div>
          </div>
        ) : null}

        <main id="admin-main-content" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
