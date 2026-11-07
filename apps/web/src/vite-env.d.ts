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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
