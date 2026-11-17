import type { ProductType, StockMovementType, StockOpnameStatus } from '@istana-buah/shared';

export interface StockMovementMeta {
  label: string;
  direction: 'in' | 'out' | 'adjust';
  badgeClass: string;
}

export const STOCK_MOVEMENT_META: Record<StockMovementType, StockMovementMeta> = {
  PURCHASE_IN: {
    label: 'Penerimaan',
    direction: 'in',
    badgeClass: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink',
  },
  RETURN_IN: {
    label: 'Retur / Void',
    direction: 'in',
    badgeClass: 'border-semantic-info-border bg-semantic-info-bg text-semantic-info-ink',
  },
  TRANSFER_IN: {
    label: 'Transfer Masuk',
    direction: 'in',
    badgeClass: 'border-semantic-info-border bg-semantic-info-bg text-semantic-info-ink',
  },
  INITIAL: {
    label: 'Stok Awal',
    direction: 'in',
    badgeClass: 'border-border-subtle bg-surface-subtle text-ink-secondary',
  },
  SALE_OUT: {
    label: 'Penjualan POS',
    direction: 'out',
    badgeClass: 'border-border-subtle bg-surface-subtle text-ink-secondary',
  },
  WASTE_OUT: {
    label: 'Penyusutan',
    direction: 'out',
    badgeClass: 'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink',
  },
  TRANSFER_OUT: {
    label: 'Transfer Keluar',
    direction: 'out',
    badgeClass: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
  },
  OPNAME_ADJUST: {
    label: 'Opname',
    direction: 'adjust',
    badgeClass: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
  },
};

export const OPNAME_STATUS_META: Record<StockOpnameStatus, { label: string; badgeClass: string }> =
  {
    DRAFT: {
      label: 'Draft',
      badgeClass: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
    },
    COMPLETED: {
      label: 'Selesai',
      badgeClass: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink',
    },
  };

/**
 * Memformat nilai kuantitas bertanda untuk mutasi stok dan selisih opname.
 */
export function formatSignedStockQty(
  rawQty: string | number,
  productType: ProductType,
  movementType?: StockMovementType,
): string {
  const num = typeof rawQty === 'number' ? rawQty : Number(rawQty);
  if (!Number.isFinite(num)) {
    return productType === 'WEIGHT' ? '0,000 kg' : '0 pcs';
  }

  let signed = num;
  if (movementType) {
    const meta = STOCK_MOVEMENT_META[movementType];
    if (meta.direction === 'out') {
      signed = -Math.abs(num);
    } else if (meta.direction === 'in') {
      signed = Math.abs(num);
    }
  }

  const unit = productType === 'WEIGHT' ? 'kg' : 'pcs';
  const formatted = Math.abs(signed).toLocaleString(
    'id-ID',
    productType === 'WEIGHT'
      ? { minimumFractionDigits: 3, maximumFractionDigits: 3 }
      : { maximumFractionDigits: 0 },
  );

  if (signed > 0) return `+${formatted} ${unit}`;
  if (signed < 0) return `-${formatted} ${unit}`;
  return `${formatted} ${unit}`;
}

/**
 * Menghitung persentase penyimpangan stok fisik terhadap stok sistem (untuk ambang > 10% US-STK-002).
 */
export function calculateVariancePercent(systemQty: number, physicalQty: number): number {
  const diff = Math.abs(physicalQty - systemQty);
  if (diff === 0) return 0;
  if (systemQty <= 0) return 100;
  return (diff / systemQty) * 100;
}
