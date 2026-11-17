/**
 * Memformat tanggal menjadi string `YYYYMMDD` sesuai zona waktu konfigurasi (mis. `Asia/Jakarta`).
 */
export function formatYmdInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/-/g, '');
}

/**
 * Mengonversi string tanggal (`YYYY-MM-DD` atau ISO-8601 berzona) menjadi batas `Date` awal/akhir rentang.
 */
export function parseRangeBoundary(value: string, edge: 'start' | 'end'): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(edge === 'start' ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`);
  }
  return new Date(value);
}

/**
 * Menghasilkan nomor referensi berurutan harian (`PREFIX-YYYYMMDD-01`) dari daftar referensi eksis.
 */
export function buildNextDailyReference(
  datePrefix: string,
  existingRefs: Array<string | null>,
  padDigits: number,
): string {
  let maxSeq = 0;
  for (const ref of existingRefs) {
    if (!ref) continue;
    const lastPart = ref.split('-').pop();
    const parsed = Number(lastPart);
    if (!Number.isNaN(parsed) && parsed > maxSeq) {
      maxSeq = parsed;
    }
  }
  return `${datePrefix}${String(maxSeq + 1).padStart(padDigits, '0')}`;
}
