import { escapeCsvCell, type SalesSummaryReportDto } from '@istana-buah/shared';
import type { SalesExportTransactionRow } from './report.dto';

export interface SalesSpreadsheetInput {
  storeName: string;
  periodLabel: string;
  summary: SalesSummaryReportDto;
  rows: SalesExportTransactionRow[];
}

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/** Menetralkan potensi CSV/Excel formula injection pada teks bebas input pengguna. */
function neutralizeFormulaText(value: string): string {
  return FORMULA_PREFIX_RE.test(value) ? `'${value}` : value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlStringCell(value: string): string {
  return `<Cell><Data ss:Type="String">${escapeXml(neutralizeFormulaText(value))}</Data></Cell>`;
}

function xmlNumberCell(value: string | number): string {
  const num = typeof value === 'number' ? value : Number(value);
  return `<Cell><Data ss:Type="Number">${Number.isFinite(num) ? num : 0}</Data></Cell>`;
}

/**
 * Menghasilkan file CSV ber-UTF-8 BOM dengan ringkasan periode dan detail transaksi.
 */
export function buildSalesCsvBuffer(input: SalesSpreadsheetInput): Buffer {
  const summaryLines = [
    ['Toko', neutralizeFormulaText(input.storeName)],
    ['Periode', input.periodLabel],
    ['Total Penjualan (Rp)', input.summary.totalRevenue],
    ['Transaksi Selesai', String(input.summary.totalTransactions)],
    ['Transaksi Void', String(input.summary.voidedTransactions)],
    ['Rata-rata Transaksi (Rp)', input.summary.avgTransactionValue],
    ['Total HPP (Rp)', input.summary.totalCostOfGoodsSold],
    ['Laba Kotor (Rp)', input.summary.grossProfit],
    ['Margin Kotor (%)', input.summary.profitMargin],
  ].map((row) => row.map(escapeCsvCell).join(','));

  const tableHeaders = [
    'No. Transaksi',
    'Waktu Transaksi',
    'Kasir',
    'Metode Pembayaran',
    'Status',
    'Diskon (Rp)',
    'Total Penjualan (Rp)',
    'Total HPP (Rp)',
    'Laba Kotor (Rp)',
  ];

  const tableRows = input.rows.map((row) =>
    [
      row.transactionNo,
      row.transactedAtLabel,
      neutralizeFormulaText(row.cashierName),
      row.paymentMethod,
      row.status,
      row.discountAmount,
      row.totalAmount,
      row.costOfGoodsSold,
      row.grossProfit,
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  const csvBody = [
    ...summaryLines,
    '',
    tableHeaders.map(escapeCsvCell).join(','),
    ...tableRows,
  ].join('\r\n');

  return Buffer.from(`\uFEFF${csvBody}`, 'utf8');
}

/**
 * Menghasilkan file Excel SpreadsheetML XML (.xls) dua sheet: Ringkasan & Detail Transaksi.
 */
export function buildSalesExcelBuffer(input: SalesSpreadsheetInput): Buffer {
  const summaryRowsXml = [
    `<Row>${xmlStringCell('Toko')}${xmlStringCell(input.storeName)}</Row>`,
    `<Row>${xmlStringCell('Periode')}${xmlStringCell(input.periodLabel)}</Row>`,
    `<Row>${xmlStringCell('Total Penjualan (Rp)')}${xmlNumberCell(input.summary.totalRevenue)}</Row>`,
    `<Row>${xmlStringCell('Transaksi Selesai')}${xmlNumberCell(input.summary.totalTransactions)}</Row>`,
    `<Row>${xmlStringCell('Transaksi Void')}${xmlNumberCell(input.summary.voidedTransactions)}</Row>`,
    `<Row>${xmlStringCell('Rata-rata Transaksi (Rp)')}${xmlNumberCell(input.summary.avgTransactionValue)}</Row>`,
    `<Row>${xmlStringCell('Total HPP (Rp)')}${xmlNumberCell(input.summary.totalCostOfGoodsSold)}</Row>`,
    `<Row>${xmlStringCell('Laba Kotor (Rp)')}${xmlNumberCell(input.summary.grossProfit)}</Row>`,
    `<Row>${xmlStringCell('Margin Kotor (%)')}${xmlNumberCell(input.summary.profitMargin)}</Row>`,
  ].join('\n');

  const detailHeaderXml = `<Row>${[
    'No. Transaksi',
    'Waktu Transaksi',
    'Kasir',
    'Metode Pembayaran',
    'Status',
    'Diskon (Rp)',
    'Total Penjualan (Rp)',
    'Total HPP (Rp)',
    'Laba Kotor (Rp)',
  ]
    .map(xmlStringCell)
    .join('')}</Row>`;

  const detailRowsXml = input.rows
    .map(
      (row) =>
        `<Row>${xmlStringCell(row.transactionNo)}${xmlStringCell(row.transactedAtLabel)}${xmlStringCell(row.cashierName)}${xmlStringCell(row.paymentMethod)}${xmlStringCell(row.status)}${xmlNumberCell(row.discountAmount)}${xmlNumberCell(row.totalAmount)}${xmlNumberCell(row.costOfGoodsSold)}${xmlNumberCell(row.grossProfit)}</Row>`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Ringkasan">
  <Table>
${summaryRowsXml}
  </Table>
 </Worksheet>
 <Worksheet ss:Name="Detail Transaksi">
  <Table>
${detailHeaderXml}
${detailRowsXml}
  </Table>
 </Worksheet>
</Workbook>
`;

  return Buffer.from(xml, 'utf8');
}
