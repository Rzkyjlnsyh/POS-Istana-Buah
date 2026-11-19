import { escapeCsvCell, type SalesSummaryReportDto } from '@istana-buah/shared';
import ExcelJS from 'exceljs';
import type { SalesExportTransactionRow } from './report.dto';

export interface SpreadsheetSummaryRow {
  label: string;
  value: string | number;
  type?: 'string' | 'number' | 'currency' | 'percent';
}

export interface SpreadsheetColumn {
  header: string;
  key: string;
  width?: number;
  type?: 'string' | 'number' | 'currency' | 'percent';
}

export interface SpreadsheetSheetSection {
  sheetName: string;
  columns: SpreadsheetColumn[];
  rows: Array<Record<string, string | number>>;
}

export interface StructuredSpreadsheetInput {
  storeName: string;
  reportTitle: string;
  periodLabel: string;
  printedAtLabel?: string;
  summaryRows: SpreadsheetSummaryRow[];
  sheets: SpreadsheetSheetSection[];
}

export interface SalesSpreadsheetInput {
  storeName: string;
  periodLabel: string;
  printedAtLabel?: string;
  summary: SalesSummaryReportDto;
  rows: SalesExportTransactionRow[];
}

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
const BRAND_HEADER_ARGB = 'FF14532D';
const BRAND_SUBTLE_ARGB = 'FFF0FDF4';
const STRIPE_ARGB = 'FFF8FAF9';
const BORDER_ARGB = 'FFD4E4D9';

/** Menetralkan potensi CSV/Excel formula injection pada teks bebas input pengguna. */
export function neutralizeFormulaText(value: string): string {
  return FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
}

