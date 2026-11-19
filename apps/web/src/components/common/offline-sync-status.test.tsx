import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineCryptoKey } from '../../lib/db/offline-crypto';
import { saveOfflineTransaction } from '../../lib/db/offline-transaction-service';
import { resetPosIndexedDb } from '../../lib/db/pos-indexed-db';
import * as syncApi from '../../lib/sync/sync-api';
import { useAuthStore } from '../../stores/auth-store';
import { useOfflineSyncStore } from '../../stores/offline-sync-store';
import { OfflineSyncStatusButton } from './offline-sync-status';

vi.mock('../../lib/sync/sync-api');

describe('OfflineSyncStatusButton & Auto-Sync Lifecycle (M11-002 / TC-OFFLINE-002)', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

  beforeEach(async () => {
    vi.clearAllMocks();
    resetOfflineCryptoKey();
    await resetPosIndexedDb();
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => true,
    });
    useAuthStore.getState().setSession({
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
      user: {
        id: 'user-cashier-1',
        username: 'kasir01',
        fullName: 'Dewi Kasir',
        role: 'CASHIER',
      },
    });
  });

  afterEach(async () => {
    if (originalOnLine) {
      Object.defineProperty(window.navigator, 'onLine', originalOnLine);
    }
    useAuthStore.getState().clearSession();
    await resetPosIndexedDb();
    await useOfflineSyncStore.getState().refreshStatus();
  });

  it('TC-OFFLINE-002: menampilkan badge antrean pending, auto-sync saat event online, dan resolusi konflik + lolos axe-core', async () => {
    const saved1 = await saveOfflineTransaction({
      input: {
        paymentMethod: 'CASH',
        amountPaid: 50000,
        items: [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            quantity: 1,
            unitPrice: 25000,
          },
        ],
      },
      cartItems: [
        {
          productId: '11111111-1111-4111-8111-111111111111',
          name: 'Mangga',
          productType: 'WEIGHT',
          quantity: 1,
          unitPrice: 25000,
        },
      ],
      cashierId: 'user-cashier-1',
      cashierName: 'Dewi Kasir',
    });

    await useOfflineSyncStore.getState().refreshStatus();
    const { container } = render(<OfflineSyncStatusButton />);

    const badgeButton = await screen.findByRole('button', {
      name: /1 transaksi menunggu sinkronisasi/i,
    });
    expect(badgeButton).toBeInTheDocument();

    // Uji modal antrean & lolos axe-core sebelum auto-sync
    fireEvent.click(badgeButton);
    expect(await screen.findByText(/Antrean & Resolusi Sinkronisasi Offline/i)).toBeInTheDocument();
    const a11yResults = await axe.run(container);
    expect(a11yResults.violations).toEqual([]);

    // Simulasikan perangkat kembali online -> event 'online' memicu syncPendingOperations otomatis
    vi.mocked(syncApi.submitSyncBatch).mockResolvedValueOnce({
      processed: 1,
      success: [{ clientId: saved1.clientId, serverId: 'srv-tx-1', transactionNo: 'TRX-01' }],
      conflicts: [],
      errors: [],
    });
    vi.mocked(syncApi.pullSyncDelta).mockResolvedValueOnce({
      serverTime: '2026-11-19T12:00:00.000Z',
      products: [],
      categories: [],
    });

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => {
      expect(syncApi.submitSyncBatch).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('button', { name: /menunggu sinkronisasi/i })).toBeNull();
    });
  });

  it('menampilkan modal konflik stok dan mendukung aksi Coba Ulang serta Tandai Selesai Lokal', async () => {
    const saved = await saveOfflineTransaction({
      input: {
        paymentMethod: 'CASH',
        amountPaid: 30000,
        items: [
          {
            productId: '11111111-1111-4111-8111-111111111111',
            quantity: 1,
            unitPrice: 25000,
          },
        ],
      },
      cartItems: [
        {
          productId: '11111111-1111-4111-8111-111111111111',
          name: 'Mangga Konflik',
          productType: 'WEIGHT',
          quantity: 1,
          unitPrice: 25000,
        },
      ],
      cashierId: 'user-cashier-1',
      cashierName: 'Dewi Kasir',
    });

    vi.mocked(syncApi.submitSyncBatch).mockResolvedValue({
      processed: 1,
      success: [],
      conflicts: [
        { clientId: saved.clientId, reason: 'Stok server tersisa 0', code: 'INSUFFICIENT_STOCK' },
      ],
      errors: [],
    });

    await useOfflineSyncStore.getState().syncNow(true);
    render(<OfflineSyncStatusButton />);

    const conflictBtn = await screen.findByRole('button', {
      name: /1 konflik sinkronisasi offline perlu ditinjau/i,
    });
    fireEvent.click(conflictBtn);

    expect(await screen.findByText(/Stok server tersisa 0/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tandai Selesai Lokal/i }));

    await waitFor(() => {
      expect(screen.getByText(/Semua transaksi offline tersinkron!/i)).toBeInTheDocument();
    });
  });
});
