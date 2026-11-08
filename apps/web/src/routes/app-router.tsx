import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AdminLayout } from '../components/layout/admin-layout';
import { PosShellLayout } from '../components/layout/pos-shell-layout';
import { webConfig } from '../config/app.config';
import { bootstrapAuthSession } from '../features/auth/api/auth-api';
import { ChangePasswordPage } from '../features/auth/pages/change-password-page';
import { LoginPage } from '../features/auth/pages/login-page';
import { CategoryPage } from '../features/categories/pages/category-page';
import { ProductPage } from '../features/products/pages/product-page';
import { getDefaultRouteForRole, useAuthStore } from '../stores/auth-store';
import { ROLE_LABELS_ID } from './navigation-config';
import { RequireAuth, RequireRole } from './protected-route';

function ModuleWorkspaceSection({ title, description }: { title: string; description: string }) {
  const user = useAuthStore((state) => state.user);

  return (
    <section className="rounded-2xl border border-border-subtle bg-surface-panel p-6 shadow-panel sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-ink-primary">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{description}</p>
      {user ? (
        <p className="mt-4 border-t border-border-subtle pt-4 text-xs text-ink-muted">
          Sesi aktif: <span className="font-semibold text-ink-primary">{user.fullName}</span> (
          {ROLE_LABELS_ID[user.role]})
        </p>
      ) : null}
    </section>
  );
}

function PosWorkspaceOverview() {
  return (
    <div className="mx-auto w-full max-w-container flex-1 px-4 py-6 sm:px-6">
      <ModuleWorkspaceSection
        title="Layar Kasir (POS)"
        description="Area kerja kasir siap menerima transaksi penjualan buah segar berbasis berat (kg) maupun satuan (unit)."
      />
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
        role="status"
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

      {/* Rute terautentikasi dengan guard peran RBAC (M01-004) */}
      <Route element={<RequireAuth />}>
        <Route element={<PosShellLayout />}>
          <Route
            path="/pos"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER', 'CASHIER']}>
                <PosWorkspaceOverview />
              </RequireRole>
            }
          />
        </Route>

        <Route element={<AdminLayout />}>
          <Route
            path="/dashboard"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER']}>
                <ModuleWorkspaceSection
                  title="Ringkasan Operasional Toko"
                  description="Pantau omset harian, transaksi aktif, dan ketersediaan stok buah segar secara real-time."
                />
              </RequireRole>
            }
          />
          <Route
            path="/shifts"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER', 'CASHIER']}>
                <ModuleWorkspaceSection
                  title="Shift Kasir"
                  description="Kelola pembukaan kas awal, ringkasan transaksi shift, dan rekonsiliasi penutupan kasir."
                />
              </RequireRole>
            }
          />
          <Route
            path="/products"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER']}>
                <ProductPage />
              </RequireRole>
            }
          />
          <Route
            path="/categories"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER']}>
                <CategoryPage />
              </RequireRole>
            }
          />
          <Route
            path="/stock"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER']}>
                <ModuleWorkspaceSection
                  title="Stok Gudang & Opname"
                  description="Catat penerimaan barang dari supplier, stok opname fisik, dan pantau mutasi stok."
                />
              </RequireRole>
            }
          />
          <Route
            path="/suppliers"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER']}>
                <ModuleWorkspaceSection
                  title="Supplier & Purchase Order"
                  description="Kelola daftar pemasok buah segar serta pesanan pembelian toko."
                />
              </RequireRole>
            }
          />
          <Route
            path="/waste"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER']}>
                <ModuleWorkspaceSection
                  title="Catatan Penyusutan (Waste)"
                  description="Dokumentasikan buah rusak, busuk, atau susut timbangan beserta nilai kerugiannya."
                />
              </RequireRole>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER']}>
                <ModuleWorkspaceSection
                  title="Laporan Penjualan & Stok"
                  description="Tinjau performa penjualan harian, produk terlaris, margin kotor, dan ekspor laporan."
                />
              </RequireRole>
            }
          />
          <Route
            path="/employees"
            element={
              <RequireRole allowedRoles={['OWNER']}>
                <ModuleWorkspaceSection
                  title="Manajemen Pegawai"
                  description="Kelola akun kasir dan manajer toko, hak akses peran, serta status keaktifan pegawai."
                />
              </RequireRole>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireRole allowedRoles={['OWNER']}>
                <ModuleWorkspaceSection
                  title="Pengaturan Sistem"
                  description="Konfigurasi identitas struk toko, tarif pajak, dan preferensi perangkat kasir."
                />
              </RequireRole>
            }
          />
          <Route
            path="/account/password"
            element={
              <RequireRole allowedRoles={['OWNER', 'MANAGER', 'CASHIER']}>
                <ChangePasswordPage />
              </RequireRole>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<RootIndexRedirect />} />
    </Routes>
  );
}
