import type {
  CategoryDto,
  CreateTransactionInput,
  ProductDto,
  ShiftDto,
} from '@istana-buah/shared';
import { webConfig } from '../../config/app.config';
import { getCategories } from '../../features/categories/api/category-api';
import { getProducts } from '../../features/products/api/product-api';
import { getActiveShift } from '../../features/shifts/api/shift-api';
import { decryptJsonPayload } from './offline-crypto';
import {
  type CachedCategoryRecord,
  type CachedProductRecord,
  type IstanaBuahPosDb,
  getPosIndexedDb,
} from './pos-indexed-db';

const META_LAST_CATALOG_SYNC = 'lastCatalogSyncAt';
const META_LAST_PULL_AT = 'lastPullAt';
const META_DEVICE_ID = 'deviceId';

export interface OfflineCatalogQueryParams {
  search?: string;
  categoryId?: string | null;
  isActive?: boolean;
  limit?: number;
}

export interface OfflineCatalogQueryResult {
  items: ProductDto[];
  total: number;
  durationMs: number;
}

export interface WarmOfflineCatalogResult {
  skipped: boolean;
  productsCount: number;
  categoriesCount: number;
  syncedAt: string;
}

interface DecryptedPendingPayloadShape {
  input: CreateTransactionInput;
}

let warmupInFlight: Promise<WarmOfflineCatalogResult> | null = null;

function generateUuidLike(): string {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const rand = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);
  return `${rand()}${rand()}-${rand()}-${rand()}-${rand()}-${rand()}${rand()}${rand()}`;
}

export function toCachedProductRecord(product: ProductDto, cachedAt: string): CachedProductRecord {
  const barcodeList = (product.barcodes ?? [])
    .map((entry) => entry.barcode.trim().toLowerCase())
    .filter((entry) => entry.length > 0);

  return {
    ...product,
    normalizedName: product.name.toLowerCase(),
    barcodeList,
    cachedAt,
  };
}

