import { create } from 'zustand';
import { webConfig } from '../config/app.config';
import {
  type DecryptedOfflineTransaction,
  getOfflineTransactions,
  getSyncStatusSummary,
} from '../lib/db/offline-transaction-service';
import {
  type SyncCycleResult,
  dismissConflictRecord,
  retryOfflineTransaction,
  syncPendingOperations,
} from '../lib/sync/sync-manager';

export interface OfflineSyncStoreState {
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  syncedCount: number;
  offlineSince: string | null;
  lastSyncedAt: string | null;
  lastResult: SyncCycleResult | null;
  items: DecryptedOfflineTransaction[];
  refreshStatus: () => Promise<void>;
  syncNow: (force?: boolean) => Promise<SyncCycleResult>;
  retryItem: (clientId: string) => Promise<SyncCycleResult>;
  dismissConflict: (clientId: string) => Promise<void>;
  isOfflineDurationWarningActive: () => boolean;
}

export const useOfflineSyncStore = create<OfflineSyncStoreState>((set, get) => ({
  isSyncing: false,
  pendingCount: 0,
  conflictCount: 0,
  syncedCount: 0,
  offlineSince: null,
  lastSyncedAt: null,
  lastResult: null,
  items: [],

  refreshStatus: async () => {
    try {
      const [summary, items] = await Promise.all([
        getSyncStatusSummary(),
        getOfflineTransactions(['PENDING_SYNC', 'SYNCING', 'FAILED', 'CONFLICT']),
      ]);
      set({
        pendingCount: summary.pendingCount,
        conflictCount: summary.conflictCount,
        syncedCount: summary.syncedCount,
        offlineSince: summary.offlineSince,
        items,
      });
    } catch {
      // Abaikan kegagalan akses IndexedDB saat lingkungan non-browser
    }
  },

  syncNow: async (force = false) => {
    set({ isSyncing: true });
    try {
      const result = await syncPendingOperations({ force });
      set((state) => ({
        lastResult: result,
        lastSyncedAt:
          !result.skipped && result.syncedCount > 0 ? new Date().toISOString() : state.lastSyncedAt,
      }));
      await get().refreshStatus();
      return result;
    } finally {
      set({ isSyncing: false });
    }
  },

  retryItem: async (clientId: string) => {
    set({ isSyncing: true });
    try {
      const result = await retryOfflineTransaction(clientId);
      set({ lastResult: result });
      await get().refreshStatus();
      return result;
    } finally {
      set({ isSyncing: false });
    }
  },

  dismissConflict: async (clientId: string) => {
    await dismissConflictRecord(clientId);
    await get().refreshStatus();
  },

  isOfflineDurationWarningActive: () => {
    const since = get().offlineSince;
    if (!since) return false;
    const elapsedMs = Date.now() - Date.parse(since);
    if (!Number.isFinite(elapsedMs)) return false;
    return elapsedMs >= webConfig.offlineMaxWarningHours * 60 * 60 * 1000;
  },
}));
