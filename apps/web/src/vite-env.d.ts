/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_DEV_PORT?: string;
  readonly VITE_OFFLINE_SYNC_INTERVAL: string;
  readonly VITE_PRODUCT_CACHE_TTL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
