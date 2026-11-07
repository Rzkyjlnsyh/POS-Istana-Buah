import type { UserRole } from '@istana-buah/shared';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { getDefaultRouteForRole, useAuthStore } from '../stores/auth-store';
import { ROLE_LABELS_ID } from './navigation-config';

export interface RequireAuthProps {
  children?: ReactNode;
}

/**
 * Guard autentikasi (M01-004): mengarahkan pengguna yang belum login ke /login
 * sembari menyimpan rute tujuan agar otomatis dipulihkan seusai login.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  if (!isAuthenticated || !user) {
    const intendedPath = `${location.pathname}${location.search}`;
    return <Navigate to="/login" state={{ from: intendedPath }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

export interface RequireRoleProps {
  allowedRoles: readonly UserRole[];
  children?: ReactNode;
}

/**
 * Guard otorisasi berbasis peran RBAC (M01-004): menolak akses peran yang tidak berwenang
 * (mis. CASHIER mencoba mengakses halaman Admin/Manager/Owner) dengan layar pemulihan jelas.
 */
export function RequireRole({ allowedRoles, children }: RequireRoleProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  if (!isAuthenticated || !user) {
    const intendedPath = `${location.pathname}${location.search}`;
    return <Navigate to="/login" state={{ from: intendedPath }} replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    const safeHome = getDefaultRouteForRole(user.role);
    const currentRoleLabel = ROLE_LABELS_ID[user.role];
    const allowedLabels = allowedRoles.map((role) => ROLE_LABELS_ID[role]).join(' atau ');

    return (
      <div className="flex min-h-[65dvh] items-center justify-center px-4 py-10 sm:px-6">
        <section
          aria-labelledby="forbidden-access-heading"
          className="w-full max-w-lg rounded-2xl border border-border-subtle bg-surface-panel p-6 shadow-panel sm:p-8"
        >
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 id="forbidden-access-heading" className="text-xl font-bold text-ink-primary">
            Halaman ini terbatas untuk {allowedLabels}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
            Anda sedang masuk sebagai{' '}
            <span className="font-semibold text-ink-primary">
              {user.fullName} ({currentRoleLabel})
            </span>
            . Demi keamanan operasional toko, peran {currentRoleLabel} tidak memiliki izin membuka
            menu ini.
          </p>
          <div className="mt-6">
            <Button
              size="lg"
              onClick={() => {
                void navigate(safeHome, { replace: true });
              }}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              <span>Kembali ke Area Kerja Utama</span>
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
