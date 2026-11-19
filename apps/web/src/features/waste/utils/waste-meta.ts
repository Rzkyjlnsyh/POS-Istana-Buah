import type { WasteType } from '@istana-buah/shared';

export const WASTE_TYPE_META: Record<
  WasteType,
  { label: string; description: string; badgeClass: string }
> = {
  ROTTEN: {
    label: 'Busuk / Matang Berlebih',
    description: 'Buah membusuk atau terlalu matang di display/gudang',
    badgeClass: 'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink',
  },
  EXPIRED: {
    label: 'Kadaluarsa',
    description: 'Produk melewati batas kelayakan jual',
    badgeClass: 'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink',
  },
  SHRINKAGE: {
    label: 'Susut Timbang',
    description: 'Pengurangan bobot alami akibat kadar air atau pengemasan ulang',
    badgeClass: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
  },
  DAMAGED: {
    label: 'Rusak Fisik',
    description: 'Buah memar, pecah, atau tertekan saat bongkar muat',
    badgeClass: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
  },
  OTHER: {
    label: 'Lainnya',
    description: 'Penyebab penyusutan atau kehilangan lainnya',
    badgeClass: 'border-border-subtle bg-surface-subtle text-ink-secondary',
  },
};
