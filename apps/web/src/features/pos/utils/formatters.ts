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
