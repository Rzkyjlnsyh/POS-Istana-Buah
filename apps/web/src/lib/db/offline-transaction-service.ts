import type {
  CreateTransactionInput,
  ProductType,
  ReceiptDataDto,
  TransactionDto,
  TransactionItemDto,
} from '@istana-buah/shared';
import axios from 'axios';
import { webConfig } from '../../config/app.config';
import { requestSwBackgroundSync } from '../pwa/sw-registration';
import { getOrCreateOfflineDeviceId } from './offline-catalog-service';
import { decryptJsonPayload, encryptJsonPayload } from './offline-crypto';
import {
  type IstanaBuahPosDb,
  type OfflineTransactionRecord,
  type OfflineTransactionSyncStatus,
  getPosIndexedDb,
} from './pos-indexed-db';

const META_OFFLINE_SINCE = 'offlineSince';

export class OfflineStockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfflineStockError';
  }
}

export interface OfflineCartSnapshotItem {
  productId: string;
  name: string;
  productType: ProductType;
  quantity: number;
  unitPrice: number;
  discountAmount?: number;
}

export interface SaveOfflineTransactionArgs {
  input: CreateTransactionInput;
  cartItems: OfflineCartSnapshotItem[];
  cashierId: string;
  cashierName: string;
  shiftId?: string | null;
  transactedAt?: string;
  db?: IstanaBuahPosDb;
}

export interface OfflineTransactionPayloadEnvelope {
  input: CreateTransactionInput;
  transaction: TransactionDto;
}

export interface DecryptedOfflineTransaction extends OfflineTransactionRecord {
  payload: OfflineTransactionPayloadEnvelope;
}

export interface SaveOfflineTransactionResult {
  clientId: string;
  transaction: TransactionDto;
}

function generateLocalUuid(): string {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const segment = () =>
    Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .slice(1);
  return `${segment()}${segment()}-${segment()}-${segment()}-${segment()}-${segment()}${segment()}${segment()}`;
}

