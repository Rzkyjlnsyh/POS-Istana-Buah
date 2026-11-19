import { describe, expect, it } from 'vitest';
import {
  formatPaymentMethodShort,
  formatQuantity,
  formatRupiah,
  formatTransactionDateTime,
  formatTransactionTime,
  getStoreDateString,
  getTodayStoreRange,
  shiftYmdDate,
  toStoreDayBounds,
} from './formatters';

describe('pos formatters & WIB range helpers', () => {
  it('memformat rupiah dan menangani nilai non-finite', () => {
    expect(formatRupiah(37500)).toMatch(/Rp\s*37\.500/);
    expect(formatRupiah(Number.NaN)).toBe('Rp 0');
  });

  it('memformat kuantitas WEIGHT 3 desimal dan UNIT bulat', () => {
    expect(formatQuantity(1.5, 'WEIGHT')).toBe('1,500 kg');
    expect(formatQuantity(2, 'UNIT')).toBe('2 pcs');
    expect(formatQuantity(Number.POSITIVE_INFINITY, 'WEIGHT')).toBe('0,000 kg');
  });

  it('menghitung tanggal toko Asia/Jakarta pada batas tengah malam UTC', () => {
    // 2026-11-17 18:30 UTC == 2026-11-18 01:30 WIB
    const instant = new Date('2026-11-17T18:30:00.000Z');
    expect(getStoreDateString(instant)).toBe('2026-11-18');
    expect(formatTransactionTime(instant.toISOString())).toBe('01:30');
    expect(formatTransactionDateTime(instant.toISOString())).toContain('WIB');
    expect(formatTransactionDateTime('bukan-tanggal')).toBe('bukan-tanggal');
    expect(formatTransactionTime('bukan-tanggal')).toBe('--:--');
  });

  it('menggeser tanggal kalender dan membentuk batas rentang WIB dengan tepat', () => {
    expect(shiftYmdDate('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftYmdDate('2026-11-17', -6)).toBe('2026-11-11');
    expect(toStoreDayBounds('2026-11-17')).toEqual({
      startDate: '2026-11-17T00:00:00+07:00',
      endDate: '2026-11-17T23:59:59.999+07:00',
    });

    const todayRange = getTodayStoreRange(new Date('2026-11-17T10:00:00+07:00'));
    expect(todayRange).toEqual({
      ymd: '2026-11-17',
      startDate: '2026-11-17T00:00:00+07:00',
      endDate: '2026-11-17T23:59:59.999+07:00',
    });
  });

  it('memetakan label metode pembayaran ringkas', () => {
    expect(formatPaymentMethodShort('CASH')).toBe('Tunai');
    expect(formatPaymentMethodShort('QRIS')).toBe('QRIS');
    expect(formatPaymentMethodShort('BANK_TRANSFER')).toBe('Transfer Bank');
    expect(formatPaymentMethodShort('MIXED')).toBe('Kombinasi');
  });
});
