import {
  USER_ROLES,
  createEmployeeSchema,
  updateEmployeeSchema,
  type EmployeeDto,
  type ShiftDto,
  type UserRole,
} from '@istana-buah/shared';
import { Eye, EyeOff, Unlock } from 'lucide-react';
import { useEffect, useId, useState, type FormEvent } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { ROLE_LABELS_ID } from '../../../routes/navigation-config';
import { formatRupiah, formatTransactionDateTime } from '../../pos/utils/formatters';
import {
  createEmployee,
  deleteEmployee,
  getEmployeeShifts,
  updateEmployee,
} from '../api/employee-api';

interface EmployeeFormModalProps {
  isOpen: boolean;
  editingEmployee: EmployeeDto | null;
  currentUserId: string;
  onClose: () => void;
  onSaved: (employee: EmployeeDto, mode: 'create' | 'edit') => void;
}

/**
 * Modal Tambah & Ubah Pegawai beserta Reset Password serta Pembukaan Lockout Akun (FR-HR-01).
 */
export function EmployeeFormModal({
  isOpen,
  editingEmployee,
  currentUserId,
  onClose,
  onSaved,
}: EmployeeFormModalProps) {
  const isEdit = editingEmployee !== null;
  const isSelf = editingEmployee?.id === currentUserId;

  const usernameId = useId();
  const fullNameId = useId();
  const phoneId = useId();
  const roleId = useId();
  const passwordId = useId();
  const activeId = useId();
  const unlockId = useId();

  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState<UserRole>('CASHIER');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [unlockAccount, setUnlockAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editingEmployee) {
      setUsername(editingEmployee.username);
      setFullName(editingEmployee.fullName);
      setPhoneNumber(editingEmployee.phoneNumber ?? '');
      setRole(editingEmployee.role);
      setIsActive(editingEmployee.isActive);
      setUnlockAccount(false);
    } else {
      setUsername('');
      setFullName('');
      setPhoneNumber('');
      setRole('CASHIER');
      setIsActive(true);
      setUnlockAccount(false);
    }
    setPassword('');
    setShowPassword(false);
    setErrorMessage(null);
  }, [isOpen, editingEmployee]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedPhone = phoneNumber.trim();

    if (!isEdit) {
      const parsed = createEmployeeSchema.safeParse({
        username: username.trim(),
        fullName: fullName.trim(),
        password,
        role,
        phoneNumber: trimmedPhone || null,
        isActive,
      });

      if (!parsed.success) {
        setErrorMessage(parsed.error.issues[0]?.message ?? 'Data pegawai belum valid.');
        return;
      }

      setIsSubmitting(true);
      try {
        const created = await createEmployee(parsed.data);
        onSaved(created, 'create');
      } catch (err: unknown) {
        setErrorMessage(normalizeApiError(err).message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const parsed = updateEmployeeSchema.safeParse({
      fullName: fullName.trim(),
      role: isSelf ? undefined : role,
      phoneNumber: trimmedPhone || null,
      isActive: isSelf ? undefined : isActive,
      ...(password.length > 0 ? { password } : {}),
      ...(unlockAccount ? { unlockAccount: true } : {}),
    });

    if (!parsed.success) {
      setErrorMessage(parsed.error.issues[0]?.message ?? 'Pembaruan pegawai belum valid.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updateEmployee(editingEmployee.id, parsed.data);
      onSaved(updated, 'edit');
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Ubah Data: ${editingEmployee.fullName}` : 'Tambah Pegawai Baru'}
      description={
        isEdit
          ? 'Perbarui profil, peran akses, status aktif, atau atur ulang password pegawai.'
          : 'Buat akun kasir, manajer, atau pemilik baru dengan kredensial aman.'
      }
      size="default"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        {errorMessage ? (
          <Alert variant="danger" title="Validasi gagal">
            {errorMessage}
          </Alert>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={usernameId}
              className="mb-1.5 block text-sm font-medium text-ink-primary"
            >
              Username
            </label>
            <Input
              id={usernameId}
              value={username}
              disabled={isEdit}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="cth: kasir_pagi"
            />
          </div>

          <div>
            <label htmlFor={roleId} className="mb-1.5 block text-sm font-medium text-ink-primary">
              Peran Akses
            </label>
            <select
              id={roleId}
              value={role}
              disabled={isSelf}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary disabled:bg-surface-subtle disabled:opacity-70"
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS_ID[r]} ({r})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={fullNameId}
              className="mb-1.5 block text-sm font-medium text-ink-primary"
            >
              Nama Lengkap
            </label>
            <Input
              id={fullNameId}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="cth: Siti Wulandari"
            />
          </div>

          <div>
            <label htmlFor={phoneId} className="mb-1.5 block text-sm font-medium text-ink-primary">
              Nomor Telepon / HP
            </label>
            <Input
              id={phoneId}
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="08xxxxxxxxxx"
            />
          </div>
        </div>

        <div>
          <label htmlFor={passwordId} className="mb-1.5 block text-sm font-medium text-ink-primary">
            {isEdit ? 'Password Baru (Opsional — isi untuk reset)' : 'Password Awal'}
          </label>
          <div className="relative">
            <Input
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 karakter (huruf besar, kecil & angka)"
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-subtle hover:text-ink-primary"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-subtle p-3.5">
          <label
            htmlFor={activeId}
            className="inline-flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink-primary"
          >
            <input
              id={activeId}
              type="checkbox"
              checked={isActive}
              disabled={isSelf}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-border-strong text-primary-700"
            />
            <span>Akun aktif (diizinkan masuk sistem)</span>
          </label>

          {editingEmployee?.isLocked ? (
            <label
              htmlFor={unlockId}
              className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm font-semibold text-semantic-warning-ink"
            >
              <input
                id={unlockId}
                type="checkbox"
                checked={unlockAccount}
                onChange={(e) => setUnlockAccount(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong text-primary-700"
              />
              <Unlock className="h-4 w-4" aria-hidden="true" />
              <span>Buka kunci akun lockout (reset percobaan gagal login)</span>
            </label>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Menyimpan...' : isEdit ? 'Simpan Perubahan' : 'Buat Akun Pegawai'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface EmployeeShiftModalProps {
  employee: EmployeeDto | null;
  onClose: () => void;
}

/**
 * Modal Riwayat Shift Kerja & Rekap Kas per Pegawai (FR-HR-06 / M10-002).
 */
export function EmployeeShiftModal({ employee, onClose }: EmployeeShiftModalProps) {
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!employee) return;
    setIsLoading(true);
    setErrorMessage(null);
    void getEmployeeShifts(employee.id, { page: 1, limit: 20 })
      .then((res) => setShifts(res.items))
      .catch((err: unknown) => setErrorMessage(normalizeApiError(err).message))
      .finally(() => setIsLoading(false));
  }, [employee]);

  return (
    <Modal
      isOpen={employee !== null}
      onClose={onClose}
      title={employee ? `Riwayat Shift: ${employee.fullName}` : 'Riwayat Shift Pegawai'}
      description={
        employee
          ? `@${employee.username} · Peran ${ROLE_LABELS_ID[employee.role]} · Total ${employee.shiftCount} shift tercatat`
          : undefined
      }
      size="lg"
    >
      <div className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Gagal memuat riwayat shift">
            {errorMessage}
          </Alert>
        ) : null}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-ink-muted">Memuat riwayat shift pegawai...</p>
        ) : shifts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-subtle bg-surface-subtle p-6 text-center text-sm text-ink-muted">
            Pegawai ini belum pernah membuka shift kasir.
          </p>
        ) : (
          <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
            {shifts.map((sh) => {
              const diffNum = sh.cashDifference !== null ? Number(sh.cashDifference) : null;
              return (
                <div
                  key={sh.id}
                  className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink-primary tabular-nums">
                        {sh.shiftNo}
                      </span>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold',
                          sh.status === 'OPEN'
                            ? 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink'
                            : 'border-border-subtle bg-surface-subtle text-ink-secondary',
                        )}
                      >
                        {sh.status === 'OPEN' ? 'Sedang Buka' : 'Ditutup'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-muted tabular-nums">
                      Masuk: {formatTransactionDateTime(sh.openedAt)}
                      {sh.closedAt ? ` · Keluar: ${formatTransactionDateTime(sh.closedAt)}` : ''}
                    </p>
                  </div>

                  <div className="text-left text-xs tabular-nums sm:text-right">
                    <p className="font-bold text-ink-primary">
                      Omzet: {formatRupiah(Number(sh.totalSales))} ({sh.totalTransactions} trx)
                    </p>
                    <p className="text-ink-secondary">
                      Kas Awal {formatRupiah(Number(sh.openingCash))}
                      {diffNum !== null
                        ? ` · Selisih ${diffNum === 0 ? 'Sesuai' : diffNum > 0 ? `+${formatRupiah(diffNum)}` : formatRupiah(diffNum)}`
                        : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-end border-t border-border-subtle pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}

interface EmployeeDeleteModalProps {
  employee: EmployeeDto | null;
  onClose: () => void;
  onDeleted: (employee: EmployeeDto) => void;
}

export function EmployeeDeleteModal({ employee, onClose, onDeleted }: EmployeeDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setErrorMessage(null);
  }, [employee]);

  const handleConfirm = async () => {
    if (!employee) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await deleteEmployee(employee.id);
      onDeleted(employee);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={employee !== null}
      onClose={onClose}
      title="Hapus Akun Pegawai"
      description={
        employee
          ? `Akun ${employee.fullName} (@${employee.username}) akan dinonaktifkan dan dicabut seluruh sesinya.`
          : undefined
      }
      size="sm"
    >
      <div className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Tidak dapat menghapus akun">
            {errorMessage}
          </Alert>
        ) : null}

        <p className="text-sm text-ink-secondary">
          Riwayat transaksi dan shift pegawai tetap tersimpan untuk keperluan audit keuangan.
          Pastikan pegawai tidak sedang memiliki shift terbuka.
        </p>

        <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isDeleting}>
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? 'Menghapus...' : 'Ya, Hapus Pegawai'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
