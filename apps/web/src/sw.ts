import { BackgroundSyncPlugin } from 'workbox-background-sync';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies';
import type { PrecacheEntry } from 'workbox-precaching';
import {
  SW_BG_SYNC_TAG,
  SW_BROADCAST_CHANNEL,
  SW_CACHE_LIMITS,
  SW_CACHE_NAMES,
  SW_WORKBOX_QUEUE_NAME,
  type SwSyncMessagePayload,
  isCatalogReadApiRequest,
  isImageAssetRequest,
  isOfflineSyncMutationRequest,
  isStaticAssetRequest,
} from './lib/pwa/sw-cache-config';

interface SwExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface SwSyncEvent extends SwExtendableEvent {
  tag: string;
}

interface SwClientWindow {
  postMessage(message: unknown): void;
}

interface SwGlobalScope extends EventTarget {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  location: Location;
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
    matchAll(options?: { type?: string; includeUncontrolled?: boolean }): Promise<SwClientWindow[]>;
  };
}

const swSelf = globalThis as unknown as SwGlobalScope;

function broadcastSwMessage(payload: SwSyncMessagePayload): void {
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(SW_BROADCAST_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  }
}

async function notifyActiveClients(payload: SwSyncMessagePayload): Promise<void> {
  broadcastSwMessage(payload);
  const windowClients = await swSelf.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });
  for (const client of windowClients) {
    client.postMessage(payload);
  }
}

cleanupOutdatedCaches();
const swManifest = (self as unknown as SwGlobalScope).__WB_MANIFEST;
precacheAndRoute(swManifest);

// Fallback SPA shell saat offline untuk navigasi client-side
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/v1\//],
  }),
);

// Strategi aset statis (JS, CSS, Font, Worker)
registerRoute(
  ({ request, url }) =>
    isStaticAssetRequest({
      destination: request.destination,
      sameOrigin: url.origin === swSelf.location.origin,
    }),
  new StaleWhileRevalidate({
    cacheName: SW_CACHE_NAMES.staticAssets,
    plugins: [
      new ExpirationPlugin({
        maxEntries: SW_CACHE_LIMITS.staticMaxEntries,
        maxAgeSeconds: SW_CACHE_LIMITS.staticMaxAgeSeconds,
      }),
    ],
  }),
);

// Strategi gambar & ikon PWA
registerRoute(
  ({ request, url }) =>
    isImageAssetRequest({
      destination: request.destination,
      sameOrigin: url.origin === swSelf.location.origin,
    }),
  new CacheFirst({
    cacheName: SW_CACHE_NAMES.images,
    plugins: [
      new ExpirationPlugin({
        maxEntries: SW_CACHE_LIMITS.imagesMaxEntries,
        maxAgeSeconds: SW_CACHE_LIMITS.imagesMaxAgeSeconds,
      }),
    ],
  }),
);

// Strategi read-API katalog produk & kategori: NetworkFirst dengan fallback cache saat offline
registerRoute(
  ({ request, url }) =>
    isCatalogReadApiRequest({
      pathname: url.pathname,
      method: request.method,
    }),
  new NetworkFirst({
    cacheName: SW_CACHE_NAMES.catalogApi,
    networkTimeoutSeconds: SW_CACHE_LIMITS.catalogNetworkTimeoutSeconds,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) =>
          response && response.status === 200 ? response : null,
      },
      new ExpirationPlugin({
        maxEntries: SW_CACHE_LIMITS.catalogMaxEntries,
        maxAgeSeconds: SW_CACHE_LIMITS.catalogMaxAgeSeconds,
      }),
    ],
  }),
);

// Background Sync plugin untuk replay request mutasi transaksi/sync yang terputus di background
const transactionBackgroundSyncPlugin = new BackgroundSyncPlugin(SW_WORKBOX_QUEUE_NAME, {
  maxRetentionTime: SW_CACHE_LIMITS.bgSyncMaxRetentionMinutes,
  onSync: async ({ queue }) => {
    await queue.replayRequests();
    await notifyActiveClients({
      type: 'BG_SYNC_COMPLETED',
      timestamp: new Date().toISOString(),
    });
  },
});

registerRoute(
  ({ request, url }) =>
    isOfflineSyncMutationRequest({
      pathname: url.pathname,
      method: request.method,
    }),
  new NetworkOnly({
    plugins: [transactionBackgroundSyncPlugin],
  }),
  'POST',
);

// Background Sync tag eksplisit yang didaftarkan aplikasi saat transaksi masuk antrean IndexedDB
swSelf.addEventListener('sync', (rawEvent: Event) => {
  const syncEvent = rawEvent as SwSyncEvent;
  if (syncEvent.tag === SW_BG_SYNC_TAG) {
    syncEvent.waitUntil(
      notifyActiveClients({
        type: 'BG_SYNC_REQUESTED',
        timestamp: new Date().toISOString(),
      }),
    );
  }
});

swSelf.addEventListener('message', (rawEvent: Event) => {
  const msgEvent = rawEvent as MessageEvent<{ type?: string }>;
  if (msgEvent.data?.type === 'SKIP_WAITING') {
    void swSelf.skipWaiting();
  }
});

swSelf.addEventListener('activate', (rawEvent: Event) => {
  const activateEvent = rawEvent as SwExtendableEvent;
  activateEvent.waitUntil(swSelf.clients.claim());
});
