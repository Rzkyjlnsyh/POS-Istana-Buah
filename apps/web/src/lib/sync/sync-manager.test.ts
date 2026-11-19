import type { ProductDto } from '@istana-buah/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineCryptoKey } from '../db/offline-crypto';
import { queryCachedProducts, upsertCachedCatalog } from '../db/offline-catalog-service';
import {
  getOfflineTransactions,
  getPendingSyncCount,
  getSyncStatusSummary,
  saveOfflineTransaction,
} from '../db/offline-transaction-service';
import { createPosIndexedDb, resetPosIndexedDb } from '../db/pos-indexed-db';
import * as syncApi from './sync-api';
import {
  computeExponentialBackoffMs,
  dismissConflictRecord,
  retryOfflineTransaction,
  syncPendingOperations,
} from './sync-manager';

vi.mock('./sync-api');

const sampleProduct: ProductDto = {
  id: '11111111-1111-4111-8111-111111111111',
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Buah Lokal' },
  name: 'Mangga Sync',
  description: null,
  productType: 'WEIGHT',
  pricePerKg: '25000.00',
  pricePerUnit: null,
  costPerKg: null,
  costPerUnit: null,
  stockQty: '20.000',
  minStockAlert: '2.000',
  imageUrl: null,
  isActive: true,
  barcodes: [],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('M11-002 Sync Manager, Exponential Backoff & Conflict Handling', () => {
  const db = createPosIndexedDb('test_m11_002_sync_db');

  beforeEach(async () => {
    vi.clearAllMocks();
    resetOfflineCryptoKey();
    await resetPosIndexedDb(db);
    await upsertCachedCatalog([sampleProduct], [], { replaceCatalog: true, db });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetPosIndexedDb(db);
  });

  async function seedOfflineSale(qty: number): Promise<string> {
    const saved = await saveOfflineTransaction({
      input: {
        paymentMethod: 'CASH',
        amountPaid: 50000,
        items: [{ productId: sampleProduct.id, quantity: qty, unitPrice: 25000 }],
      },
      cartItems: [
        {
          productId: sampleProduct.id,
          name: sampleProduct.name,
          productType: 'WEIGHT',
          quantity: qty,
          unitPrice: 25000,
        },
      ],
      cashierId: 'cashier-1',
      cashierName: 'Sari',
      db,
    });
    return saved.clientId;
  }

  it('menghitung backoff eksponensial dengan batas maksimum secara deterministik', () => {
    expect(computeExponentialBackoffMs(0, 2000, 300000)).toBe(2000);
    expect(computeExponentialBackoffMs(1, 2000, 300000)).toBe(4000);
    expect(computeExponentialBackoffMs(2, 2000, 300000)).toBe(8000);
    expect(computeExponentialBackoffMs(10, 2000, 60000)).toBe(60000);
  });

  it('TC-OFFLINE-002: menyinkronkan 3 transaksi PENDING_SYNC ke SYNCED saat online dan menarik delta katalog', async () => {
    const c1 = await seedOfflineSale(1);
    const c2 = await seedOfflineSale(1);
    const c3 = await seedOfflineSale(1);
    expect(await getPendingSyncCount(db)).toBe(3);

    vi.mocked(syncApi.submitSyncBatch).mockResolvedValueOnce({
      processed: 3,
      success: [
        { clientId: c1, serverId: 'srv-1', transactionNo: 'TRX-1' },
        { clientId: c2, serverId: 'srv-2', transactionNo: 'TRX-2' },
        { clientId: c3, serverId: 'srv-3', transactionNo: 'TRX-3' },
      ],
      conflicts: [],
      errors: [],
    });

    vi.mocked(syncApi.pullSyncDelta).mockResolvedValueOnce({
      serverTime: '2026-11-19T12:00:00.000Z',
      products: [{ ...sampleProduct, stockQty: '17.000' }],
      categories: [],
    });

    const result = await syncPendingOperations({ db });
    expect(result.skipped).toBe(false);
    expect(result.syncedCount).toBe(3);
    expect(result.conflictCount).toBe(0);
    expect(result.pulledProducts).toBe(1);

    expect(await getPendingSyncCount(db)).toBe(0);
    const synced = await getOfflineTransactions(['SYNCED'], db);
    expect(synced).toHaveLength(3);

    const catalogAfterPull = await queryCachedProducts({}, db);
    expect(catalogAfterPull.items[0]?.stockQty).toBe('17.000');
  });

  it('menangani konflik stok (CONFLICT), backoff retry eksponensial, dan resolusi konflik manual', async () => {
    const cConflict = await seedOfflineSale(2);
    const cError = await seedOfflineSale(1);

    vi.mocked(syncApi.submitSyncBatch).mockResolvedValueOnce({
      processed: 2,
      success: [],
      conflicts: [
        { clientId: cConflict, reason: 'Stok server tidak mencukupi', code: 'INSUFFICIENT_STOCK' },
      ],
      errors: [{ clientId: cError, message: 'Timeout sementara', code: 'INTERNAL_ERROR' }],
    });

    const baseNow = new Date('2026-11-19T10:00:00.000Z');
    const firstPass = await syncPendingOperations({ db, now: baseNow });
    expect(firstPass.conflictCount).toBe(1);
    expect(firstPass.failedCount).toBe(1);

    const summary = await getSyncStatusSummary(db);
    expect(summary.conflictCount).toBe(1);
    expect(summary.pendingCount).toBe(1); // FAILED menunggu retry

    // Sebelum waktu nextRetryAt tercapai, sync otomatis dilewati (backoff active)
    const tooEarly = await syncPendingOperations({
      db,
      now: new Date(baseNow.getTime() + 500),
    });
    expect(tooEarly.skipped).toBe(true);
    expect(tooEarly.reason).toBe('empty');

    // Retry manual atas transaksi yang gagal/konflik berhasil saat stok disesuaikan
    vi.mocked(syncApi.submitSyncBatch).mockResolvedValueOnce({
      processed: 1,
      success: [{ clientId: cError, serverId: 'srv-err-ok', transactionNo: 'TRX-OK' }],
      conflicts: [],
      errors: [],
    });
    vi.mocked(syncApi.pullSyncDelta).mockResolvedValueOnce({
      serverTime: '2026-11-19T10:05:00.000Z',
      products: [],
      categories: [],
    });

    const retryResult = await retryOfflineTransaction(cError, db);
    expect(retryResult.syncedCount).toBe(1);
    expect(await getPendingSyncCount(db)).toBe(0);

    // Operator menandai konflik selesai ditinjau secara lokal
    await dismissConflictRecord(cConflict, db);
    expect((await getSyncStatusSummary(db)).conflictCount).toBe(0);
  });

  it('menjadwalkan backoff bila panggilan HTTP batch gagal jaringan', async () => {
    const c1 = await seedOfflineSale(1);
    vi.mocked(syncApi.submitSyncBatch).mockRejectedValueOnce(new Error('Network down'));

    const res = await syncPendingOperations({ db, now: new Date('2026-11-19T11:00:00.000Z') });
    expect(res.failedCount).toBe(1);

    const rows = await getOfflineTransactions(['FAILED'], db);
    expect(rows[0]?.clientId).toBe(c1);
    expect(rows[0]?.retryCount).toBe(1);
    expect(rows[0]?.lastError).toBe('Network down');
  });
});
