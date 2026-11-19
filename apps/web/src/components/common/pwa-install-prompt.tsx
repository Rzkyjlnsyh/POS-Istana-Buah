import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { webConfig } from '../../config/app.config';
import { Button } from '../ui/button';
import { OrchardBrandMark } from './brand-mark';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandaloneMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const mediaMatch =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mediaMatch || iosStandalone;
}

function isWithinDismissCooldown(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const raw = window.localStorage.getItem(webConfig.pwaInstallDismissKey);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < webConfig.pwaInstallDismissCooldownMs;
  } catch {
    return false;
  }
}

/**
 * Prompt instalasi PWA non-intrusif ketika browser memicu event `beforeinstallprompt` (M11-004).
 */
export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);

  useEffect(() => {
    if (isStandaloneMode() || isWithinDismissCooldown()) {
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (!deferredPrompt) {
    return null;
  }

  const handleInstall = async () => {
    setIsPrompting(true);
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setDeferredPrompt(null);
      } else {
        try {
          window.localStorage.setItem(webConfig.pwaInstallDismissKey, String(Date.now()));
        } catch {
          // Abaikan bila localStorage diblokir
        }
        setDeferredPrompt(null);
      }
    } finally {
      setIsPrompting(false);
    }
  };

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(webConfig.pwaInstallDismissKey, String(Date.now()));
    } catch {
      // Abaikan bila localStorage diblokir
    }
    setDeferredPrompt(null);
  };

  return (
    <aside
      aria-label="Pasang aplikasi Istana Buah POS"
      className="fixed bottom-4 right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-primary-700/30 bg-surface-panel p-4 shadow-elevated"
    >
      <div className="flex items-start gap-3">
        <OrchardBrandMark size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-ink-primary">Pasang Aplikasi Kasir POS</p>
          <p className="mt-0.5 text-xs text-ink-secondary">
            Akses layar penuh dari layar utama dan tetap lancar saat koneksi internet terputus.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="default"
              isLoading={isPrompting}
              loadingText="Memasang…"
              onClick={() => {
                void handleInstall();
              }}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Pasang Aplikasi</span>
            </Button>
            <Button variant="ghost" size="default" onClick={handleDismiss}>
              Nanti Saja
            </Button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Tutup banner pemasangan aplikasi"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-primary-700"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
