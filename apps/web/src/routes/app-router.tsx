import { LogOut } from 'lucide-react';
import { useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router';
import { OrchardBrandMark } from '../components/common/brand-mark';
import { Button } from '../components/ui/button';
import { webConfig } from '../config/app.config';
import { bootstrapAuthSession, logoutRequest } from '../features/auth/api/auth-api';
import { LoginPage } from '../features/auth/pages/login-page';
import { getDefaultRouteForRole, useAuthStore } from '../stores/auth-store';

function AuthenticatedWorkspaceView({ sectionTitle }: { sectionTitle: string }) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const getRefreshToken = useAuthStore((state) => state.getRefreshToken);
  const clearSession = useAuthStore((state) => state.clearSession);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    const refreshToken = getRefreshToken();
    try {
      await logoutRequest(refreshToken);
    } catch {
      // Sesi lokal tetap dibersihkan meskipun jaringan terputus saat logout
    } finally {
      clearSession();
      await navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-dvh bg-surface-canvas text-ink-primary">
      <header className="border-b border-border-subtle bg-primary-900 px-4 py-3 text-white sm:px-6">
        <div className="mx-auto flex max-w-container items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <OrchardBrandMark size={36} />
            <div>
              <p className="text-sm font-bold tracking-tight">{webConfig.appName}</p>
              <p className="text-xs text-primary-100">
                {user.fullName} ({user.role})
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              void handleLogout();
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Keluar</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-container px-4 py-8 sm:px-6">
        <section className="rounded-2xl border border-border-subtle bg-surface-panel p-6 shadow-panel">
          <h1 className="text-2xl font-bold text-ink-primary">{sectionTitle}</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Selamat bertugas,{' '}
            <span className="font-semibold text-ink-primary">{user.fullName}</span>. Sesi Anda aktif
            sebagai <span className="font-semibold">{user.role}</span>.
          </p>
        </section>
      </main>
    </div>
  );
}

function RootIndexRedirect() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const user = useAuthStore((state) => state.user);

  if (isAuthenticated && user) {
    return <Navigate to={getDefaultRouteForRole(user.role)} replace />;
  }
  return <Navigate to="/login" replace />;
}

export function AppRoutes() {
  const isHydrated = useAuthStore((state) => state.isHydrated);

  useEffect(() => {
    void bootstrapAuthSession();
  }, []);

  if (!isHydrated) {
    return (
      <main
        aria-busy="true"
        className="flex min-h-dvh items-center justify-center bg-surface-canvas px-4 text-sm font-medium text-ink-secondary"
      >
        Memuat sesi keamanan {webConfig.appName}...
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<RootIndexRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/pos"
        element={<AuthenticatedWorkspaceView sectionTitle="Layar Kasir (POS)" />}
      />
      <Route
        path="/dashboard"
        element={<AuthenticatedWorkspaceView sectionTitle="Ringkasan Operasional Toko" />}
      />
      <Route path="*" element={<RootIndexRedirect />} />
    </Routes>
  );
}
