import type { SyncBatchOperationDto } from '@istana-buah/shared';
import { webConfig } from '../../config/app.config';
import { getOrCreateOfflineDeviceId, upsertCachedCatalog } from '../db/offline-catalog-service';
import { decryptJsonPayload } from '../db/offline-crypto';
import {
  type OfflineTransactionPayloadEnvelope,
  dismissOfflineTransactionConflict,
  markOfflineTransactionConflict,
  markOfflineTransactionSynced,
  scheduleOfflineTransactionRetry,
} from '../db/offline-transaction-service';
import {
  type IstanaBuahPosDb,
  type OfflineTransactionRecord,
  getPosIndexedDb,
} from '../db/pos-indexed-db';
import { pullSyncDelta, submitSyncBatch } from './sync-api';

const META_LAST_PULL_AT = 'lastPullAt';

export interface SyncCycleResult {
  skipped: boolean;
  reason?: 'offline' | 'empty';
  syncedCount: number;
  conflictCount: number;
  failedCount: number;
  pulledProducts: number;
  pulledCategories: number;
  serverTime: string | null;
}

export interface SyncPendingOptions {
  db?: IstanaBuahPosDb;
  force?: boolean;
  now?: Date;
}

let activeSyncPromise: Promise<SyncCycleResult> | null = null;

/**
 * Menghitung jeda backoff eksponensial untuk retry sinkronisasi yang gagal (M11-002).
 */
export function computeExponentialBackoffMs(
  retryCount: number,
  baseMs: number = webConfig.offlineBackoffBaseMs,
  maxMs: number = webConfig.offlineBackoffMaxMs,
): number {
  const safeExponent = Math.max(0, Math.min(retryCount, 12));
  return Math.min(maxMs, baseMs * Math.pow(2, safeExponent));
}

function resolveSyncErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (typeof msg === 'string' && msg.trim().length > 0) {
      return msg;
    }
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return 'Koneksi ke server sinkronisasi gagal sementara';
}