function sanitizeSheetName(name: string, fallbackIndex: number): string {
  const cleaned = name.replace(/[\\/*?:[\]]/g, ' ').trim();
  if (!cleaned) return `Data ${fallbackIndex}`;
  return cleaned.slice(0, 31);
}

function toNumericCellValue(value: string | number): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getExcelNumFmt(type?: 'string' | 'number' | 'currency' | 'percent'): string | undefined {
  if (type === 'currency') return '#,##0.00';
  if (type === 'number') return '#,##0.###';
  if (type === 'percent') return '0.00"%"';
  return undefined;
}

/**
 * Menghasilkan file CSV ber-UTF-8 BOM untuk laporan terstruktur apapun.
 */
export function buildStructuredCsvBuffer(input: StructuredSpreadsheetInput): Buffer {
  const summaryLines = [
    ['Toko', neutralizeFormulaText(input.storeName)],
    ['Laporan', neutralizeFormulaText(input.reportTitle)],
    ['Periode', input.periodLabel],
    ...(input.printedAtLabel ? [['Dicetak', input.printedAtLabel]] : []),
    ...input.summaryRows.map((row) => [
      row.label,
      typeof row.value === 'number' ? String(row.value) : neutralizeFormulaText(row.value),
    ]),
  ].map((row) => row.map(escapeCsvCell).join(','));

  const sectionBlocks: string[] = [];
  for (const sheet of input.sheets) {
    const headerLine = sheet.columns.map((col) => escapeCsvCell(col.header)).join(',');
    const dataLines = sheet.rows.map((row) =>
      sheet.columns
        .map((col) => {
          const raw = row[col.key] ?? '';
          const text = typeof raw === 'number' ? String(raw) : neutralizeFormulaText(String(raw));
          return escapeCsvCell(text);
        })
        .join(','),
    );
    if (input.sheets.length > 1) {
      sectionBlocks.push(escapeCsvCell(sheet.sheetName));
    }
    sectionBlocks.push(headerLine, ...dataLines, '');
  }

  const csvBody = [...summaryLines, '', ...sectionBlocks].join('\r\n').trimEnd();
  return Buffer.from(`\uFEFF${csvBody}`, 'utf8');
}

/**
 * Menghasilkan workbook Excel OOXML (.xlsx) profesional multi-sheet menggunakan ExcelJS (M12-002).
 */
export async function buildStructuredExcelBuffer(
  input: StructuredSpreadsheetInput,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.storeName;
  workbook.created = new Date();
  workbook.modified = new Date();

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: BORDER_ARGB } },
    left: { style: 'thin', color: { argb: BORDER_ARGB } },
    bottom: { style: 'thin', color: { argb: BORDER_ARGB } },
    right: { style: 'thin', color: { argb: BORDER_ARGB } },
  };

  // Sheet 1: Ringkasan
  const summarySheet = workbook.addWorksheet('Ringkasan');
  summarySheet.columns = [
    { key: 'label', width: 32 },
    { key: 'value', width: 34 },
  ];

  const titleRow = summarySheet.addRow([
    neutralizeFormulaText(`${input.storeName} — ${input.reportTitle}`),
  ]);
  summarySheet.mergeCells('A1:B1');
  titleRow.height = 28;
  titleRow.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleRow.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  titleRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_HEADER_ARGB } };
  });

  const metaRows: SpreadsheetSummaryRow[] = [
    { label: 'Toko', value: input.storeName, type: 'string' },
    { label: 'Jenis Laporan', value: input.reportTitle, type: 'string' },
    { label: 'Periode', value: input.periodLabel, type: 'string' },
    ...(input.printedAtLabel
      ? [{ label: 'Dicetak', value: input.printedAtLabel, type: 'string' as const }]
      : []),
    ...input.summaryRows,
  ];

  metaRows.forEach((entry, index) => {
    const isNumeric = entry.type && entry.type !== 'string';
    const safeVal = isNumeric
      ? toNumericCellValue(entry.value)
      : neutralizeFormulaText(String(entry.value));
    const added = summarySheet.addRow([neutralizeFormulaText(entry.label), safeVal]);
    added.height = 20;

    const labelCell = added.getCell(1);
    const valueCell = added.getCell(2);
    labelCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF102418' } };
    valueCell.font = { name: 'Calibri', size: 10.5, color: { argb: 'FF102418' } };

    const numFmt = getExcelNumFmt(entry.type);
    if (numFmt) {
      valueCell.numFmt = numFmt;
      valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      valueCell.alignment = { horizontal: 'left', vertical: 'middle' };
    }

    const rowBg = index % 2 === 0 ? BRAND_SUBTLE_ARGB : 'FFFFFFFF';
    [labelCell, valueCell].forEach((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
      cell.border = thinBorder;
    });
  });

  // Sheet Data Detail (1 atau lebih sheet)
  input.sheets.forEach((section, sheetIdx) => {
    const ws = workbook.addWorksheet(sanitizeSheetName(section.sheetName, sheetIdx + 1), {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = section.columns.map((col) => ({
      header: col.header,
      key: col.key,
      width: col.width ?? Math.max(16, col.header.length + 4),
    }));

    const headerRow = ws.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell, colNumber) => {
      const colDef = section.columns[colNumber - 1];
      cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_HEADER_ARGB } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: colDef?.type && colDef.type !== 'string' ? 'right' : 'left',
      };
      cell.border = thinBorder;
    });

    section.rows.forEach((rawRow, rowIndex) => {
      const rowValues: Record<string, string | number> = {};
      section.columns.forEach((col) => {
        const rawVal = rawRow[col.key] ?? '';
        if (col.type && col.type !== 'string') {
          rowValues[col.key] = toNumericCellValue(rawVal);
        } else {
          rowValues[col.key] = neutralizeFormulaText(String(rawVal));
        }
      });

      const dataRow = ws.addRow(rowValues);
      dataRow.height = 20;
      const isStriped = rowIndex % 2 === 1;

      dataRow.eachCell((cell, colNumber) => {
        const colDef = section.columns[colNumber - 1];
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF102418' } };
        const numFmt = getExcelNumFmt(colDef?.type);
        if (numFmt) {
          cell.numFmt = numFmt;
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        }
        if (isStriped) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STRIPE_ARGB } };
        }
        cell.border = thinBorder;
      });
    });
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function buildSalesSpreadsheetModel(input: SalesSpreadsheetInput): StructuredSpreadsheetInput {
  return {
    storeName: input.storeName,
    reportTitle: 'Laporan Penjualan',
    periodLabel: input.periodLabel,
    ...(input.printedAtLabel ? { printedAtLabel: input.printedAtLabel } : {}),
    summaryRows: [
      { label: 'Total Penjualan (Rp)', value: input.summary.totalRevenue, type: 'currency' },
      { label: 'Transaksi Selesai', value: input.summary.totalTransactions, type: 'number' },
      { label: 'Transaksi Void', value: input.summary.voidedTransactions, type: 'number' },
      {
        label: 'Rata-rata Transaksi (Rp)',
        value: input.summary.avgTransactionValue,
        type: 'currency',
      },
      { label: 'Total HPP (Rp)', value: input.summary.totalCostOfGoodsSold, type: 'currency' },
      { label: 'Laba Kotor (Rp)', value: input.summary.grossProfit, type: 'currency' },
      { label: 'Margin Kotor (%)', value: input.summary.profitMargin, type: 'percent' },
    ],
    sheets: [
      {
        sheetName: 'Detail Transaksi',
        columns: [
          { header: 'No. Transaksi', key: 'transactionNo', width: 22, type: 'string' },
          { header: 'Waktu Transaksi', key: 'transactedAtLabel', width: 19, type: 'string' },
          { header: 'Kasir', key: 'cashierName', width: 20, type: 'string' },
          { header: 'Metode Pembayaran', key: 'paymentMethod', width: 18, type: 'string' },
          { header: 'Status', key: 'status', width: 14, type: 'string' },
          { header: 'Diskon (Rp)', key: 'discountAmount', width: 16, type: 'currency' },
          { header: 'Total Penjualan (Rp)', key: 'totalAmount', width: 20, type: 'currency' },
          { header: 'Total HPP (Rp)', key: 'costOfGoodsSold', width: 18, type: 'currency' },
          { header: 'Laba Kotor (Rp)', key: 'grossProfit', width: 18, type: 'currency' },
        ],
        rows: input.rows.map((row) => ({
          transactionNo: row.transactionNo,
          transactedAtLabel: row.transactedAtLabel,
          cashierName: row.cashierName,
          paymentMethod: row.paymentMethod,
          status: row.status,
          discountAmount: row.discountAmount,
          totalAmount: row.totalAmount,
          costOfGoodsSold: row.costOfGoodsSold,
          grossProfit: row.grossProfit,
        })),
      },
    ],
  };
}

/**
 * Menghasilkan file CSV ber-UTF-8 BOM dengan ringkasan periode dan detail transaksi.
 */
export function buildSalesCsvBuffer(input: SalesSpreadsheetInput): Buffer {
  return buildStructuredCsvBuffer(buildSalesSpreadsheetModel(input));
}

/**
 * Menghasilkan file Excel OOXML (.xlsx) dua sheet: Ringkasan & Detail Transaksi via ExcelJS.
 */
export async function buildSalesExcelBuffer(input: SalesSpreadsheetInput): Promise<Buffer> {
  return buildStructuredExcelBuffer(buildSalesSpreadsheetModel(input));
}
