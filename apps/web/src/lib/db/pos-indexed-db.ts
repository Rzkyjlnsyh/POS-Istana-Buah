import type { CategoryDto, PaymentMethod, ProductDto, ShiftDto } from '@istana-buah/shared';
import Dexie, { type Table } from 'dexie';
import { webConfig } from '../../config/app.config';

export interface CachedProductRecord extends ProductDto {
  normalizedName: string;
  barcodeList: string[];
  cachedAt: string;
}

export interface CachedCategoryRecord extends CategoryDto {
  cachedAt: string;
}

export interface CachedShiftRecord {
  id: string;
  userId: string;
  status: string;
  data: ShiftDto;
  cachedAt: string;
}

export type OfflineTransactionSyncStatus =
  'PENDING_SYNC' | 'SYNCING' | 'SYNCED' | 'CONFLICT' | 'FAILED';

export interface OfflineTransactionRecord {
  clientId: string;
  transactionNo: string;
  syncStatus: OfflineTransactionSyncStatus;
  encryptedPayload: string;
  totalAmount: string;
  paymentMethod: PaymentMethod;
  retryCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  conflictReason: string | null;
  serverId: string | null;
  transactedAt: string;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
}

export type SyncQueueItemStatus = 'PENDING' | 'SYNCING' | 'COMPLETED' | 'CONFLICT' | 'FAILED';

export interface SyncQueueItemRecord {
  id?: number;
  clientId: string;
  type: 'TRANSACTION';
  encryptedOperation: string;
  status: SyncQueueItemStatus;
  retryCount: number;
  nextRetryAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SyncMetadataRecord {
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * Skema IndexedDB lokal via Dexie.js untuk operasional POS offline-first (M11-001).
 */
export class IstanaBuahPosDb extends Dexie {
  products!: Table<CachedProductRecord, string>;
  categories!: Table<CachedCategoryRecord, string>;
  shifts!: Table<CachedShiftRecord, string>;
  offlineTransactions!: Table<OfflineTransactionRecord, string>;
  syncQueue!: Table<SyncQueueItemRecord, number>;
  syncMetadata!: Table<SyncMetadataRecord, string>;

  constructor(databaseName: string = webConfig.offlineDbName) {
    super(databaseName);

    this.version(1).stores({
      products: 'id, categoryId, productType, isActive, normalizedName, updatedAt, *barcodeList',
      categories: 'id, name, isActive, sortOrder',
      shifts: 'id, userId, status',
      offlineTransactions: 'clientId, transactionNo, syncStatus, transactedAt, createdAt, syncedAt',
      syncQueue: '++id, clientId, type, status, nextRetryAt, createdAt',
      syncMetadata: 'key',
    });
  }
}

let defaultDbInstance: IstanaBuahPosDb | null = null;

export function createPosIndexedDb(databaseName?: string): IstanaBuahPosDb {
  return new IstanaBuahPosDb(databaseName);
}

export function getPosIndexedDb(): IstanaBuahPosDb {
  if (!defaultDbInstance) {
    defaultDbInstance = createPosIndexedDb(webConfig.offlineDbName);
  }
  return defaultDbInstance;
}

/**
 * Menghapus & menutup database uji untuk isolasi antar skenario pengujian.
 */
export async function resetPosIndexedDb(db: IstanaBuahPosDb = getPosIndexedDb()): Promise<void> {
  await db.open();
  await db.transaction(
    'rw',
    [db.products, db.categories, db.shifts, db.offlineTransactions, db.syncQueue, db.syncMetadata],
    async () => {
      await Promise.all([
        db.products.clear(),
        db.categories.clear(),
        db.shifts.clear(),
        db.offlineTransactions.clear(),
        db.syncQueue.clear(),
        db.syncMetadata.clear(),
      ]);
    },
  );
}
