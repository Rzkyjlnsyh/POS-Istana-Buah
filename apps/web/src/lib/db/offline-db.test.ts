import type { CategoryDto, ProductDto } from '@istana-buah/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as categoryApi from '../../features/categories/api/category-api';
import * as productApi from '../../features/products/api/product-api';
import * as shiftApi from '../../features/shifts/api/shift-api';
import {
  cacheActiveShift,
  findCachedProductByBarcode,
  getCachedActiveShift,
  getCachedCategories,
  getCatalogCacheStats,
  queryCachedProducts,
  upsertCachedCatalog,
  warmOfflineCatalog,
} from './offline-catalog-service';
import { decryptJsonPayload, encryptJsonPayload, resetOfflineCryptoKey } from './offline-crypto';
import {
  OfflineStockError,
  dismissOfflineTransactionConflict,
  getOfflineTransactions,
  getPendingSyncCount,
  getSyncStatusSummary,
  isNetworkFailureError,
  markOfflineTransactionConflict,
  markOfflineTransactionSynced,
  saveOfflineTransaction,
  scheduleOfflineTransactionRetry,
} from './offline-transaction-service';
import { createPosIndexedDb, resetPosIndexedDb } from './pos-indexed-db';

vi.mock('../../features/categories/api/category-api');
vi.mock('../../features/products/api/product-api');
vi.mock('../../features/shifts/api/shift-api');

