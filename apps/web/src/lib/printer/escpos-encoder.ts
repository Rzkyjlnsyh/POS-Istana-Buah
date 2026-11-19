import type { PaymentMethod, ReceiptDataDto, TransactionDto } from '@istana-buah/shared';
import { webConfig } from '../../config/app.config';
import { formatQuantity, formatRupiah } from '../../features/pos/utils/formatters';

export type ThermalPaperWidth = '58mm' | '80mm';

export interface EscPosEncodeOptions {
  paperWidth?: ThermalPaperWidth;
  openCashDrawer?: boolean;
  autoCut?: boolean;
}

/**
 * Mengonversi kode metode pembayaran ke label ramah pengguna pada struk.
 */
export function formatPaymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'CASH':
      return 'TUNAI (CASH)';
    case 'QRIS':
      return 'QRIS DIGITAL';
    case 'BANK_TRANSFER':
      return 'TRANSFER BANK';
    case 'MIXED':
      return 'KOMBINASI';
    default:
      return String(method);
  }
}

/**
 * Menghasilkan objek ReceiptDataDto lengkap dari TransactionDto (mendukung online & offline).
 */
export function buildReceiptDataFromTransaction(tx: TransactionDto): ReceiptDataDto {
  if (tx.receiptData) {
    return tx.receiptData;
  }

  return {
    storeName: webConfig.appName,
    storeAddress: webConfig.storeAddress,
    storePhone: webConfig.storePhone,
    transactionNo: tx.transactionNo,
    cashierName: tx.cashierName || 'Kasir',
    transactedAt: tx.transactedAt,
    paymentMethod: tx.paymentMethod,
    items: (tx.items ?? []).map((item) => ({
      name: item.productName,
      quantity: item.quantity,
      productType: item.productType,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    subtotal: tx.subtotal,
    discountAmount: tx.discountAmount,
    taxAmount: tx.taxAmount,
    totalAmount: tx.totalAmount,
    amountPaid: tx.amountPaid,
    changeAmount: tx.changeAmount,
    footerMessage: webConfig.receiptFooter,
  };
}

/**
 * Menentukan jumlah karakter per baris berdasarkan lebar kertas thermal:
 * - 58mm = 32 kolom karakter (Font A standar)
 * - 80mm = 48 kolom karakter (Font A standar)
 */
export function getCharsPerLine(paperWidth: ThermalPaperWidth = '58mm'): number {
  return paperWidth === '80mm' ? 48 : 32;
}

/**
 * Meratakan teks di tengah dalam lebar karakter tertentu.
 */
export function centerText(text: string, width: number): string {
  const clean = text.trim();
  if (clean.length >= width) return clean.slice(0, width);
  const leftPad = Math.floor((width - clean.length) / 2);
  return ' '.repeat(leftPad) + clean;
}

/**
 * Membuat satu baris dengan label di kiri dan nilai di kanan.
 */
export function formatLeftRightLine(left: string, right: string, width: number): string {
  const spaceAvailable = width - left.length - right.length;
  if (spaceAvailable >= 1) {
    return `${left}${' '.repeat(spaceAvailable)}${right}`;
  }
  const maxLeftLen = Math.max(1, width - right.length - 1);
  return `${left.slice(0, maxLeftLen)} ${right}`;
}

/**
 * Memformat tanggal ISO menjadi format struk WIB (cth: "17/11/2026 14:30").
 */
export function formatReceiptDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Menghasilkan array baris teks struk terformat siap cetak atau pratinjau monospasi.
 */
export function formatReceiptTextLines(
  receipt: ReceiptDataDto,
  paperWidth: ThermalPaperWidth = '58mm',
): string[] {
  const cols = getCharsPerLine(paperWidth);
  const divider = '-'.repeat(cols);
  const doubleDivider = '='.repeat(cols);
  const lines: string[] = [];

  // 1. Header Toko
  lines.push(centerText(receipt.storeName.toUpperCase(), cols));
  lines.push(centerText(receipt.storeAddress, cols));
  lines.push(centerText(`Telp: ${receipt.storePhone}`, cols));
  lines.push(doubleDivider);

  // 2. Metadata Transaksi
  lines.push(formatLeftRightLine('No. Struk', receipt.transactionNo, cols));
  lines.push(formatLeftRightLine('Waktu', formatReceiptDateTime(receipt.transactedAt), cols));
  lines.push(formatLeftRightLine('Kasir', receipt.cashierName, cols));
  lines.push(formatLeftRightLine('Bayar', formatPaymentMethodLabel(receipt.paymentMethod), cols));
  lines.push(divider);

  // 3. Daftar Item Belanja
  for (const item of receipt.items) {
    const qtyNum = Number(item.quantity);
    const unitPriceNum = Number(item.unitPrice);
    const lineTotalNum = Number(item.lineTotal);

    lines.push(item.name.slice(0, cols));
    const qtyPriceLabel = `  ${formatQuantity(qtyNum, item.productType)} x ${formatRupiah(unitPriceNum)}`;
    const totalLabel = formatRupiah(lineTotalNum);
    lines.push(formatLeftRightLine(qtyPriceLabel, totalLabel, cols));
  }

  lines.push(divider);

  // 4. Ringkasan Pembayaran
  const subtotalNum = Number(receipt.subtotal);
  const discountNum = Number(receipt.discountAmount);
  const taxNum = Number(receipt.taxAmount);
  const totalNum = Number(receipt.totalAmount);
  const paidNum = Number(receipt.amountPaid);
  const changeNum = Number(receipt.changeAmount);

  lines.push(formatLeftRightLine('Subtotal', formatRupiah(subtotalNum), cols));
  if (discountNum > 0) {
    lines.push(formatLeftRightLine('Diskon', `-${formatRupiah(discountNum)}`, cols));
  }
  if (taxNum > 0) {
    lines.push(formatLeftRightLine('Pajak (PPN)', formatRupiah(taxNum), cols));
  }

  lines.push(doubleDivider);
  lines.push(formatLeftRightLine('TOTAL', formatRupiah(totalNum), cols));
  lines.push(formatLeftRightLine('DIBAYAR', formatRupiah(paidNum), cols));
  lines.push(formatLeftRightLine('KEMBALIAN', formatRupiah(changeNum), cols));
  lines.push(divider);

  // 5. Footer Pesan
  const words = receipt.footerMessage.split(' ');
  let currentLine = '';
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length <= cols) {
      currentLine = candidate;
    } else {
      if (currentLine) lines.push(centerText(currentLine, cols));
      currentLine = word;
    }
  }
  if (currentLine) {
    lines.push(centerText(currentLine, cols));
  }

  return lines;
}

/**
 * Mengenkode objek ReceiptDataDto menjadi byte stream protokol printer thermal ESC/POS (M03-007).
 * Mendukung inisialisasi printer, perataan teks, huruf tebal, ukuran ganda,
 * pembuka laci kasir (cash drawer kick), dan pemotong kertas otomatis (auto-cut).
 */
export function encodeEscPosReceipt(
  receipt: ReceiptDataDto,
  options: EscPosEncodeOptions = {},
): Uint8Array {
  const {
    paperWidth = '58mm',
    openCashDrawer = receipt.paymentMethod === 'CASH',
    autoCut = true,
  } = options;

  const cols = getCharsPerLine(paperWidth);
  const divider = '-'.repeat(cols);
  const doubleDivider = '='.repeat(cols);
  const textEncoder = new TextEncoder();
  const buffer: number[] = [];

  const pushBytes = (...bytes: number[]) => {
    buffer.push(...bytes);
  };

  const pushLine = (text: string) => {
    const encoded = textEncoder.encode(`${text}\n`);
    for (const b of encoded) {
      buffer.push(b);
    }
  };

  // ESC @ - Initialize printer
  pushBytes(0x1b, 0x40);

  // Jika transaksi tunai & opsi laci aktif: ESC p 0 25 250 (Cash drawer kick pulse)
  if (openCashDrawer) {
    pushBytes(0x1b, 0x70, 0x00, 0x19, 0xfa);
  }

  // Align Center (ESC a 1)
  pushBytes(0x1b, 0x61, 0x01);
  // Bold On (ESC E 1) + Double Height (GS ! 0x10)
  pushBytes(0x1b, 0x45, 0x01, 0x1d, 0x21, 0x10);
  pushLine(receipt.storeName.toUpperCase());

  // Normal size (GS ! 0x00) + Bold Off (ESC E 0)
  pushBytes(0x1d, 0x21, 0x00, 0x1b, 0x45, 0x00);
  pushLine(receipt.storeAddress);
  pushLine(`Telp: ${receipt.storePhone}`);

  // Align Left (ESC a 0)
  pushBytes(0x1b, 0x61, 0x00);
  pushLine(doubleDivider);

  // Metadata Transaksi
  pushLine(formatLeftRightLine('No. Struk', receipt.transactionNo, cols));
  pushLine(formatLeftRightLine('Waktu', formatReceiptDateTime(receipt.transactedAt), cols));
  pushLine(formatLeftRightLine('Kasir', receipt.cashierName, cols));
  pushLine(formatLeftRightLine('Bayar', formatPaymentMethodLabel(receipt.paymentMethod), cols));
  pushLine(divider);

  // Item Belanja
  for (const item of receipt.items) {
    const qtyNum = Number(item.quantity);
    const unitPriceNum = Number(item.unitPrice);
    const lineTotalNum = Number(item.lineTotal);

    pushLine(item.name.slice(0, cols));
    const qtyPriceLabel = `  ${formatQuantity(qtyNum, item.productType)} x ${formatRupiah(unitPriceNum)}`;
    const totalLabel = formatRupiah(lineTotalNum);
    pushLine(formatLeftRightLine(qtyPriceLabel, totalLabel, cols));
  }

  pushLine(divider);

  // Ringkasan Harga
  const subtotalNum = Number(receipt.subtotal);
  const discountNum = Number(receipt.discountAmount);
  const taxNum = Number(receipt.taxAmount);
  const totalNum = Number(receipt.totalAmount);
  const paidNum = Number(receipt.amountPaid);
  const changeNum = Number(receipt.changeAmount);

  pushLine(formatLeftRightLine('Subtotal', formatRupiah(subtotalNum), cols));
  if (discountNum > 0) {
    pushLine(formatLeftRightLine('Diskon', `-${formatRupiah(discountNum)}`, cols));
  }
  if (taxNum > 0) {
    pushLine(formatLeftRightLine('Pajak (PPN)', formatRupiah(taxNum), cols));
  }

  pushLine(doubleDivider);

  // TOTAL dengan Huruf Tebal (ESC E 1)
  pushBytes(0x1b, 0x45, 0x01);
  pushLine(formatLeftRightLine('TOTAL', formatRupiah(totalNum), cols));
  pushBytes(0x1b, 0x45, 0x00);

  pushLine(formatLeftRightLine('DIBAYAR', formatRupiah(paidNum), cols));

  // KEMBALIAN dengan Huruf Tebal
  pushBytes(0x1b, 0x45, 0x01);
  pushLine(formatLeftRightLine('KEMBALIAN', formatRupiah(changeNum), cols));
  pushBytes(0x1b, 0x45, 0x00);

  pushLine(divider);

  // Footer Center (ESC a 1)
  pushBytes(0x1b, 0x61, 0x01);
  pushLine(receipt.footerMessage);

  // Feed 4 baris (ESC d 4)
  pushBytes(0x1b, 0x64, 0x04);

  // Auto Cut Paper (GS V 65 3)
  if (autoCut) {
    pushBytes(0x1d, 0x56, 0x41, 0x03);
  }

  return new Uint8Array(buffer);
}
