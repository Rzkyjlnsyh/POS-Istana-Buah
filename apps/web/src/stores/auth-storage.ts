import { webConfig } from '../config/app.config';

export interface RefreshTokenStorage {
  getRefreshToken(): string | null;
  setRefreshToken(token: string): void;
  clearRefreshToken(): void;
}

/**
 * Penyimpanan refresh token berbasis sessionStorage browser (otomatis terhapus saat tab/browser ditutup),
 * dengan fallback in-memory jika storage diblokir oleh kebijakan privasi perangkat.
 * Access token TIDAK PERNAH disimpan di sini (selalu di memori Zustand).
 */
export function createSessionRefreshTokenStorage(storageKey: string): RefreshTokenStorage {
  let memoryFallback: string | null = null;

  const getBrowserSessionStorage = (): Storage | null => {
    if (typeof window === 'undefined') {
      return null;
    }
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };

  return {
    getRefreshToken(): string | null {
      const storage = getBrowserSessionStorage();
      if (!storage) {
        return memoryFallback;
      }
      try {
        return storage.getItem(storageKey);
      } catch {
        return memoryFallback;
      }
    },

    setRefreshToken(token: string): void {
      memoryFallback = token;
      const storage = getBrowserSessionStorage();
      if (!storage) {
        return;
      }
      try {
        storage.setItem(storageKey, token);
      } catch {
        // Tetap aman menggunakan memoryFallback jika quota penuh / diblokir
      }
    },

    clearRefreshToken(): void {
      memoryFallback = null;
      const storage = getBrowserSessionStorage();
      if (!storage) {
        return;
      }
      try {
        storage.removeItem(storageKey);
      } catch {
        // Abaikan error pelepasan storage terbatas
      }
    },
  };
}

export const defaultRefreshTokenStorage = createSessionRefreshTokenStorage(
  webConfig.authStorageKey,
);