async function runSyncCycle(options: SyncPendingOptions = {}): Promise<SyncCycleResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      skipped: true,
      reason: 'offline',
      syncedCount: 0,
      conflictCount: 0,
      failedCount: 0,
      pulledProducts: 0,
      pulledCategories: 0,
      serverTime: null,
    };
  }

  const db = options.db ?? getPosIndexedDb();
  await db.open();
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const force = Boolean(options.force);

  const [candidates, queueRows] = await Promise.all([
    db.offlineTransactions
      .where('syncStatus')
      .anyOf(['PENDING_SYNC', 'FAILED'])
      .sortBy('createdAt'),
    db.syncQueue.toArray(),
  ]);

  const queueByClientId = new Map(queueRows.map((q) => [q.clientId, q]));
  const eligibleRows: OfflineTransactionRecord[] = [];

  for (const row of candidates) {
    if (!force) {
      if (row.retryCount >= webConfig.offlineMaxRetryCount) {
        continue;
      }
      const q = queueByClientId.get(row.clientId);
      if (q?.nextRetryAt) {
        const nextMs = Date.parse(q.nextRetryAt);
        if (Number.isFinite(nextMs) && nextMs > nowMs) {
          continue;
        }
      }
    }
    eligibleRows.push(row);
  }

  if (eligibleRows.length === 0 && !force) {
    return {
      skipped: true,
      reason: 'empty',
      syncedCount: 0,
      conflictCount: 0,
      failedCount: 0,
      pulledProducts: 0,
      pulledCategories: 0,
      serverTime: null,
    };
  }

  let syncedCount = 0;
  let conflictCount = 0;
  let failedCount = 0;

  if (eligibleRows.length > 0) {
    const deviceId = await getOrCreateOfflineDeviceId(db);
    const batchSize = webConfig.offlineSyncBatchSize;

    for (let offset = 0; offset < eligibleRows.length; offset += batchSize) {
      const chunk = eligibleRows.slice(offset, offset + batchSize);
      const operations: SyncBatchOperationDto[] = [];
      const rowByClientId = new Map<string, OfflineTransactionRecord>();

      for (const record of chunk) {
        try {
          const decrypted = await decryptJsonPayload<OfflineTransactionPayloadEnvelope>(
            record.encryptedPayload,
          );
          operations.push({
            type: 'TRANSACTION',
            clientId: record.clientId,
            data: decrypted.input,
            timestamp: record.transactedAt,
          });
          rowByClientId.set(record.clientId, record);
        } catch (err) {
          await markOfflineTransactionConflict(
            record.clientId,
            err instanceof Error ? err.message : 'Data transaksi lokal rusak / gagal didekripsi',
            db,
          );
          conflictCount += 1;
        }
      }

      if (operations.length === 0) {
        continue;
      }

      const chunkClientIds = operations.map((op) => op.clientId);
      await db.transaction('rw', [db.offlineTransactions, db.syncQueue], async () => {
        const attemptIso = new Date().toISOString();
        await db.offlineTransactions.where('clientId').anyOf(chunkClientIds).modify({
          syncStatus: 'SYNCING',
          lastAttemptAt: attemptIso,
          updatedAt: attemptIso,
        });
        await db.syncQueue.where('clientId').anyOf(chunkClientIds).modify({
          status: 'SYNCING',
          updatedAt: attemptIso,
        });
      });

      try {
        const response = await submitSyncBatch({ deviceId, operations });

        for (const item of response.success) {
          await markOfflineTransactionSynced(item.clientId, item.serverId, db);
          syncedCount += 1;
        }

        for (const conflict of response.conflicts) {
          await markOfflineTransactionConflict(conflict.clientId, conflict.reason, db);
          conflictCount += 1;
        }

        for (const opError of response.errors) {
          const rec = rowByClientId.get(opError.clientId);
          const delay = computeExponentialBackoffMs(rec?.retryCount ?? 0);
          const nextRetryIso = new Date(nowMs + delay).toISOString();
          await scheduleOfflineTransactionRetry(
            opError.clientId,
            opError.message,
            nextRetryIso,
            db,
          );
          failedCount += 1;
        }
      } catch (err: unknown) {
        const errMessage = resolveSyncErrorMessage(err);
        for (const op of operations) {
          const rec = rowByClientId.get(op.clientId);
          const delay = computeExponentialBackoffMs(rec?.retryCount ?? 0);
          const nextRetryIso = new Date(nowMs + delay).toISOString();
          await scheduleOfflineTransactionRetry(op.clientId, errMessage, nextRetryIso, db);
          failedCount += 1;
        }
      }
    }
  }

  let pulledProducts = 0;
  let pulledCategories = 0;
  let serverTime: string | null = null;

  if (syncedCount > 0 || force) {
    try {
      const lastPullMeta = await db.syncMetadata.get(META_LAST_PULL_AT);
      const pullRes = await pullSyncDelta({
        since: lastPullMeta?.value,
        types: ['products', 'categories'],
      });
      serverTime = pullRes.serverTime;
      pulledProducts = pullRes.products.length;
      pulledCategories = pullRes.categories.length;

      if (pulledProducts > 0 || pulledCategories > 0) {
        await upsertCachedCatalog(pullRes.products, pullRes.categories, {
          replaceCatalog: false,
          db,
          syncedAt: pullRes.serverTime,
        });
      }

      await db.syncMetadata.put({
        key: META_LAST_PULL_AT,
        value: pullRes.serverTime,
        updatedAt: pullRes.serverTime,
      });
    } catch {
      // Delta pull bersifat best-effort agar hasil batch upload tetap dilaporkan bersih
    }
  }

  return {
    skipped: false,
    syncedCount,
    conflictCount,
    failedCount,
    pulledProducts,
    pulledCategories,
    serverTime,
  };
}

/**
 * Menjalankan satu siklus sinkronisasi antrean offline & delta katalog dengan penguncian single-flight.
 */
export function syncPendingOperations(options: SyncPendingOptions = {}): Promise<SyncCycleResult> {
  if (options.db) {
    return runSyncCycle(options);
  }
  if (activeSyncPromise) {
    return activeSyncPromise;
  }
  activeSyncPromise = runSyncCycle(options).finally(() => {
    activeSyncPromise = null;
  });
  return activeSyncPromise;
}

/**
 * Mengembalikan entri konflik/gagal agar bisa dicoba sinkronkan ulang secara manual oleh kasir/manajer.
 */
export async function retryOfflineTransaction(
  clientId: string,
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<SyncCycleResult> {
  await db.open();
  const nowIso = new Date().toISOString();
  await db.transaction('rw', [db.offlineTransactions, db.syncQueue], async () => {
    await db.offlineTransactions.update(clientId, {
      syncStatus: 'PENDING_SYNC',
      retryCount: 0,
      conflictReason: null,
      lastError: null,
      updatedAt: nowIso,
    });
    await db.syncQueue.where('clientId').equals(clientId).modify({
      status: 'PENDING',
      retryCount: 0,
      nextRetryAt: null,
      lastError: null,
      updatedAt: nowIso,
    });
  });

  return syncPendingOperations({ db, force: true });
}

/**
 * Menghapus entri konflik lokal setelah operator meninjau/menanganinya secara manual (NFR-OFF-04).
 */
export async function dismissConflictRecord(
  clientId: string,
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<void> {
  await dismissOfflineTransactionConflict(clientId, db);
}
