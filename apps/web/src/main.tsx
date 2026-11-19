import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { registerAppServiceWorker } from './lib/pwa/sw-registration';
import { useOfflineSyncStore } from './stores/offline-sync-store';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Elemen #root tidak ditemukan');
}

void registerAppServiceWorker({
  onSyncMessage: (payload) => {
    if (payload.type === 'BG_SYNC_REQUESTED' || payload.type === 'BG_SYNC_COMPLETED') {
      void useOfflineSyncStore.getState().syncNow(true);
    }
  },
}).catch(() => undefined);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
