import type { PurchaseOrderStatus } from '@istana-buah/shared';

export const PO_STATUS_META: Record<PurchaseOrderStatus, { label: string; badgeClass: string }> = {
  PENDING: {
    label: 'Menunggu Barang',
    badgeClass: 'border-semantic-info-border bg-semantic-info-bg text-semantic-info-ink',
  },
  PARTIAL: {
    label: 'Diterima Sebagian',
    badgeClass: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
  },
  RECEIVED: {
    label: 'Diterima Lengkap',
    badgeClass: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink',
  },
  CANCELLED: {
    label: 'Dibatalkan',
    badgeClass: 'border-border-subtle bg-surface-subtle text-ink-muted',
  },
};