export function stripCachedProductMetadata(record: CachedProductRecord): ProductDto {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    categoryId: record.categoryId,
    category: record.category,
    productType: record.productType,
    pricePerKg: record.pricePerKg,
    pricePerUnit: record.pricePerUnit,
    costPerKg: record.costPerKg,
    costPerUnit: record.costPerUnit,
    stockQty: record.stockQty,
    minStockAlert: record.minStockAlert,
    imageUrl: record.imageUrl,
    isActive: record.isActive,
    barcodes: record.barcodes,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function toCachedCategoryRecord(
  category: CategoryDto,
  cachedAt: string,
): CachedCategoryRecord {
  return {
    ...category,
    cachedAt,
  };
}

export function stripCachedCategoryMetadata(record: CachedCategoryRecord): CategoryDto {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    productCount: record.productCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function getOrCreateOfflineDeviceId(
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<string> {
  await db.open();
  const existing = await db.syncMetadata.get(META_DEVICE_ID);
  if (existing?.value) {
    return existing.value;
  }
  const created = `pos-${generateUuidLike()}`;
  await db.syncMetadata.put({
    key: META_DEVICE_ID,
    value: created,
    updatedAt: new Date().toISOString(),
  });
  return created;
}

async function getPendingDeductedQuantities(db: IstanaBuahPosDb): Promise<Map<string, number>> {
  const pendingRecords = await db.offlineTransactions
    .where('syncStatus')
    .anyOf(['PENDING_SYNC', 'SYNCING', 'FAILED'])
    .toArray();

  const qtyMap = new Map<string, number>();
  for (const record of pendingRecords) {
    try {
      const payload = await decryptJsonPayload<DecryptedPendingPayloadShape>(
        record.encryptedPayload,
      );
      for (const item of payload.input.items) {
        qtyMap.set(item.productId, (qtyMap.get(item.productId) ?? 0) + Number(item.quantity));
      }
    } catch {
      // Abaikan entri korup agar sinkronisasi katalog tetap berjalan
    }
  }
  return qtyMap;
}

function applyPendingStockDeduction(
  products: ProductDto[],
  pendingMap: Map<string, number>,
): ProductDto[] {
  if (pendingMap.size === 0) {
    return products;
  }
  return products.map((product) => {
    const deducted = pendingMap.get(product.id);
    if (!deducted || deducted <= 0) {
      return product;
    }
    const nextStock = Math.max(0, Number((Number(product.stockQty) - deducted).toFixed(3)));
    return {
      ...product,
      stockQty: nextStock.toFixed(3),
    };
  });
}

/**
 * Menyimpan batch produk & kategori ke IndexedDB secara atomik (memperhitungkan stok pending offline).
 */
export async function upsertCachedCatalog(
  products: ProductDto[],
  categories?: CategoryDto[],
  options?: { replaceCatalog?: boolean; db?: IstanaBuahPosDb; syncedAt?: string },
): Promise<void> {
  const db = options?.db ?? getPosIndexedDb();
  const nowIso = options?.syncedAt ?? new Date().toISOString();
  await db.open();

  const pendingMap = await getPendingDeductedQuantities(db);
  const adjustedProducts = applyPendingStockDeduction(products, pendingMap).map((p) =>
    toCachedProductRecord(p, nowIso),
  );
  const cachedCategories = categories?.map((c) => toCachedCategoryRecord(c, nowIso));

  await db.transaction('rw', [db.products, db.categories, db.syncMetadata], async () => {
    if (options?.replaceCatalog) {
      await db.products.clear();
      if (cachedCategories) {
        await db.categories.clear();
      }
    }
    if (adjustedProducts.length > 0) {
      await db.products.bulkPut(adjustedProducts);
    }
    if (cachedCategories && cachedCategories.length > 0) {
      await db.categories.bulkPut(cachedCategories);
    }
    await db.syncMetadata.put({
      key: META_LAST_CATALOG_SYNC,
      value: nowIso,
      updatedAt: nowIso,
    });
  });
}

/**
 * Memperbarui snapshot shift aktif di IndexedDB agar POS offline tetap mengenali shift kasir.
 */
export async function cacheActiveShift(
  shift: ShiftDto | null,
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<void> {
  await db.open();
  await db.transaction('rw', [db.shifts], async () => {
    await db.shifts.clear();
    if (shift) {
      await db.shifts.put({
        id: shift.id,
        userId: shift.userId,
        status: shift.status,
        data: shift,
        cachedAt: new Date().toISOString(),
      });
    }
  });
}

export async function getCachedActiveShift(
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<ShiftDto | null> {
  await db.open();
  const rows = await db.shifts.where('status').equals('OPEN').toArray();
  return rows[0]?.data ?? null;
}

/**
 * Memigrasikan seluruh katalog produk (mendukung 1.000+ SKU terpaginasi) & kategori ke IndexedDB saat login / reconnect (M11-001).
 */
export function warmOfflineCatalog(options?: {
  force?: boolean;
  db?: IstanaBuahPosDb;
}): Promise<WarmOfflineCatalogResult> {
  if (!options?.db && warmupInFlight) {
    return warmupInFlight;
  }

  const run = (async (): Promise<WarmOfflineCatalogResult> => {
    const db = options?.db ?? getPosIndexedDb();
    await db.open();

    const lastSyncMeta = await db.syncMetadata.get(META_LAST_CATALOG_SYNC);
    if (!options?.force && lastSyncMeta?.value) {
      const elapsed = Date.now() - Date.parse(lastSyncMeta.value);
      const cachedCount = await db.products.count();
      if (Number.isFinite(elapsed) && elapsed < webConfig.productCacheTtlMs && cachedCount > 0) {
        const categoriesCount = await db.categories.count();
        return {
          skipped: true,
          productsCount: cachedCount,
          categoriesCount,
          syncedAt: lastSyncMeta.value,
        };
      }
    }

    const categories = await getCategories({ isActive: true, limit: 100 });
    const allProducts: ProductDto[] = [];
    const pageSize = webConfig.offlineCatalogPageSize;
    const maxPages = webConfig.offlineMaxCatalogPages;

    for (let page = 1; page <= maxPages; page += 1) {
      const response = await getProducts({
        isActive: true,
        page,
        limit: pageSize,
      });
      allProducts.push(...response.items);
      if (response.items.length < pageSize || allProducts.length >= response.meta.total) {
        break;
      }
    }

    const syncedAt = new Date().toISOString();
    await upsertCachedCatalog(allProducts, categories, {
      replaceCatalog: true,
      db,
      syncedAt,
    });

    await db.syncMetadata.put({
      key: META_LAST_PULL_AT,
      value: syncedAt,
      updatedAt: syncedAt,
    });

    try {
      const shift = await getActiveShift();
      await cacheActiveShift(shift, db);
    } catch {
      // Shift aktif bersifat opsional jika gagal diambil saat login
    }

    return {
      skipped: false,
      productsCount: allProducts.length,
      categoriesCount: categories.length,
      syncedAt,
    };
  })();

  if (!options?.db) {
    warmupInFlight = run.finally(() => {
      warmupInFlight = null;
    });
    return warmupInFlight;
  }
  return run;
}

/**
 * Mengambil kategori aktif dari IndexedDB secara berurutan.
 */
export async function getCachedCategories(
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<CategoryDto[]> {
  await db.open();
  const records = await db.categories.toArray();
  return records
    .filter((entry) => entry.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'id'))
    .map(stripCachedCategoryMetadata);
}

/**
 * Mencari produk dari IndexedDB berdasarkan pencarian nama/barcode, kategori, dan status (< 50ms target).
 */
export async function queryCachedProducts(
  params: OfflineCatalogQueryParams = {},
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<OfflineCatalogQueryResult> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  await db.open();

  const records = params.categoryId
    ? await db.products.where('categoryId').equals(params.categoryId).toArray()
    : await db.products.toArray();

  const normalizedSearch = params.search?.trim().toLowerCase() ?? '';
  const wantActive = params.isActive;
  const maxItems = params.limit ?? webConfig.offlineCatalogPageSize;

  const filtered: ProductDto[] = [];
  for (const record of records) {
    if (wantActive !== undefined && record.isActive !== wantActive) {
      continue;
    }
    if (normalizedSearch.length > 0) {
      const matchesName = record.normalizedName.includes(normalizedSearch);
      const matchesBarcode = record.barcodeList.some((code) => code.includes(normalizedSearch));
      if (!matchesName && !matchesBarcode) {
        continue;
      }
    }
    filtered.push(stripCachedProductMetadata(record));
  }

  filtered.sort((a, b) => a.name.localeCompare(b.name, 'id'));
  const total = filtered.length;
  const items = filtered.slice(0, maxItems);

  const endedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    items,
    total,
    durationMs: Math.max(0, endedAt - startedAt),
  };
}

/**
 * Lookup cepat produk berdasarkan barcode exact melalui multi-entry index `*barcodeList`.
 */
export async function findCachedProductByBarcode(
  barcode: string,
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<ProductDto | undefined> {
  const clean = barcode.trim().toLowerCase();
  if (!clean) {
    return undefined;
  }
  await db.open();
  const match = await db.products.where('barcodeList').equals(clean).first();
  if (!match || !match.isActive) {
    return undefined;
  }
  return stripCachedProductMetadata(match);
}

export async function getCatalogCacheStats(
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<{ productsCount: number; categoriesCount: number; lastSyncedAt: string | null }> {
  await db.open();
  const [productsCount, categoriesCount, syncMeta] = await Promise.all([
    db.products.count(),
    db.categories.count(),
    db.syncMetadata.get(META_LAST_CATALOG_SYNC),
  ]);
  return {
    productsCount,
    categoriesCount,
    lastSyncedAt: syncMeta?.value ?? null,
  };
}
