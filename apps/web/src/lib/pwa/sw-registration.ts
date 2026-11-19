import { Workbox } from 'workbox-window';
import {
  SW_BG_SYNC_TAG,
  SW_BROADCAST_CHANNEL,
  SW_URL_PATH,
  type SwSyncMessagePayload,
} from './sw-cache-config';

export interface SwRegistrationOptions {
  enabled?: boolean;
  onUpdateReady?: () => void;
  onSyncMessage?: (payload: SwSyncMessagePayload) => void;
}

let activeWorkbox: Workbox | null = null;

/**
 * Mendaftarkan Service Worker Workbox di browser produksi dan mendengarkan sinyal pembaruan.
 */
export async function registerAppServiceWorker(
  options: SwRegistrationOptions = {},
): Promise<Workbox | null> {
  const isBrowser = typeof window !== 'undefined' && 'serviceWorker' in navigator;
  const shouldEnable = options.enabled ?? import.meta.env.PROD;

  if (!isBrowser || !shouldEnable) {
    return null;
  }

  if (activeWorkbox) {
    return activeWorkbox;
  }

  const wb = new Workbox(SW_URL_PATH, { scope: '/' });
  wb.addEventListener('waiting', () => {
    options.onUpdateReady?.();
  });

  if (options.onSyncMessage) {
    wb.addEventListener('message', (event) => {
      if (event.data && typeof event.data === 'object' && 'type' in event.data) {
        options.onSyncMessage?.(event.data as SwSyncMessagePayload);
      }
    });
  }

  activeWorkbox = wb;
  await wb.register();
  return wb;
}

export function applyServiceWorkerUpdate(): void {
  activeWorkbox?.messageSkipWaiting();
}

/**
 * Mengirim pendaftaran Background Sync ke Service Worker bila perangkat terhubung kembali.
 */
export async function requestSwBackgroundSync(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    };
    if (registration.sync && typeof registration.sync.register === 'function') {
      await registration.sync.register(SW_BG_SYNC_TAG);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Mendaftarkan listener BroadcastChannel + ServiceWorker message untuk sinkronisasi latar belakang.
 */
export function subscribeSwSyncEvents(
  onSyncEvent: (payload: SwSyncMessagePayload) => void,
): () => void {
  const cleanups: Array<() => void> = [];

  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(SW_BROADCAST_CHANNEL);
    const onChannelMessage = (event: MessageEvent<unknown>) => {
      if (event.data && typeof event.data === 'object' && 'type' in event.data) {
        onSyncEvent(event.data as SwSyncMessagePayload);
      }
    };
    channel.addEventListener('message', onChannelMessage);
    cleanups.push(() => {
      channel.removeEventListener('message', onChannelMessage);
      channel.close();
    });
  }

  if (typeof navigator !== 'undefined' && navigator.serviceWorker?.addEventListener) {
    const onSwMessage = (event: MessageEvent<unknown>) => {
      if (event.data && typeof event.data === 'object' && 'type' in event.data) {
        onSyncEvent(event.data as SwSyncMessagePayload);
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    cleanups.push(() => {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    });
  }

  return () => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  };
}

export function resetSwRegistrationForTest(): void {
  activeWorkbox = null;
}
