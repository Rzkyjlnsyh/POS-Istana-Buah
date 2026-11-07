import { zodResolver } from '@hookform/resolvers/zod';
import { type LoginInput, loginSchema } from '@istana-buah/shared';
import { AlertTriangle, Eye, EyeOff, Wifi, WifiOff } from 'lucide-react';
import { type KeyboardEvent, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { OrchardBrandMark } from '../../../components/common/brand-mark';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { webConfig } from '../../../config/app.config';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { type AuthErrorCopy, resolveAuthErrorCopy } from '../../../lib/api/api-error';
import { isPathAllowedForRole } from '../../../routes/navigation-config';
import { getDefaultRouteForRole, useAuthStore } from '../../../stores/auth-store';
import { loginRequest } from '../api/auth-api';

interface LocationRedirectState {
  from?: string;
}

const wibTimeFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Jakarta',
});

function formatCurrentWibClock(now: Date = new Date()): string {
  return `${wibTimeFormatter.format(now).replace('.', ':')} WIB`;
}

export function sanitizeInternalRedirectPath(candidate: unknown, fallback: string): string {
  if (typeof candidate !== 'string') {
    return fallback;
  }
  const trimmed = candidate.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.includes('\\') ||
    trimmed === '/login'
  ) {
    return fallback;
  }
  return trimmed;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useNetworkStatus();

  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setSession = useAuthStore((state) => state.setSession);

  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const [wibClock, setWibClock] = useState<string>(() => formatCurrentWibClock());
  const [serverError, setServerError] = useState<AuthErrorCopy | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWibClock(formatCurrentWibClock());
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
    mode: 'onSubmit',
  });

  if (isAuthenticated && user) {
    const fallbackRoute = getDefaultRouteForRole(user.role);
    const redirectState = location.state as LocationRedirectState | null;
    const candidateRoute = sanitizeInternalRedirectPath(redirectState?.from, fallbackRoute);
    const targetRoute = isPathAllowedForRole(candidateRoute, user.role)
      ? candidateRoute
      : fallbackRoute;
    return <Navigate to={targetRoute} replace />;
  }

  const handleCapsLockCheck = (event: KeyboardEvent<HTMLInputElement>) => {
    setIsCapsLockOn(event.getModifierState('CapsLock'));
  };

  const onSubmit = async (values: LoginInput) => {
    setIsPasswordVisible(false);
    setServerError(null);
    try {
      const session = await loginRequest(values);
      setSession(session);
      const fallbackRoute = getDefaultRouteForRole(session.user.role);
      const redirectState = location.state as LocationRedirectState | null;
      const candidateRoute = sanitizeInternalRedirectPath(redirectState?.from, fallbackRoute);
      const targetRoute = isPathAllowedForRole(candidateRoute, session.user.role)
        ? candidateRoute
        : fallbackRoute;
      await navigate(targetRoute, { replace: true });
    } catch (error: unknown) {
      setServerError(resolveAuthErrorCopy(error));
      window.requestAnimationFrame(() => {
        setFocus('password', { shouldSelect: true });
      });
    }
  };

  const usernameErrorId = errors.username ? 'login-username-error' : undefined;
  const passwordDescribedBy =
    [errors.password ? 'login-password-error' : null, isCapsLockOn ? 'login-capslock-hint' : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-canvas px-4 py-6 sm:px-6">
      <section
        aria-labelledby="login-heading"
        className="motion-panel w-full max-w-md overflow-hidden rounded-2xl border border-border-subtle bg-surface-panel shadow-panel"
      >
        <header className="bg-primary-900 px-6 py-6 text-center text-white sm:px-8">
          <div className="mx-auto mb-3.5 flex justify-center">
            <OrchardBrandMark size={48} />
          </div>
          <h1
            id="login-heading"
            className="text-xl font-bold tracking-tight text-white sm:text-2xl"
          >
            {webConfig.appName.toUpperCase()}
          </h1>
          <p className="mt-1.5 text-sm text-primary-100">
            Sistem Kasir &amp; Manajemen Operasional Toko
          </p>
        </header>

        <div
          aria-live="polite"
          className="flex items-center justify-between gap-3 border-b border-border-subtle bg-surface-subtle px-6 py-2.5 text-xs font-medium sm:px-8"
        >
          <span className="inline-flex items-center gap-2 text-ink-secondary">
            {isOnline ? (
              <>
                <Wifi className="h-3.5 w-3.5 text-primary-700" aria-hidden="true" />
                <span>Koneksi Sistem: Siap Online</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3.5 w-3.5 text-semantic-warning-ink" aria-hidden="true" />
                <span className="text-semantic-warning-ink">
                  Mode Luring: Login memerlukan Wi-Fi/LAN toko
                </span>
              </>
            )}
          </span>
          <span className="tabular-nums text-ink-muted">{wibClock}</span>
        </div>

        <form
          noValidate
          onSubmit={(event) => {
            void handleSubmit(onSubmit)(event);
          }}
          className="space-y-5 px-6 py-6 sm:px-8 sm:py-7"
        >
          {serverError ? (
            <Alert variant="danger" title={serverError.title}>
              {serverError.description}
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="login-username">Username</Label>
            <Input
              id="login-username"
              type="text"
              autoFocus
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Contoh: kasir01"
              hasError={Boolean(errors.username)}
              aria-describedby={usernameErrorId}
              readOnly={isSubmitting}
              {...register('username', {
                onChange: () => {
                  if (serverError) {
                    setServerError(null);
                  }
                },
              })}
            />
            {errors.username ? (
              <p
                id="login-username-error"
                role="alert"
                className="text-xs font-medium text-semantic-danger-ink"
              >
                {errors.username.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={isPasswordVisible ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Masukkan password akun"
                className="pr-12"
                hasError={Boolean(errors.password)}
                aria-describedby={passwordDescribedBy}
                readOnly={isSubmitting}
                onKeyDown={handleCapsLockCheck}
                onKeyUp={handleCapsLockCheck}
                {...register('password', {
                  onBlur: () => setIsCapsLockOn(false),
                  onChange: () => {
                    if (serverError) {
                      setServerError(null);
                    }
                  },
                })}
              />
              <button
                type="button"
                onClick={() => setIsPasswordVisible((prev) => !prev)}
                aria-label="Tampilkan password"
                aria-pressed={isPasswordVisible}
                disabled={isSubmitting}
                className="absolute right-0.5 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-700 disabled:opacity-50"
              >
                {isPasswordVisible ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {isCapsLockOn ? (
              <p
                id="login-capslock-hint"
                role="status"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-semantic-warning-ink"
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Caps Lock sedang aktif pada keyboard</span>
              </p>
            ) : null}
            {errors.password ? (
              <p
                id="login-password-error"
                role="alert"
                className="text-xs font-medium text-semantic-danger-ink"
              >
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 pt-1">
            <Button
              type="submit"
              size="lg"
              className="w-full"
              isLoading={isSubmitting}
              loadingText="SEDANG MASUK…"
            >
              MASUK
            </Button>
            <p className="text-center text-xs leading-relaxed text-ink-muted">
              Lupa password atau terkendala masuk? Hubungi Manajer atau Owner toko sebelum 5x gagal
              mengunci akun.
            </p>
          </div>
        </form>

        <footer className="border-t border-border-subtle bg-surface-subtle/60 px-6 py-3.5 text-center text-xs text-ink-muted tabular-nums sm:px-8">
          v{webConfig.appVersion} | {webConfig.appBrand} {webConfig.appYear}
        </footer>
      </section>
    </main>
  );
}
