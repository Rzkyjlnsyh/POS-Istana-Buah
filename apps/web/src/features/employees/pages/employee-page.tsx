import { USER_ROLES, type EmployeeDto, type UserRole } from '@istana-buah/shared';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { webConfig } from '../../../config/app.config';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { ROLE_LABELS_ID } from '../../../routes/navigation-config';
import { useAuthStore } from '../../../stores/auth-store';
import { formatTransactionDateTime } from '../../pos/utils/formatters';
import { getEmployees } from '../api/employee-api';
import {
  EmployeeDeleteModal,
  EmployeeFormModal,
  EmployeeShiftModal,
} from '../components/employee-modals';

type ActiveFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

/**
 * Halaman Manajemen Pegawai & Hak Akses (M10-002), khusus OWNER.
 */
export function EmployeePage() {
  const currentUser = useAuthStore((s) => s.user);
  const searchId = useId();
  const roleId = useId();
  const statusId = useId();
  const pageSize = webConfig.historyPageSize;

  const [employees, setEmployees] = useState<EmployeeDto[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);

  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeDto | null>(null);
  const [shiftEmployee, setShiftEmployee] = useState<EmployeeDto | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<EmployeeDto | null>(null);

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

  const loadEmployees = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await getEmployees({
        page,
        limit: pageSize,
        ...(roleFilter !== 'ALL' ? { role: roleFilter } : {}),
        ...(activeFilter === 'ACTIVE'
          ? { isActive: true }
          : activeFilter === 'INACTIVE'
            ? { isActive: false }
            : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      });
      setEmployees(res.items);
      setTotalItems(res.meta.total);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, roleFilter, activeFilter, debouncedSearch]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  const activeCount = employees.filter((e) => e.isActive).length;
  const lockedCount = employees.filter((e) => e.isLocked).length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">Manajemen Pegawai</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Kelola akun kasir dan manajer toko, hak akses peran, lockout keamanan, serta riwayat
            shift per pegawai.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => {
            setSuccessBanner(null);
            setEditingEmployee(null);
            setIsFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Tambah Pegawai</span>
        </Button>
      </div>

      {/* Ringkasan KPI Pegawai */}
      <section aria-label="Ringkasan status akun pegawai">
        <div className="grid divide-y divide-border-subtle rounded-2xl border border-border-subtle bg-surface-panel sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Total Pegawai Tercatat</p>
            <p className="mt-1.5 text-xl font-bold text-ink-primary tabular-nums sm:text-2xl">
              {totalItems} Akun
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Sesuai filter aktif</p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Aktif pada Halaman Ini</p>
            <p className="mt-1.5 text-xl font-bold text-primary-700 tabular-nums sm:text-2xl">
              {activeCount} Aktif
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Siap membuka kasir / panel</p>
          </div>
          <div className="p-4 sm:p-5">
            <p className="text-xs font-medium text-ink-muted">Terkunci Lockout</p>
            <p
              className={cn(
                'mt-1.5 text-xl font-bold tabular-nums sm:text-2xl',
                lockedCount > 0 ? 'text-semantic-warning-ink' : 'text-ink-primary',
              )}
            >
              {lockedCount} Terkunci
            </p>
            <p className="mt-1 text-xs text-ink-secondary">Akibat salah password 5x</p>
          </div>
        </div>
      </section>

      {/* Filter */}
      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid flex-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor={searchId}
                className="mb-1 block text-xs font-semibold text-ink-secondary"
              >
                Cari Nama / Username / HP
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <Input
                  id={searchId}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Ketik kata kunci..."
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor={roleId}
                className="mb-1 block text-xs font-semibold text-ink-secondary"
              >
                Peran Pegawai
              </label>
              <select
                id={roleId}
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value as UserRole | 'ALL');
                  setPage(1);
                }}
                className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary"
              >
                <option value="ALL">Semua Peran</option>
                {USER_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS_ID[r]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor={statusId}
                className="mb-1 block text-xs font-semibold text-ink-secondary"
              >
                Status Akun
              </label>
              <select
                id={statusId}
                value={activeFilter}
                onChange={(e) => {
                  setActiveFilter(e.target.value as ActiveFilter);
                  setPage(1);
                }}
                className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary"
              >
                <option value="ALL">Semua Status</option>
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Nonaktif</option>
              </select>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadEmployees()}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
            <span>Segarkan</span>
          </Button>
        </div>
      </section>

      {errorMessage ? (
        <Alert variant="danger" title="Gagal memuat daftar pegawai">
          {errorMessage}
        </Alert>
      ) : null}

      {successBanner ? (
        <Alert variant="success" title="Berhasil">
          {successBanner}
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-ink-muted">Memuat data pegawai...</p>
        ) : employees.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">
            Tidak ada pegawai yang sesuai filter pencarian.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs font-semibold text-ink-secondary">
                    <th className="py-2.5 pr-4">Pegawai</th>
                    <th className="py-2.5 pr-4">Peran</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 pr-4 text-right">Total Shift</th>
                    <th className="py-2.5 pr-4">Login Terakhir</th>
                    <th className="py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {employees.map((emp) => {
                    const isSelf = emp.id === currentUser?.id;
                    return (
                      <tr key={emp.id} className="hover:bg-surface-subtle/60">
                        <td className="py-3 pr-4">
                          <p className="font-semibold text-ink-primary">{emp.fullName}</p>
                          <p className="text-xs text-ink-muted">
                            @{emp.username}
                            {emp.phoneNumber ? ` · ${emp.phoneNumber}` : ''}
                          </p>
                        </td>
                        <td className="py-3 pr-4 font-medium text-ink-primary">
                          {ROLE_LABELS_ID[emp.role]}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-1.5">
                            <span
                              className={cn(
                                'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                                emp.isActive
                                  ? 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink'
                                  : 'border-border-subtle bg-surface-subtle text-ink-secondary',
                              )}
                            >
                              {emp.isActive ? 'Aktif' : 'Nonaktif'}
                            </span>
                            {emp.isLocked ? (
                              <span className="inline-flex rounded-full border border-semantic-warning-border bg-semantic-warning-bg px-2.5 py-0.5 text-xs font-semibold text-semantic-warning-ink">
                                Terkunci
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold text-ink-primary tabular-nums">
                          {emp.shiftCount}
                        </td>
                        <td className="py-3 pr-4 text-xs text-ink-secondary tabular-nums">
                          {emp.lastLoginAt ? formatTransactionDateTime(emp.lastLoginAt) : 'Belum'}
                        </td>
                        <td className="py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => setShiftEmployee(emp)}
                              aria-label={`Riwayat shift ${emp.fullName}`}
                            >
                              <Clock className="h-4 w-4" aria-hidden="true" />
                              <span>Shift</span>
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              onClick={() => {
                                setEditingEmployee(emp);
                                setIsFormOpen(true);
                              }}
                              aria-label={`Ubah ${emp.fullName}`}
                            >
                              <Edit3 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="icon"
                              disabled={isSelf}
                              onClick={() => setDeletingEmployee(emp)}
                              aria-label={`Hapus ${emp.fullName}`}
                            >
                              <Trash2
                                className="h-4 w-4 text-semantic-danger-ink"
                                aria-hidden="true"
                              />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-border-subtle md:hidden">
              {employees.map((emp) => {
                const isSelf = emp.id === currentUser?.id;
                return (
                  <div key={emp.id} className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink-primary">{emp.fullName}</p>
                        <p className="text-xs text-ink-muted">
                          @{emp.username} · {ROLE_LABELS_ID[emp.role]} · {emp.shiftCount} shift
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                          emp.isActive
                            ? 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink'
                            : 'border-border-subtle bg-surface-subtle text-ink-secondary',
                        )}
                      >
                        {emp.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShiftEmployee(emp)}
                      >
                        Riwayat Shift
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setEditingEmployee(emp);
                          setIsFormOpen(true);
                        }}
                      >
                        Ubah
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={isSelf}
                        onClick={() => setDeletingEmployee(emp)}
                      >
                        Hapus
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-4">
            <p className="text-xs text-ink-muted tabular-nums">
              Halaman {page} dari {totalPages} ({totalItems} pegawai)
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Halaman sebelumnya"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Halaman berikutnya"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <EmployeeFormModal
        isOpen={isFormOpen}
        editingEmployee={editingEmployee}
        currentUserId={currentUser?.id ?? ''}
        onClose={() => setIsFormOpen(false)}
        onSaved={(emp, mode) => {
          setIsFormOpen(false);
          setSuccessBanner(
            mode === 'create'
              ? `Akun pegawai ${emp.fullName} (@${emp.username}) berhasil dibuat.`
              : `Data pegawai ${emp.fullName} berhasil diperbarui.`,
          );
          void loadEmployees();
        }}
      />

      <EmployeeShiftModal employee={shiftEmployee} onClose={() => setShiftEmployee(null)} />

      <EmployeeDeleteModal
        employee={deletingEmployee}
        onClose={() => setDeletingEmployee(null)}
        onDeleted={(emp) => {
          setDeletingEmployee(null);
          setSuccessBanner(`Akun pegawai ${emp.fullName} berhasil dihapus dan dicabut sesinya.`);
          void loadEmployees();
        }}
      />
    </div>
  );
}
