import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  ERROR_CODES,
  PASSWORD_MIN_LENGTH,
} from '@istana-buah/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import {
  type AuthErrorCopy,
  normalizeApiError,
  resolveChangePasswordErrorCopy,
} from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { isPathAllowedForRole, ROLE_LABELS_ID } from '../../../routes/navigation-config';
import { getDefaultRouteForRole, useAuthStore } from '../../../stores/auth-store';
import { changePasswordRequest } from '../api/auth-api';
import { sanitizeInternalRedirectPath } from './login-page';

interface PasswordRuleStatus {
  id: string;
  label: string;
  passed: boolean;
}

interface ChangePasswordLocationState {
  from?: string;
}

type PasswordFieldName = 'currentPassword' | 'newPassword' | 'confirmPassword';

function evaluatePasswordRules(candidate: string, currentPassword: string): PasswordRuleStatus[] {
  return [
    {
      id: 'min-length',
      label: `Minimal ${String(PASSWORD_MIN_LENGTH)} karakter`,
      passed: candidate.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'uppercase',
      label: 'Minimal 1 huruf besar (A–Z)',
      passed: /[A-Z]/.test(candidate),
    },
    {
      id: 'lowercase',
      label: 'Minimal 1 huruf kecil (a–z)',
      passed: /[a-z]/.test(candidate),
    },
    {
      id: 'digit',
      label: 'Minimal 1 angka (0–9)',
      passed: /[0-9]/.test(candidate),
    },
    {
      id: 'distinct',
      label: 'Berbeda dari password lama',
      passed: candidate.length > 0 && currentPassword.length > 0 && candidate !== currentPassword,
    },
  ];
}

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useNetworkStatus();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [activeField, setActiveField] = useState<PasswordFieldName | null>(null);
  const [serverError, setServerError] = useState<AuthErrorCopy | null>(null);

  const serverAlertRef = useRef<HTMLDivElement | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
    mode: 'onTouched',
  });

  if (!user) {
    return null;
  }

  const watchedCurrent = watch('currentPassword', '');
  const watchedNew = watch('newPassword', '');
  const passwordRules = evaluatePasswordRules(watchedNew, watchedCurrent);

  const handleCapsLockCheck = (event: KeyboardEvent<HTMLInputElement>) => {
    setIsCapsLockOn(event.getModifierState('CapsLock'));
  };

  const describeField = (
    field: PasswordFieldName,
    errorId: string | null,
    extraId?: string,
  ): string | undefined => {
    const ids = [
      errorId,
      extraId ?? null,
      isCapsLockOn && activeField === field ? 'cp-capslock-status' : null,
    ].filter(Boolean);
    return ids.length > 0 ? ids.join(' ') : undefined;
  };

  const onSubmit = async (values: ChangePasswordInput) => {
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setServerError(null);

    try {
      await changePasswordRequest(values);
      clearSession({
        title: 'Password berhasil diperbarui',
        description:
          'Sesi lama telah diamankan. Silakan masuk kembali menggunakan password baru Anda.',
      });
      await navigate('/login', { replace: true });
    } catch (error: unknown) {
      const normalized = normalizeApiError(error);
      const copy = resolveChangePasswordErrorCopy(normalized);
      setServerError(copy);

      if (
        normalized.code === ERROR_CODES.INVALID_CURRENT_PASSWORD ||
        normalized.code === ERROR_CODES.INVALID_CREDENTIALS
      ) {
        setError('currentPassword', {
          type: 'server',
          message: 'Periksa kembali password saat ini yang sedang Anda gunakan',
        });
        window.requestAnimationFrame(() => {
          setFocus('currentPassword', { shouldSelect: true });
        });
      } else {
        window.requestAnimationFrame(() => {
          serverAlertRef.current?.focus();
        });
      }
    }
  };

  const handleCancel = () => {
    const defaultTarget = getDefaultRouteForRole(user.role);
    const originState = location.state as ChangePasswordLocationState | null;
    const candidatePath = sanitizeInternalRedirectPath(originState?.from, defaultTarget);
    const safeTarget =
      candidatePath !== '/account/password' && isPathAllowedForRole(candidatePath, user.role)
        ? candidatePath
        : defaultTarget;
    void navigate(safeTarget);
  };

  return (
    <section
      aria-labelledby="change-password-heading"
      className="motion-panel mx-auto max-w-xl overflow-hidden rounded-2xl border border-border-subtle bg-surface-panel shadow-panel"
    >
      <header className="bg-primary-900 px-6 py-5 text-white sm:px-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary-700 bg-primary-800/80">
            <KeyRound className="h-5 w-5 text-primary-100" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1
              id="change-password-heading"
              className="text-xl font-bold tracking-tight text-white sm:text-2xl"
            >
              Ubah Password Akun
            </h1>
            <p className="mt-0.5 text-sm text-primary-100">
              Pembaruan kredensial staf operasional &amp; pencabutan sesi perangkat lama
            </p>
          </div>
        </div>
      </header>

      {/* Signature Move: Pita status kesiapan operasional bersegmen tanpa lompatan tinggi */}
      <div
        aria-live="polite"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle bg-surface-subtle px-6 py-2.5 text-xs sm:px-8"
      >
        <span className="font-medium text-ink-secondary">
          Akun:{' '}
          <strong className="font-semibold text-ink-primary">
            {user.fullName} ({user.username} · {ROLE_LABELS_ID[user.role]})
          </strong>
        </span>

        <div className="flex items-center gap-3">
          {isCapsLockOn ? (
            <span
              id="cp-capslock-status"
              role="status"
              className="inline-flex items-center gap-1 font-semibold text-semantic-warning-ink"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Caps Lock Aktif</span>
            </span>
          ) : null}

          <span
            className={cn(
              'inline-flex items-center gap-1.5 font-semibold',
              isOnline ? 'text-primary-900' : 'text-semantic-warning-ink',
            )}
          >
            {isOnline ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-primary-700" aria-hidden="true" />
                <span>Server Siap</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-semantic-warning" aria-hidden="true" />
                <span>Mode Offline</span>
              </>
            )}
          </span>
        </div>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          void handleSubmit(onSubmit)(event);
        }}
        className="px-6 py-6 sm:px-8 sm:py-7"
      >
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={user.username}
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
        />

        <div className="space-y-5">
          {!isOnline ? (
            <Alert variant="warning" title="Koneksi ke server toko diperlukan">
              Perubahan password tidak dapat disimpan ke antrean offline. Pastikan Wi-Fi/LAN toko
              aktif sebelum menyimpan password baru.
            </Alert>
          ) : null}

          {serverError ? (
            <Alert ref={serverAlertRef} tabIndex={-1} variant="danger" title={serverError.title}>
              {serverError.description}
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="cp-current-password">Password Saat Ini</Label>
            <div className="relative">
              <Input
                id="cp-current-password"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Masukkan password saat ini"
                className="pr-12"
                hasError={Boolean(errors.currentPassword)}
                aria-describedby={describeField(
                  'currentPassword',
                  errors.currentPassword ? 'cp-current-error' : null,
                )}
                readOnly={isSubmitting}
                onFocus={() => setActiveField('currentPassword')}
                onKeyDown={handleCapsLockCheck}
                onKeyUp={handleCapsLockCheck}
                {...register('currentPassword', {
                  onBlur: () =>
                    setActiveField((prev) => (prev === 'currentPassword' ? null : prev)),
                  onChange: () => {
                    if (serverError) {
                      setServerError(null);
                    }
                  },
                })}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                aria-label="Tampilkan password saat ini"
                aria-pressed={showCurrent}
                disabled={isSubmitting}
                className="absolute right-0.5 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-700 disabled:opacity-50"
              >
                {showCurrent ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.currentPassword ? (
              <p
                id="cp-current-error"
                role="alert"
                className="text-xs font-medium text-semantic-danger-ink"
              >
                {errors.currentPassword.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-new-password">Password Baru</Label>
            <div className="relative">
              <Input
                id="cp-new-password"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Masukkan password baru"
                className="pr-12"
                hasError={Boolean(errors.newPassword)}
                aria-describedby={describeField(
                  'newPassword',
                  errors.newPassword ? 'cp-new-error' : null,
                  'cp-password-rules',
                )}
                readOnly={isSubmitting}
                onFocus={() => setActiveField('newPassword')}
                onKeyDown={handleCapsLockCheck}
                onKeyUp={handleCapsLockCheck}
                {...register('newPassword', {
                  onBlur: () => setActiveField((prev) => (prev === 'newPassword' ? null : prev)),
                  onChange: () => {
                    if (serverError) {
                      setServerError(null);
                    }
                  },
                })}
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                aria-label="Tampilkan password baru"
                aria-pressed={showNew}
                disabled={isSubmitting}
                className="absolute right-0.5 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-700 disabled:opacity-50"
              >
                {showNew ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.newPassword ? (
              <p
                id="cp-new-error"
                role="alert"
                className="text-xs font-medium text-semantic-danger-ink"
              >
                {errors.newPassword.message}
              </p>
            ) : null}

            <ul
              id="cp-password-rules"
              aria-label="Syarat kekuatan password baru"
              className="mt-2 grid gap-1.5 border-t border-border-subtle pt-3 text-xs sm:grid-cols-2"
            >
              {passwordRules.map((rule) => (
                <li
                  key={rule.id}
                  className={cn(
                    'flex items-center gap-2',
                    rule.passed ? 'font-medium text-primary-900' : 'text-ink-muted',
                  )}
                >
                  {rule.passed ? (
                    <CheckCircle2
                      className="h-3.5 w-3.5 shrink-0 text-primary-700"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                  )}
                  <span>{rule.label}</span>
                  <span className="sr-only">
                    {rule.passed ? '(Terpenuhi)' : '(Belum terpenuhi)'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm-password">Konfirmasi Password Baru</Label>
            <div className="relative">
              <Input
                id="cp-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Ketik ulang password baru"
                className="pr-12"
                hasError={Boolean(errors.confirmPassword)}
                aria-describedby={describeField(
                  'confirmPassword',
                  errors.confirmPassword ? 'cp-confirm-error' : null,
                )}
                readOnly={isSubmitting}
                onFocus={() => setActiveField('confirmPassword')}
                onKeyDown={handleCapsLockCheck}
                onKeyUp={handleCapsLockCheck}
                {...register('confirmPassword', {
                  onBlur: () =>
                    setActiveField((prev) => (prev === 'confirmPassword' ? null : prev)),
                  onChange: () => {
                    if (serverError) {
                      setServerError(null);
                    }
                  },
                })}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label="Tampilkan konfirmasi password baru"
                aria-pressed={showConfirm}
                disabled={isSubmitting}
                className="absolute right-0.5 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-700 disabled:opacity-50"
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.confirmPassword ? (
              <p
                id="cp-confirm-error"
                role="alert"
                className="text-xs font-medium text-semantic-danger-ink"
              >
                {errors.confirmPassword.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-4 border-t border-border-subtle pt-4">
            <p className="text-xs leading-relaxed text-ink-muted">
              Menyimpan password baru langsung mengeluarkan sesi ini dan seluruh perangkat lain
              (pastikan transaksi kasir yang sedang diketik telah diselesaikan). Lupa password saat
              ini? Hubungi Manajer atau Owner toko.
            </p>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="lg"
                className="sm:min-w-52"
                disabled={!isOnline}
                isLoading={isSubmitting}
                loadingText="Menyimpan…"
              >
                Simpan Password Baru
              </Button>
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}
