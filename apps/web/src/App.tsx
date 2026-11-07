import { USER_ROLES } from '@istana-buah/shared';
import { webConfig } from './config/app.config';

/** Placeholder scaffold ENV-002. UI sesungguhnya dibangun mulai M01-003 (wajib via skill impeccable). */
export default function App() {
  return (
    <main>
      <h1>{webConfig.appName}</h1>
      <p>Sistem Kasir &amp; Manajemen Operasional</p>
      <p>Role: {USER_ROLES.join(' / ')}</p>
    </main>
  );
}
