/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_BRAND?: string;
  readonly VITE_APP_VERSION?: string;
  readonly VITE_APP_YEAR?: string;
  readonly VITE_DEV_PORT?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_AUTH_STORAGE_KEY?: string;
  readonly VITE_OFFLINE_SYNC_INTERVAL: string;
  readonly VITE_PRODUCT_CACHE_TTL: string;
  readonly VITE_OFFLINE_DB_NAME?: string;
  readonly VITE_OFFLINE_CRYPTO_KEY?: string;
  readonly VITE_OFFLINE_CATALOG_PAGE_SIZE?: string;
  readonly VITE_OFFLINE_MAX_CATALOG_PAGES?: string;
  readonly VITE_OFFLINE_SYNC_BATCH_SIZE?: string;
  readonly VITE_OFFLINE_MAX_RETRY_COUNT?: string;
  readonly VITE_OFFLINE_BACKOFF_BASE_MS?: string;
  readonly VITE_OFFLINE_BACKOFF_MAX_MS?: string;
  readonly VITE_OFFLINE_MAX_WARNING_HOURS?: string;
  readonly VITE_PWA_INSTALL_DISMISS_KEY?: string;
  readonly VITE_PWA_INSTALL_COOLDOWN_MS?: string;
  readonly VITE_STORE_ADDRESS?: string;
  readonly VITE_STORE_PHONE?: string;
  readonly VITE_RECEIPT_FOOTER?: string;
  readonly VITE_PRINTER_DEFAULT_IP?: string;
  readonly VITE_PRINTER_DEFAULT_PORT?: string;
  readonly VITE_PRINTER_NETWORK_TIMEOUT_MS?: string;
  readonly VITE_STORE_TIMEZONE?: string;
  readonly VITE_STORE_UTC_OFFSET?: string;
  readonly VITE_HISTORY_PAGE_SIZE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
