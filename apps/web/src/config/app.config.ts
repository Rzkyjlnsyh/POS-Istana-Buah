/**
 * Konfigurasi frontend — semua nilai dari environment Vite (tanpa hardcode).
 */
function requireEnv(name: keyof ImportMetaEnv, value: string | undefined): string {
  if (!value) {
    throw new Error(`Environment ${name} belum diisi (lihat apps/web/.env.example)`);
  }
  return value;
}

function parsePositiveInt(
  name: keyof ImportMetaEnv,
  value: string | undefined,
  fallback?: number,
): number {
  if ((value === undefined || value === '') && fallback !== undefined) {
    return fallback;
  }
  const parsed = Number(requireEnv(name, value));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment ${name} harus berupa angka positif`);
  }
  return parsed;
}

export interface WebConfig {
  apiBaseUrl: string;
  appName: string;
  appBrand: string;
  appVersion: string;
  appYear: string;
  apiTimeoutMs: number;
  authStorageKey: string;
  offlineSyncIntervalMs: number;
  productCacheTtlMs: number;
  storeAddress: string;
  storePhone: string;
  receiptFooter: string;
  printerDefaultIp: string;
  printerDefaultPort: number;
  printerNetworkTimeoutMs: number;
}

export function buildWebConfig(env: Partial<Record<keyof ImportMetaEnv, string>>): WebConfig {
  const apiBaseUrl = requireEnv('VITE_API_BASE_URL', env.VITE_API_BASE_URL);
  const appName = requireEnv('VITE_APP_NAME', env.VITE_APP_NAME);
  return {
    apiBaseUrl,
    appName,
    storeAddress: env.VITE_STORE_ADDRESS?.trim() || 'Semarang',
    storePhone: env.VITE_STORE_PHONE?.trim() || '-',
    receiptFooter: env.VITE_RECEIPT_FOOTER?.trim() || 'Terima kasih atas kunjungan Anda!',
    printerDefaultIp: env.VITE_PRINTER_DEFAULT_IP?.trim() || '192.168.1.200',
    printerDefaultPort: parsePositiveInt(
      'VITE_PRINTER_DEFAULT_PORT',
      env.VITE_PRINTER_DEFAULT_PORT,
      9100,
    ),
    printerNetworkTimeoutMs: parsePositiveInt(
      'VITE_PRINTER_NETWORK_TIMEOUT_MS',
      env.VITE_PRINTER_NETWORK_TIMEOUT_MS,
      5000,
    ),
    appBrand: env.VITE_APP_BRAND?.trim() || 'Istana Buah',
    appVersion: env.VITE_APP_VERSION?.trim() || '1.0.0',
    appYear: env.VITE_APP_YEAR?.trim() || String(new Date().getFullYear()),
    apiTimeoutMs: parsePositiveInt('VITE_API_TIMEOUT_MS', env.VITE_API_TIMEOUT_MS, 15000),
    authStorageKey: env.VITE_AUTH_STORAGE_KEY?.trim() || 'istana_buah_refresh_token',
    offlineSyncIntervalMs: parsePositiveInt(
      'VITE_OFFLINE_SYNC_INTERVAL',
      env.VITE_OFFLINE_SYNC_INTERVAL,
    ),
    productCacheTtlMs: parsePositiveInt('VITE_PRODUCT_CACHE_TTL', env.VITE_PRODUCT_CACHE_TTL),
  };
}

export const webConfig = buildWebConfig(import.meta.env);