function formatDateYmdInStoreZone(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: webConfig.storeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${pick('year')}${pick('month')}${pick('day')}`;
}

/**
 * Mengidentifikasi error konektivitas (perangkat offline / jaringan terputus tanpa HTTP response)
 * agar transaksi hanya dialihkan ke mode offline ketika server benar-benar tidak terjangkau.
 */
export function isNetworkFailureError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return true;
  }
  if (axios.isAxiosError(error)) {
    return (
      !error.response &&
      (error.code === 'ERR_NETWORK' ||
        error.code === 'ECONNABORTED' ||
        error.message === 'Network Error')
    );
  }
  if (error && typeof error === 'object' && 'isAxiosError' in error && !('response' in error)) {
    return true;
  }
  if (error instanceof TypeError && error.message.toLowerCase().includes('failed to fetch')) {
    return true;
  }
  return false;
}

/**
 * Menyimpan transaksi kasir ke IndexedDB secara terenkripsi (`PENDING_SYNC`),
 * mengurangi stok lokal secara atomik, dan menghasilkan DTO lengkap beserta data struk (TC-OFFLINE-001).
 */
export async function saveOfflineTransaction(
  args: SaveOfflineTransactionArgs,
): Promise<SaveOfflineTransactionResult> {
  const db = args.db ?? getPosIndexedDb();
  await db.open();

  const deviceId = await getOrCreateOfflineDeviceId(db);
  const clientId = args.input.clientId ?? `${deviceId}-trx-${generateLocalUuid()}`;
  const now = args.transactedAt ? new Date(args.transactedAt) : new Date();
  const nowIso = now.toISOString();
  const ymd = formatDateYmdInStoreZone(now);
  const offlinePrefix = `OFF-${ymd}-`;

  const subtotal = args.cartItems.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice - (item.discountAmount ?? 0),
    0,
  );
  const discountAmount = args.input.discountAmount ?? 0;
  const totalAmount = Math.max(0, Math.round(subtotal - discountAmount));
  const amountPaid = args.input.amountPaid;
  const changeAmount = Math.max(0, Math.round(amountPaid - totalAmount));

  const txId = `offline-${clientId}`;

  const existingToday = await db.offlineTransactions
    .where('transactionNo')
    .startsWith(offlinePrefix)
    .count();
  const transactionNo = `${offlinePrefix}${String(existingToday + 1).padStart(4, '0')}`;

  const dtoItems: TransactionItemDto[] = args.cartItems.map((item, idx) => {
    const lineTotal = Math.max(
      0,
      Math.round(item.quantity * item.unitPrice - (item.discountAmount ?? 0)),
    );
    return {
      id: `${txId}-item-${idx + 1}`,
      transactionId: txId,
      productId: item.productId,
      productName: item.name,
      productType: item.productType,
      quantity: item.quantity.toFixed(3),
      unitPrice: item.unitPrice.toFixed(2),
      unitCost: null,
      discountAmount: (item.discountAmount ?? 0).toFixed(2),
      lineTotal: lineTotal.toFixed(2),
      createdAt: nowIso,
    };
  });

  const receiptData: ReceiptDataDto = {
    storeName: webConfig.appName,
    storeAddress: webConfig.storeAddress,
    storePhone: webConfig.storePhone,
    transactionNo,
    cashierName: args.cashierName,
    transactedAt: nowIso,
    paymentMethod: args.input.paymentMethod,
    items: args.cartItems.map((item) => ({
      name: item.name,
      quantity: item.productType === 'WEIGHT' ? item.quantity.toFixed(3) : String(item.quantity),
      productType: item.productType,
      unitPrice: item.unitPrice.toFixed(2),
      lineTotal: Math.max(
        0,
        Math.round(item.quantity * item.unitPrice - (item.discountAmount ?? 0)),
      ).toFixed(2),
    })),
    subtotal: subtotal.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    taxAmount: '0.00',
    totalAmount: totalAmount.toFixed(2),
    amountPaid: amountPaid.toFixed(2),
    changeAmount: changeAmount.toFixed(2),
    footerMessage: `${webConfig.receiptFooter} [Mode Offline - Menunggu Sinkronisasi]`,
  };

  const transactionDto: TransactionDto = {
    id: txId,
    transactionNo,
    shiftId: args.shiftId ?? null,
    cashierId: args.cashierId,
    cashierName: args.cashierName,
    status: 'COMPLETED',
    subtotal: subtotal.toFixed(2),
    discountAmount: discountAmount.toFixed(2),
    taxAmount: '0.00',
    totalAmount: totalAmount.toFixed(2),
    paymentMethod: args.input.paymentMethod,
    amountPaid: amountPaid.toFixed(2),
    changeAmount: changeAmount.toFixed(2),
    notes: args.input.notes ?? null,
    voidedBy: null,
    voidedAt: null,
    voidReason: null,
    clientId,
    syncedAt: null,
    transactedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    items: dtoItems,
    receiptData,
  };

  const inputPayload: CreateTransactionInput = {
    ...args.input,
    clientId,
    transactedAt: nowIso,
  };

  // Enkripsi dijalankan sebelum Dexie transaction agar IndexedDB TX hanya berisi operasi IndexedDB murni.
  const [encryptedPayload, encryptedOperation] = await Promise.all([
    encryptJsonPayload<OfflineTransactionPayloadEnvelope>({
      input: inputPayload,
      transaction: transactionDto,
    }),
    encryptJsonPayload({
      type: 'TRANSACTION' as const,
      clientId,
      data: inputPayload,
      timestamp: nowIso,
    }),
  ]);

  await db.transaction(
    'rw',
    [db.products, db.offlineTransactions, db.syncQueue, db.syncMetadata],
    async () => {
      // Validasi dan pengurangan stok lokal secara atomik
      for (const item of args.cartItems) {
        const cachedProduct = await db.products.get(item.productId);
        if (cachedProduct) {
          const currentStock = Number(cachedProduct.stockQty);
          if (currentStock < item.quantity) {
            throw new OfflineStockError(
              `Stok lokal "${cachedProduct.name}" tersisa ${currentStock} tidak mencukupi.`,
            );
          }
          const updatedStock = Math.max(0, Number((currentStock - item.quantity).toFixed(3)));
          await db.products.update(item.productId, {
            stockQty: updatedStock.toFixed(3),
            updatedAt: nowIso,
          });
        }
      }

      await db.offlineTransactions.put({
        clientId,
        transactionNo,
        syncStatus: 'PENDING_SYNC',
        encryptedPayload,
        totalAmount: transactionDto.totalAmount,
        paymentMethod: transactionDto.paymentMethod,
        retryCount: 0,
        lastAttemptAt: null,
        lastError: null,
        conflictReason: null,
        serverId: null,
        transactedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        syncedAt: null,
      });

      await db.syncQueue.add({
        clientId,
        type: 'TRANSACTION',
        encryptedOperation,
        status: 'PENDING',
        retryCount: 0,
        nextRetryAt: null,
        lastError: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      const existingOfflineSince = await db.syncMetadata.get(META_OFFLINE_SINCE);
      if (!existingOfflineSince) {
        await db.syncMetadata.put({
          key: META_OFFLINE_SINCE,
          value: nowIso,
          updatedAt: nowIso,
        });
      }
    },
  );

  void requestSwBackgroundSync().catch(() => undefined);

  return { clientId, transaction: transactionDto };
}

export async function getOfflineTransactions(
  statusFilter?: OfflineTransactionSyncStatus[],
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<DecryptedOfflineTransaction[]> {
  await db.open();
  const rows = statusFilter?.length
    ? await db.offlineTransactions.where('syncStatus').anyOf(statusFilter).toArray()
    : await db.offlineTransactions.orderBy('createdAt').reverse().toArray();

  const decrypted: DecryptedOfflineTransaction[] = [];
  for (const row of rows) {
    const payload = await decryptJsonPayload<OfflineTransactionPayloadEnvelope>(
      row.encryptedPayload,
    );
    decrypted.push({
      ...row,
      payload,
    });
  }
  return decrypted;
}

export async function getPendingSyncCount(
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<number> {
  await db.open();
  return db.offlineTransactions
    .where('syncStatus')
    .anyOf(['PENDING_SYNC', 'SYNCING', 'FAILED'])
    .count();
}

export async function getSyncStatusSummary(db: IstanaBuahPosDb = getPosIndexedDb()): Promise<{
  pendingCount: number;
  conflictCount: number;
  syncedCount: number;
  offlineSince: string | null;
}> {
  await db.open();
  const [pendingCount, conflictCount, syncedCount, offlineSinceMeta] = await Promise.all([
    db.offlineTransactions.where('syncStatus').anyOf(['PENDING_SYNC', 'SYNCING', 'FAILED']).count(),
    db.offlineTransactions.where('syncStatus').equals('CONFLICT').count(),
    db.offlineTransactions.where('syncStatus').equals('SYNCED').count(),
    db.syncMetadata.get(META_OFFLINE_SINCE),
  ]);
  return {
    pendingCount,
    conflictCount,
    syncedCount,
    offlineSince: offlineSinceMeta?.value ?? null,
  };
}

export async function markOfflineTransactionSynced(
  clientId: string,
  serverId: string,
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<void> {
  await db.open();
  const nowIso = new Date().toISOString();
  await db.transaction('rw', [db.offlineTransactions, db.syncQueue, db.syncMetadata], async () => {
    await db.offlineTransactions.update(clientId, {
      syncStatus: 'SYNCED',
      serverId,
      syncedAt: nowIso,
      updatedAt: nowIso,
      lastError: null,
      conflictReason: null,
    });
    await db.syncQueue.where('clientId').equals(clientId).modify({
      status: 'COMPLETED',
      updatedAt: nowIso,
      lastError: null,
    });
    const remainingPending = await db.offlineTransactions
      .where('syncStatus')
      .anyOf(['PENDING_SYNC', 'SYNCING', 'FAILED'])
      .count();
    if (remainingPending === 0) {
      await db.syncMetadata.delete(META_OFFLINE_SINCE);
    }
  });
}

export async function markOfflineTransactionConflict(
  clientId: string,
  reason: string,
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<void> {
  await db.open();
  const nowIso = new Date().toISOString();
  await db.transaction('rw', [db.offlineTransactions, db.syncQueue], async () => {
    await db.offlineTransactions.update(clientId, {
      syncStatus: 'CONFLICT',
      conflictReason: reason,
      lastAttemptAt: nowIso,
      updatedAt: nowIso,
    });
    await db.syncQueue.where('clientId').equals(clientId).modify({
      status: 'CONFLICT',
      lastError: reason,
      updatedAt: nowIso,
    });
  });
}

export async function scheduleOfflineTransactionRetry(
  clientId: string,
  errorMessage: string,
  nextRetryAtIso: string,
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<void> {
  await db.open();
  const nowIso = new Date().toISOString();
  await db.transaction('rw', [db.offlineTransactions, db.syncQueue], async () => {
    const existing = await db.offlineTransactions.get(clientId);
    const nextRetryCount = (existing?.retryCount ?? 0) + 1;
    await db.offlineTransactions.update(clientId, {
      syncStatus: 'FAILED',
      retryCount: nextRetryCount,
      lastAttemptAt: nowIso,
      lastError: errorMessage,
      updatedAt: nowIso,
    });
    await db.syncQueue.where('clientId').equals(clientId).modify({
      status: 'FAILED',
      retryCount: nextRetryCount,
      nextRetryAt: nextRetryAtIso,
      lastError: errorMessage,
      updatedAt: nowIso,
    });
  });
}

export async function dismissOfflineTransactionConflict(
  clientId: string,
  db: IstanaBuahPosDb = getPosIndexedDb(),
): Promise<void> {
  await db.open();
  await db.transaction('rw', [db.offlineTransactions, db.syncQueue], async () => {
    await db.offlineTransactions.delete(clientId);
    await db.syncQueue.where('clientId').equals(clientId).delete();
  });
}
