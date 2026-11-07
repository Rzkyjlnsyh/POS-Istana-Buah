/**
 * Konfigurasi frontend — semua nilai dari environment Vite (tanpa hardcode).
 */
function requireEnv(name: keyof ImportMetaEnv, value: string | undefined): string {
  if (!value) {
    throw new Error(`Environment ${name} belum diisi (lihat apps/web/.env.example)`);
  }
  return value;
}

export interface WebConfig {
  apiBaseUrl: string;
  appName: string;
  offlineSyncIntervalMs: number;
  productCacheTtlMs: number;
}

export function buildWebConfig(env: Partial<Record<keyof ImportMetaEnv, string>>): WebConfig {
  return {
    apiBaseUrl: requireEnv('VITE_API_BASE_URL', env.VITE_API_BASE_URL),
    appName: requireEnv('VITE_APP_NAME', env.VITE_APP_NAME),
    offlineSyncIntervalMs: Number(
      requireEnv('VITE_OFFLINE_SYNC_INTERVAL', env.VITE_OFFLINE_SYNC_INTERVAL),
    ),
    productCacheTtlMs: Number(requireEnv('VITE_PRODUCT_CACHE_TTL', env.VITE_PRODUCT_CACHE_TTL)),
  };
}

export const webConfig = buildWebConfig(import.meta.env);