function buildMockCategory(idx: number): CategoryDto {
  return {
    id: `cat-${idx}`,
    name: idx === 1 ? 'Buah Lokal' : `Kategori ${idx}`,
    description: 'Kategori buah segar',
    sortOrder: idx,
    isActive: true,
    productCount: 10,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

function buildMockProduct(idx: number): ProductDto {
  const isWeight = idx % 2 === 1;
  return {
    id: `prod-${idx}`,
    categoryId: idx <= 550 ? 'cat-1' : 'cat-2',
    category: {
      id: idx <= 550 ? 'cat-1' : 'cat-2',
      name: idx <= 550 ? 'Buah Lokal' : 'Kategori 2',
    },
    name: idx === 1 ? 'Mangga Harum Manis' : `Buah Segar Varian ${idx}`,
    description: 'Buah pilihan kualitas super',
    productType: isWeight ? 'WEIGHT' : 'UNIT',
    pricePerKg: isWeight ? '25000.00' : null,
    pricePerUnit: isWeight ? null : '15000.00',
    costPerKg: isWeight ? '18000.00' : null,
    costPerUnit: isWeight ? null : '10000.00',
    stockQty: '10.000',
    minStockAlert: '2.000',
    imageUrl: null,
    isActive: true,
    barcodes: [
      { id: `bc-${idx}`, barcode: `899100${String(idx).padStart(6, '0')}`, isPrimary: true },
    ],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

describe('M11-001 Offline IndexedDB Setup, Crypto & Offline Transaction Queue', () => {
  const db = createPosIndexedDb('test_m11_001_pos_db');

  beforeEach(async () => {
    vi.clearAllMocks();
    resetOfflineCryptoKey();
    await resetPosIndexedDb(db);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetPosIndexedDb(db);
  });

  it('mengenkripsi dan mendekripsi payload JSON transaksi secara aman (NFR-OFF-03)', async () => {
    const secretPayload = {
      transactionNo: 'OFF-20261119-0001',
      totalAmount: '37500.00',
      cashierName: 'Kasir Dewi',
    };

    const encrypted = await encryptJsonPayload(secretPayload);
    expect(encrypted).not.toContain('37500.00');
    expect(encrypted).not.toContain('Kasir Dewi');
    expect(encrypted.startsWith('v1:')).toBe(true);

    const decrypted = await decryptJsonPayload<typeof secretPayload>(encrypted);
    expect(decrypted).toEqual(secretPayload);

    await expect(decryptJsonPayload('invalid-payload')).rejects.toThrow();
  });

  it('memigrasi 1.100 produk terpaginasi saat login dan melakukan query cepat di IndexedDB', async () => {
    const categories = [buildMockCategory(1), buildMockCategory(2)];
    const allProducts = Array.from({ length: 1100 }, (_, i) => buildMockProduct(i + 1));

    vi.mocked(categoryApi.getCategories).mockResolvedValue(categories);
    vi.mocked(productApi.getProducts).mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      const limit = params?.limit ?? 100;
      const start = (page - 1) * limit;
      return {
        items: allProducts.slice(start, start + limit),
        meta: { page, limit, total: allProducts.length },
      };
    });
    vi.mocked(shiftApi.getActiveShift).mockResolvedValue({
      id: 'shift-1',
      shiftNo: 'SHF-20261119-01',
      userId: 'user-cashier',
      cashierName: 'Budi Kasir',
      status: 'OPEN',
      openingCash: '200000.00',
      expectedCash: '200000.00',
      closingCash: null,
      cashDifference: null,
      totalTransactions: 0,
      totalSales: '0.00',
      notes: null,
      summary: {
        cashSales: '0.00',
        qrisSales: '0.00',
        bankTransferSales: '0.00',
        mixedSales: '0.00',
        completedTransactions: 0,
        voidedTransactions: 0,
      },
      openedAt: '2026-11-19T01:00:00.000Z',
      closedAt: null,
      createdAt: '2026-11-19T01:00:00.000Z',
      updatedAt: '2026-11-19T01:00:00.000Z',
    });

    const firstWarm = await warmOfflineCatalog({ force: true, db });
    expect(firstWarm.skipped).toBe(false);
    expect(firstWarm.productsCount).toBe(1100);
    expect(firstWarm.categoriesCount).toBe(2);
    expect(productApi.getProducts).toHaveBeenCalledTimes(11);

    const stats = await getCatalogCacheStats(db);
    expect(stats.productsCount).toBe(1100);
    expect(stats.categoriesCount).toBe(2);
    expect(stats.lastSyncedAt).not.toBeNull();

    // Panggilan non-force kedua dalam TTL harus dilewati tanpa fetch API ulang
    const secondWarm = await warmOfflineCatalog({ db });
    expect(secondWarm.skipped).toBe(true);
    expect(productApi.getProducts).toHaveBeenCalledTimes(11);

    const cachedCats = await getCachedCategories(db);
    expect(cachedCats.map((c) => c.id)).toEqual(['cat-1', 'cat-2']);

    const cachedShift = await getCachedActiveShift(db);
    expect(cachedShift?.shiftNo).toBe('SHF-20261119-01');

    // Pencarian nama & filter kategori
    const searchRes = await queryCachedProducts(
      { search: 'harum manis', categoryId: 'cat-1', isActive: true, limit: 50 },
      db,
    );
    expect(searchRes.items).toHaveLength(1);
    expect(searchRes.items[0]?.id).toBe('prod-1');
    expect(searchRes.durationMs).toBeLessThan(250);

    // Lookup barcode via multi-entry index
    const barcodeHit = await findCachedProductByBarcode('899100001050', db);
    expect(barcodeHit?.id).toBe('prod-1050');
  });

  it('menyimpan transaksi offline terenkripsi, mengurangi stok lokal, & menyertakan receiptData (TC-OFFLINE-001)', async () => {
    const product = buildMockProduct(1); // Mangga, stok 10.000 kg, harga 25000
    await upsertCachedCatalog([product], [buildMockCategory(1)], { replaceCatalog: true, db });
    await cacheActiveShift(null, db);

    const saved = await saveOfflineTransaction({
      input: {
        paymentMethod: 'CASH',
        amountPaid: 50000,
        items: [{ productId: product.id, quantity: 1.5, unitPrice: 25000 }],
      },
      cartItems: [
        {
          productId: product.id,
          name: product.name,
          productType: 'WEIGHT',
          quantity: 1.5,
          unitPrice: 25000,
        },
      ],
      cashierId: 'cashier-1',
      cashierName: 'Sari Kasir',
      shiftId: 'shift-1',
      db,
    });

    expect(saved.transaction.transactionNo).toMatch(/^OFF-\d{8}-0001$/);
    expect(saved.transaction.totalAmount).toBe('37500.00');
    expect(saved.transaction.changeAmount).toBe('12500.00');
    expect(saved.transaction.receiptData?.items[0]?.name).toBe('Mangga Harum Manis');
    expect(saved.transaction.receiptData?.footerMessage).toContain('Menunggu Sinkronisasi');

    // Stok lokal berkurang dari 10.000 -> 8.500 kg
    const updatedProduct = await findCachedProductByBarcode('899100000001', db);
    expect(updatedProduct?.stockQty).toBe('8.500');

    // Antrean pending tercatat
    expect(await getPendingSyncCount(db)).toBe(1);
    const offlineList = await getOfflineTransactions(['PENDING_SYNC'], db);
    expect(offlineList).toHaveLength(1);
    expect(offlineList[0]?.payload.input.clientId).toBe(saved.clientId);

    // Pembelian offline melebihi sisa stok lokal (9 > 8.5) ditolak
    await expect(
      saveOfflineTransaction({
        input: {
          paymentMethod: 'CASH',
          amountPaid: 300000,
          items: [{ productId: product.id, quantity: 9, unitPrice: 25000 }],
        },
        cartItems: [
          {
            productId: product.id,
            name: product.name,
            productType: 'WEIGHT',
            quantity: 9,
            unitPrice: 25000,
          },
        ],
        cashierId: 'cashier-1',
        cashierName: 'Sari Kasir',
        db,
      }),
    ).rejects.toBeInstanceOf(OfflineStockError);

    // Transisi status: retry -> conflict -> dismiss -> synced
    await scheduleOfflineTransactionRetry(
      saved.clientId,
      'Jaringan terputus',
      '2026-11-19T12:00:00.000Z',
      db,
    );
    expect((await getSyncStatusSummary(db)).pendingCount).toBe(1);

    await markOfflineTransactionConflict(saved.clientId, 'Stok server berubah', db);
    expect((await getSyncStatusSummary(db)).conflictCount).toBe(1);

    await markOfflineTransactionSynced(saved.clientId, 'server-tx-uuid-1', db);
    const summaryAfterSync = await getSyncStatusSummary(db);
    expect(summaryAfterSync.pendingCount).toBe(0);
    expect(summaryAfterSync.syncedCount).toBe(1);
    expect(summaryAfterSync.offlineSince).toBeNull();

    await dismissOfflineTransactionConflict(saved.clientId, db);
    expect((await getSyncStatusSummary(db)).syncedCount).toBe(0);
  });

  it('mengidentifikasi error jaringan secara akurat untuk fallback offline', () => {
    expect(isNetworkFailureError({ isAxiosError: true, code: 'ERR_NETWORK' })).toBe(true);
    expect(isNetworkFailureError(new TypeError('Failed to fetch'))).toBe(true);
    expect(
      isNetworkFailureError({
        isAxiosError: true,
        response: { status: 422, data: { message: 'Stok kurang' } },
      }),
    ).toBe(false);
  });
});
