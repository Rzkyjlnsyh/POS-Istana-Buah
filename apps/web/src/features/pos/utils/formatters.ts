import type { PaymentMethod, TransactionStatus } from '@istana-buah/shared';
import { webConfig } from '../../../config/app.config';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Memformat angka nominal menjadi representasi Rupiah Indonesia (cth: "Rp 25.000").
 */
export function formatRupiah(value: number): string {
  if (!Number.isFinite(value)) return 'Rp 0';
  return rupiahFormatter.format(Math.round(value));
}

/**
 * Memformat angka kuantitas belanja berdasarkan tipe produk:
 * - WEIGHT: 3 angka desimal presisi timbangan (cth: "1,500 kg" atau "0,350 kg")
 * - UNIT: integer bulat pcs (cth: "2 pcs")
 */
export function formatQuantity(quantity: number, productType: 'WEIGHT' | 'UNIT'): string {
  if (!Number.isFinite(quantity)) return productType === 'WEIGHT' ? '0,000 kg' : '0 pcs';

  if (productType === 'WEIGHT') {
    const formatted = quantity.toLocaleString('id-ID', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
    return `${formatted} kg`;
  }

  return `${Math.round(quantity).toLocaleString('id-ID')} pcs`;
}

/**
 * Mengambil tanggal kalender toko (`YYYY-MM-DD`) sesuai zona waktu konfigurasi (default Asia/Jakarta).
 */
export function getStoreDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: webConfig.storeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Menggeser tanggal kalender `YYYY-MM-DD` sebanyak `deltaDays` (negatif untuk hari sebelumnya).
 */
export function shiftYmdDate(ymd: string, deltaDays: number): string {
  const parts = ymd.split('-').map(Number);
  const year = parts[0] ?? 1970;
  const month = (parts[1] ?? 1) - 1;
  const day = parts[2] ?? 1;
  const utc = new Date(Date.UTC(year, month, day + deltaDays));
  return utc.toISOString().slice(0, 10);
}

/**
 * Mengonversi rentang tanggal `YYYY-MM-DD` menjadi batas ISO-8601 berzona waktu toko
 * agar kueri backend "hari ini" selalu tepat sesuai jam operasional toko.
 */
export function toStoreDayBounds(
  startYmd: string,
  endYmd: string = startYmd,
): { startDate: string; endDate: string } {
  const offset = webConfig.storeUtcOffset;
  return {
    startDate: `${startYmd}T00:00:00${offset}`,
    endDate: `${endYmd}T23:59:59.999${offset}`,
  };
}

/**
 * Menghasilkan batas awal & akhir hari ini dalam zona waktu operasional toko.
 */
export function getTodayStoreRange(now: Date = new Date()): {
  ymd: string;
  startDate: string;
  endDate: string;
} {
  const ymd = getStoreDateString(now);
  return {
    ymd,
    ...toStoreDayBounds(ymd, ymd),
  };
}

/**
 * Memformat ISO timestamp transaksi ke waktu toko lengkap (cth: "17 Nov 2026, 14:30 WIB").
 */
export function formatTransactionDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;

  const formatted = new Intl.DateTimeFormat('id-ID', {
    timeZone: webConfig.storeTimezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace('.', ':');

  return webConfig.storeTimezone === 'Asia/Jakarta' ? `${formatted} WIB` : formatted;
}

/**
 * Memformat jam ringkas transaksi untuk tabel riwayat (cth: "14:30").
 */
export function formatTransactionTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--:--';

  return new Intl.DateTimeFormat('id-ID', {
    timeZone: webConfig.storeTimezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace('.', ':');
}

/**
 * Label metode pembayaran ringkas dalam Bahasa Indonesia untuk tabel & lencana.
 */
export function formatPaymentMethodShort(method: PaymentMethod): string {
  switch (method) {
    case 'CASH':
      return 'Tunai';
    case 'QRIS':
      return 'QRIS';
    case 'BANK_TRANSFER':
      return 'Transfer Bank';
    case 'MIXED':
      return 'Kombinasi';
    default:
      return String(method);
  }
}

export const TRANSACTION_STATUS_META: Record<
  TransactionStatus,
  { label: string; badgeClass: string }
> = {
  COMPLETED: {
    label: 'Selesai',
    badgeClass: 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink',
  },
  VOIDED: {
    label: 'Dibatalkan',
    badgeClass: 'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink',
  },
  PENDING: {
    label: 'Menunggu',
    badgeClass: 'border-semantic-warning-border bg-semantic-warning-bg text-semantic-warning-ink',
  },
  PENDING_SYNC: {
    label: 'Antre Sinkron',
    badgeClass: 'border-semantic-info-border bg-semantic-info-bg text-semantic-info-ink',
  },
};
