import type { SalesSummaryReportDto } from '@istana-buah/shared';
import type { SalesExportTransactionRow } from './report.dto';

export interface SalesPdfReportInput {
  storeName: string;
  periodLabel: string;
  printedAtLabel: string;
  summary: SalesSummaryReportDto;
  rows: SalesExportTransactionRow[];
}

const A4_WIDTH = 595;
const A4_HEIGHT = 842;
const MARGIN_X = 36;
const TOP_START_Y = 796;
const FOOTER_Y = 26;
const LINE_HEIGHT = 13;
const FIRST_PAGE_MAX_ROWS = 34;
const NEXT_PAGE_MAX_ROWS = 48;

function sanitizeAsciiText(value: string): string {
  return value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

function escapePdfString(value: string): string {
  return sanitizeAsciiText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function padRight(text: string, width: number): string {
  const clean = sanitizeAsciiText(text);
  if (clean.length >= width) {
    return `${clean.slice(0, Math.max(1, width - 1))}.`;
  }
  return clean.padEnd(width, ' ');
}

function padLeft(text: string, width: number): string {
  const clean = sanitizeAsciiText(text);
  if (clean.length >= width) {
    return clean.slice(0, width);
  }
  return clean.padStart(width, ' ');
}

function formatRupiahAscii(decimalString: string): string {
  const num = Number(decimalString);
  if (!Number.isFinite(num)) return decimalString;
  const formatted = Math.round(num)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${formatted}`;
}

function pushTextLine(
  commands: string[],
  font: 'F1' | 'F2' | 'F3',
  fontSize: number,
  x: number,
  y: number,
  text: string,
): void {
  commands.push(`BT /${font} ${fontSize} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfString(text)}) Tj ET`);
}

function pushHorizontalRule(commands: string[], y: number): void {
  commands.push(`0.8 w ${MARGIN_X} ${y} m ${A4_WIDTH - MARGIN_X} ${y} l S`);
}

function buildTableHeaderLine(): string {
  return [
    padRight('No. Transaksi', 18),
    padRight('Waktu', 16),
    padRight('Kasir', 14),
    padRight('Metode', 10),
    padRight('Status', 9),
    padLeft('Total', 13),
    padLeft('Laba', 13),
  ].join(' ');
}

function buildTableDataLine(row: SalesExportTransactionRow): string {
  return [
    padRight(row.transactionNo, 18),
    padRight(row.transactedAtLabel, 16),
    padRight(row.cashierName, 14),
    padRight(row.paymentMethod, 10),
    padRight(row.status, 9),
    padLeft(formatRupiahAscii(row.totalAmount), 13),
    padLeft(formatRupiahAscii(row.grossProfit), 13),
  ].join(' ');
}

function paginateRows(rows: SalesExportTransactionRow[]): SalesExportTransactionRow[][] {
  if (rows.length === 0) {
    return [[]];
  }
  const pages: SalesExportTransactionRow[][] = [];
  pages.push(rows.slice(0, FIRST_PAGE_MAX_ROWS));
  let cursor = FIRST_PAGE_MAX_ROWS;
  while (cursor < rows.length) {
    pages.push(rows.slice(cursor, cursor + NEXT_PAGE_MAX_ROWS));
    cursor += NEXT_PAGE_MAX_ROWS;
  }
  return pages;
}

function renderPageCommands(
  input: SalesPdfReportInput,
  pageRows: SalesExportTransactionRow[],
  pageIndex: number,
  totalPages: number,
): string {
  const cmds: string[] = [];
  let y = TOP_START_Y;

  if (pageIndex === 0) {
    pushTextLine(cmds, 'F2', 15, MARGIN_X, y, `${input.storeName} - Laporan Penjualan`);
    y -= 18;
    pushTextLine(
      cmds,
      'F1',
      9,
      MARGIN_X,
      y,
      `Periode: ${input.periodLabel}   |   Dicetak: ${input.printedAtLabel}`,
    );
    y -= 10;
    pushHorizontalRule(cmds, y);
    y -= 18;

    const { summary } = input;
    pushTextLine(
      cmds,
      'F2',
      10,
      MARGIN_X,
      y,
      `Total Penjualan: ${formatRupiahAscii(summary.totalRevenue)}   |   Transaksi Selesai: ${summary.totalTransactions}   |   Void: ${summary.voidedTransactions}`,
    );
    y -= 15;
    pushTextLine(
      cmds,
      'F1',
      9,
      MARGIN_X,
      y,
      `Rata-rata: ${formatRupiahAscii(summary.avgTransactionValue)}   |   Total HPP: ${formatRupiahAscii(summary.totalCostOfGoodsSold)}   |   Laba Kotor: ${formatRupiahAscii(summary.grossProfit)} (${summary.profitMargin}%)`,
    );
    y -= 14;
    pushHorizontalRule(cmds, y);
    y -= 20;
  } else {
    pushTextLine(
      cmds,
      'F2',
      11,
      MARGIN_X,
      y,
      `${input.storeName} - Detail Transaksi (${input.periodLabel})`,
    );
    y -= 14;
    pushHorizontalRule(cmds, y);
    y -= 18;
  }

  pushTextLine(cmds, 'F3', 8, MARGIN_X, y, buildTableHeaderLine());
  y -= 6;
  pushHorizontalRule(cmds, y);
  y -= LINE_HEIGHT;

  if (pageRows.length === 0) {
    pushTextLine(cmds, 'F1', 9, MARGIN_X, y, 'Tidak ada transaksi pada periode ini.');
  } else {
    for (const row of pageRows) {
      pushTextLine(cmds, 'F3', 7.5, MARGIN_X, y, buildTableDataLine(row));
      y -= LINE_HEIGHT;
    }
  }

  pushTextLine(
    cmds,
    'F1',
    8,
    MARGIN_X,
    FOOTER_Y,
    `Halaman ${pageIndex + 1} dari ${totalPages} - ${input.storeName}`,
  );

  return cmds.join('\n');
}

/**
 * Menghasilkan dokumen PDF 1.4 multi-halaman ukuran A4 secara deterministik tanpa dependensi eksternal.
 */
export function buildSalesReportPdf(input: SalesPdfReportInput): Buffer {
  const rowPages = paginateRows(input.rows);
  const totalPages = rowPages.length;

  // Nomor objek tetap: 1=Catalog, 2=Pages, 3=Helvetica, 4=Helvetica-Bold, 5=Courier
  // Lalu per halaman: (pageObjId, contentObjId) mulai dari 6
  const objects: Array<{ id: number; body: string }> = [
    { id: 1, body: '<< /Type /Catalog /Pages 2 0 R >>' },
    { id: 2, body: '' },
    { id: 3, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>' },
    { id: 4, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>' },
    { id: 5, body: '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>' },
  ];

  const pageIds: number[] = [];
  let nextObjId = 6;

  rowPages.forEach((pageRows, pageIndex) => {
    const pageId = nextObjId++;
    const contentId = nextObjId++;
    pageIds.push(pageId);

    const stream = renderPageCommands(input, pageRows, pageIndex, totalPages);
    const streamLen = Buffer.byteLength(stream, 'utf8');

    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    objects.push({
      id: contentId,
      body: `<< /Length ${streamLen} >>\nstream\n${stream}\nendstream`,
    });
  });

  objects[1] = {
    id: 2,
    body: `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
  };

  objects.sort((a, b) => a.id - b.id);

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets[obj.id] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    const off = offsets[i] ?? 0;
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}
