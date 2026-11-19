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
 * Mengembalikan tanggal kalender `YYYY-MM-DD` sesuai zona waktu toko (mis. `Asia/Jakarta`).
 */
export function getCalendarYmdDashedInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Menggeser tanggal kalender `YYYY-MM-DD` sebanyak `deltaDays` hari secara deterministik di UTC.
 */
export function shiftYmdDashed(ymdDashed: string, deltaDays: number): string {
  const [yStr, mStr, dStr] = ymdDashed.split('-');
  const shifted = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr) + deltaDays));
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Mengembalikan hari Senin (`YYYY-MM-DD`) pada minggu kalender untuk tanggal di zona waktu toko.
 */
export function getWeekStartYmdInTimeZone(date: Date, timeZone: string): string {
  const ymd = getCalendarYmdDashedInTimeZone(date, timeZone);
  const [yStr, mStr, dStr] = ymd.split('-');
  const utcMid = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr)));
  const dayOfWeek = utcMid.getUTCDay(); // 0=Min, 1=Sen, ..., 6=Sab
  const offsetToMonday = dayOfWeek === 0 ? -6 : -(dayOfWeek - 1);
  return shiftYmdDashed(ymd, offsetToMonday);
}

/**
 * Mengembalikan kunci bulan kalender `YYYY-MM` pada zona waktu toko.
 */
export function getMonthKeyInTimeZone(date: Date, timeZone: string): string {
  return getCalendarYmdDashedInTimeZone(date, timeZone).slice(0, 7);
}

/**
 * Mengonversi tanggal kalender `YYYY-MM-DD` pada zona waktu toko (tanpa hardcode offset)
 * menjadi rentang UTC `[start, end]` akurat untuk kueri transaksi & shift harian.
 */
export function getZonedDayRangeUtc(
  ymdDashed: string,
  timeZone: string,
): { start: Date; end: Date } {
  const [yStr, mStr, dStr] = ymdDashed.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  const probeUtc = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(probeUtc));

  const pick = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const zonedAsUtc = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    pick('hour'),
    pick('minute'),
    pick('second'),
    0,
  );
  const offsetMs = zonedAsUtc - probeUtc;

  const startMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMs;
  const endMs = Date.UTC(year, month - 1, day, 23, 59, 59, 999) - offsetMs;

  return {
    start: new Date(startMs),
    end: new Date(endMs),
  };
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
