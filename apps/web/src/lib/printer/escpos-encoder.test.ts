import type { ReceiptDataDto, TransactionDto } from '@istana-buah/shared';
import { describe, expect, it } from 'vitest';
import {
  buildReceiptDataFromTransaction,
  centerText,
  encodeEscPosReceipt,
  formatLeftRightLine,
  formatPaymentMethodLabel,
  formatReceiptTextLines,
  getCharsPerLine,
} from './escpos-encoder';

const receipt: ReceiptDataDto = {
  storeName: 'Istana Buah Semarang',
  storeAddress: 'Jl. Pandanaran No. 88, Semarang',
  storePhone: '024-8412345',
  transactionNo: 'TRX-20261117-0007',
  cashierName: 'Siti Kasir',
  transactedAt: '2026-11-17T07:30:00.000Z',
  paymentMethod: 'CASH',
  items: [
    {
      name: 'Mangga Harum Manis',
      quantity: '1.500',
      productType: 'WEIGHT',
      unitPrice: '25000',
      lineTotal: '37500',
    },
    {
      name: 'Nanas Madu',
      quantity: '2',
      productType: 'UNIT',
      unitPrice: '15000',
      lineTotal: '30000',
    },
  ],
  subtotal: '67500',
  discountAmount: '2500',
  taxAmount: '0',
  totalAmount: '65000',
  amountPaid: '70000',
  changeAmount: '5000',
  footerMessage: 'Terima kasih atas kunjungan Anda!',
};

function indexOfSequence(haystack: Uint8Array, needle: number[]): number {
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    if (needle.every((b, j) => haystack[i + j] === b)) return i;
  }
  return -1;
}

describe('escpos-encoder (M03-007)', () => {
  it('menentukan jumlah kolom per lebar kertas', () => {
    expect(getCharsPerLine('58mm')).toBe(32);
    expect(getCharsPerLine('80mm')).toBe(48);
    expect(getCharsPerLine()).toBe(32);
  });

  it('helper teks: center & kiri-kanan tidak melebihi lebar kolom', () => {
    expect(centerText('ABC', 9)).toBe('   ABC');
    expect(centerText('ABCDEFGHIJ', 4)).toBe('ABCD');
    const line = formatLeftRightLine('Subtotal', 'Rp 1.000', 32);
    expect(line).toHaveLength(32);
    expect(line.startsWith('Subtotal')).toBe(true);
    expect(line.endsWith('Rp 1.000')).toBe(true);
    const long = formatLeftRightLine('Nama Produk Sangat Panjang Sekali Lho', 'Rp 99.000', 32);
    expect(long.length).toBeLessThanOrEqual(32);
    expect(long.endsWith('Rp 99.000')).toBe(true);
  });

  it('memetakan label metode pembayaran', () => {
    expect(formatPaymentMethodLabel('CASH')).toBe('TUNAI (CASH)');
    expect(formatPaymentMethodLabel('QRIS')).toBe('QRIS DIGITAL');
    expect(formatPaymentMethodLabel('BANK_TRANSFER')).toBe('TRANSFER BANK');
    expect(formatPaymentMethodLabel('MIXED')).toBe('KOMBINASI');
  });

  it('memformat baris struk teks 58mm tanpa melebihi 32 kolom dan memuat data lengkap', () => {
    const lines = formatReceiptTextLines(receipt, '58mm');
    expect(lines.every((l) => l.length <= 32)).toBe(true);
    const joined = lines.join('\n');
    expect(joined).toContain('ISTANA BUAH SEMARANG');
    expect(joined).toContain('TRX-20261117-0007');
    expect(joined).toContain('Mangga Harum Manis');
    expect(joined).toMatch(/Rp\s?37\.500/);
    expect(joined).toContain('Diskon');
    expect(joined).toContain('TOTAL');
    expect(joined).toContain('KEMBALIAN');
    expect(joined).not.toContain('Pajak');
  });

  it('struk 80mm memakai 48 kolom', () => {
    const lines = formatReceiptTextLines(receipt, '80mm');
    expect(lines.every((l) => l.length <= 48)).toBe(true);
    expect(lines.some((l) => l === '='.repeat(48))).toBe(true);
  });

  it('menampilkan baris pajak hanya jika taxAmount > 0', () => {
    const lines = formatReceiptTextLines({ ...receipt, taxAmount: '6500' }, '58mm');
    expect(lines.join('\n')).toContain('Pajak (PPN)');
  });

  it('mengenkode byte ESC/POS: init, cash drawer, bold, feed & auto-cut', () => {
    const bytes = encodeEscPosReceipt(receipt, { paperWidth: '58mm' });
    expect(bytes[0]).toBe(0x1b);
    expect(bytes[1]).toBe(0x40);
    expect(indexOfSequence(bytes, [0x1b, 0x70, 0x00, 0x19, 0xfa])).toBeGreaterThan(-1);
    expect(indexOfSequence(bytes, [0x1b, 0x45, 0x01])).toBeGreaterThan(-1);
    expect(indexOfSequence(bytes, [0x1b, 0x64, 0x04])).toBeGreaterThan(-1);
    expect(indexOfSequence(bytes, [0x1d, 0x56, 0x41, 0x03])).toBeGreaterThan(-1);

    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('TRX-20261117-0007');
    expect(text).toContain('Siti Kasir');
  });

  it('opsi cash drawer & auto-cut dapat dinonaktifkan; non-tunai tidak membuka laci', () => {
    const noOptions = encodeEscPosReceipt(receipt, { openCashDrawer: false, autoCut: false });
    expect(indexOfSequence(noOptions, [0x1b, 0x70, 0x00, 0x19, 0xfa])).toBe(-1);
    expect(indexOfSequence(noOptions, [0x1d, 0x56, 0x41, 0x03])).toBe(-1);

    const qris = encodeEscPosReceipt({ ...receipt, paymentMethod: 'QRIS' });
    expect(indexOfSequence(qris, [0x1b, 0x70, 0x00, 0x19, 0xfa])).toBe(-1);
  });

  it('buildReceiptDataFromTransaction memakai receiptData server bila ada', () => {
    const tx = { receiptData: receipt } as unknown as TransactionDto;
    expect(buildReceiptDataFromTransaction(tx)).toBe(receipt);
  });

  it('buildReceiptDataFromTransaction membangun fallback dari TransactionDto (offline)', () => {
    const tx = {
      id: 'tx-1',
      transactionNo: 'TRX-20261117-0009',
      cashierName: '',
      transactedAt: '2026-11-17T07:30:00.000Z',
      paymentMethod: 'QRIS',
      subtotal: '30000',
      discountAmount: '0',
      taxAmount: '0',
      totalAmount: '30000',
      amountPaid: '30000',
      changeAmount: '0',
      items: [
        {
          productName: 'Nanas Madu',
          productType: 'UNIT',
          quantity: '2',
          unitPrice: '15000',
          lineTotal: '30000',
        },
      ],
    } as unknown as TransactionDto;

    const data = buildReceiptDataFromTransaction(tx);
    expect(data.transactionNo).toBe('TRX-20261117-0009');
    expect(data.cashierName).toBe('Kasir');
    expect(data.items).toEqual([
      {
        name: 'Nanas Madu',
        quantity: '2',
        productType: 'UNIT',
        unitPrice: '15000',
        lineTotal: '30000',
      },
    ]);
    expect(data.storeName.length).toBeGreaterThan(0);
    expect(data.footerMessage.length).toBeGreaterThan(0);
  });
});
