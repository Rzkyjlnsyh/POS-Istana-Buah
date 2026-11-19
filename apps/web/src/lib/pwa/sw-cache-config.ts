export const SW_CACHE_NAMES = {
  staticAssets: 'istana-buah-static-v1',
  images: 'istana-buah-images-v1',
  catalogApi: 'istana-buah-api-catalog-v1',
} as const;

export const SW_BG_SYNC_TAG = 'istana-buah-offline-sync';
export const SW_WORKBOX_QUEUE_NAME = 'istana-buah-tx-replay-queue';
export const SW_BROADCAST_CHANNEL = 'istana-buah-sw-sync';
export const SW_URL_PATH = '/sw.js';

export const SW_CACHE_LIMITS = {
  staticMaxEntries: 80,
  staticMaxAgeSeconds: 30 * 24 * 60 * 60,
  imagesMaxEntries: 200,
  imagesMaxAgeSeconds: 30 * 24 * 60 * 60,
  catalogMaxEntries: 60,
  catalogMaxAgeSeconds: 24 * 60 * 60,
  catalogNetworkTimeoutSeconds: 3,
  bgSyncMaxRetentionMinutes: 24 * 60,
} as const;

export interface SwSyncMessagePayload {
  type: 'BG_SYNC_REQUESTED' | 'BG_SYNC_COMPLETED' | 'SW_UPDATE_READY';
  timestamp: string;
}

export function isStaticAssetRequest(params: {
  destination: string;
  sameOrigin: boolean;
}): boolean {
  return (
    params.sameOrigin &&
    (params.destination === 'style' ||
      params.destination === 'script' ||
      params.destination === 'worker' ||
      params.destination === 'font')
  );
}

export function isImageAssetRequest(params: { destination: string; sameOrigin: boolean }): boolean {
  return params.sameOrigin && params.destination === 'image';
}

export function isCatalogReadApiRequest(params: { pathname: string; method: string }): boolean {
  if (params.method !== 'GET') {
    return false;
  }
  return (
    params.pathname.startsWith('/v1/products') ||
    params.pathname.startsWith('/v1/categories') ||
    params.pathname.startsWith('/v1/shifts/active')
  );
}

export function isOfflineSyncMutationRequest(params: {
  pathname: string;
  method: string;
}): boolean {
  if (params.method !== 'POST') {
    return false;
  }
  return (
    params.pathname.startsWith('/v1/transactions') || params.pathname.startsWith('/v1/sync/batch')
  );
}
