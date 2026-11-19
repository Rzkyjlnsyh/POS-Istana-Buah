import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SW_BG_SYNC_TAG,
  SW_BROADCAST_CHANNEL,
  SW_CACHE_LIMITS,
  SW_CACHE_NAMES,
  isCatalogReadApiRequest,
  isImageAssetRequest,
  isOfflineSyncMutationRequest,
  isStaticAssetRequest,
} from './sw-cache-config';
import {
  applyServiceWorkerUpdate,
  registerAppServiceWorker,
  requestSwBackgroundSync,
  resetSwRegistrationForTest,
  subscribeSwSyncEvents,
} from './sw-registration';

const { mockRegister, mockMessageSkipWaiting, mockWorkboxAddEventListener } = vi.hoisted(() => ({
  mockRegister: vi.fn().mockResolvedValue(undefined),
  mockMessageSkipWaiting: vi.fn(),
  mockWorkboxAddEventListener: vi.fn(),
}));

vi.mock('workbox-window', () => ({
  Workbox: class MockWorkbox {
    register = mockRegister;
    messageSkipWaiting = mockMessageSkipWaiting;
    addEventListener = mockWorkboxAddEventListener;
  },
}));

describe('M11-003 Workbox Service Worker Config, Cache Strategies & Background Sync', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(window.navigator, 'serviceWorker');

  beforeEach(() => {
    vi.clearAllMocks();
    resetSwRegistrationForTest();
  });

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(window.navigator, 'serviceWorker', originalServiceWorker);
    }
    vi.restoreAllMocks();
  });

  it('mengklasifikasikan strategi cache aset statis, gambar, API katalog & mutasi background sync', () => {
    expect(SW_CACHE_NAMES.staticAssets).toBe('istana-buah-static-v1');
    expect(SW_CACHE_LIMITS.catalogNetworkTimeoutSeconds).toBe(3);

    expect(isStaticAssetRequest({ destination: 'script', sameOrigin: true })).toBe(true);
    expect(isStaticAssetRequest({ destination: 'style', sameOrigin: true })).toBe(true);
    expect(isStaticAssetRequest({ destination: 'font', sameOrigin: false })).toBe(false);

    expect(isImageAssetRequest({ destination: 'image', sameOrigin: true })).toBe(true);
    expect(isImageAssetRequest({ destination: 'image', sameOrigin: false })).toBe(false);

    expect(isCatalogReadApiRequest({ pathname: '/v1/products', method: 'GET' })).toBe(true);
    expect(isCatalogReadApiRequest({ pathname: '/v1/categories', method: 'GET' })).toBe(true);
    expect(isCatalogReadApiRequest({ pathname: '/v1/shifts/active', method: 'GET' })).toBe(true);
    expect(isCatalogReadApiRequest({ pathname: '/v1/products', method: 'POST' })).toBe(false);

    expect(isOfflineSyncMutationRequest({ pathname: '/v1/sync/batch', method: 'POST' })).toBe(true);
    expect(isOfflineSyncMutationRequest({ pathname: '/v1/transactions', method: 'POST' })).toBe(
      true,
    );
    expect(isOfflineSyncMutationRequest({ pathname: '/v1/transactions', method: 'GET' })).toBe(
      false,
    );
  });

  it('mendaftarkan Service Worker Workbox, sinyal update, dan Background Sync API', async () => {
    const syncRegister = vi.fn().mockResolvedValue(undefined);
    const swAddEventListener = vi.fn();
    const swRemoveEventListener = vi.fn();

    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ sync: { register: syncRegister } }),
        addEventListener: swAddEventListener,
        removeEventListener: swRemoveEventListener,
      },
    });

    const onUpdateReady = vi.fn();
    const onSyncMessage = vi.fn();
    const wb = await registerAppServiceWorker({
      enabled: true,
      onUpdateReady,
      onSyncMessage,
    });

    expect(wb).not.toBeNull();
    expect(mockRegister).toHaveBeenCalledTimes(1);

    // Simulasikan waiting event & message event pada Workbox
    const waitingHandler = mockWorkboxAddEventListener.mock.calls.find(
      (call) => call[0] === 'waiting',
    )?.[1] as (() => void) | undefined;
    waitingHandler?.();
    expect(onUpdateReady).toHaveBeenCalledTimes(1);

    applyServiceWorkerUpdate();
    expect(mockMessageSkipWaiting).toHaveBeenCalledTimes(1);

    const registeredBg = await requestSwBackgroundSync();
    expect(registeredBg).toBe(true);
    expect(syncRegister).toHaveBeenCalledWith(SW_BG_SYNC_TAG);

    // Uji listener pesan BroadcastChannel / ServiceWorker
    const onEvent = vi.fn();
    const unsubscribe = subscribeSwSyncEvents(onEvent);

    const msgHandler = swAddEventListener.mock.calls.find((call) => call[0] === 'message')?.[1] as
      ((evt: MessageEvent<unknown>) => void) | undefined;
    msgHandler?.({
      data: { type: 'BG_SYNC_REQUESTED', timestamp: '2026-11-19T14:00:00.000Z' },
    } as MessageEvent<unknown>);

    expect(onEvent).toHaveBeenCalledWith({
      type: 'BG_SYNC_REQUESTED',
      timestamp: '2026-11-19T14:00:00.000Z',
    });

    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(SW_BROADCAST_CHANNEL);
      ch.postMessage({ type: 'BG_SYNC_COMPLETED', timestamp: '2026-11-19T14:01:00.000Z' });
      ch.close();
    }

    unsubscribe();
    expect(swRemoveEventListener).toHaveBeenCalled();
  });
});
