import type { SalesSummaryReportDto } from '@istana-buah/shared';
import PDFDocument from 'pdfkit';
import type { SalesExportTransactionRow } from './report.dto';

export interface PdfKpiItem {
  label: string;
  value: string;
  note?: string;
}

export interface PdfTableColumn {
  header: string;
  weight: number;
  align?: 'left' | 'right' | 'center';
}

export interface PdfTableSection {
  title: string;
  columns: PdfTableColumn[];
  rows: string[][];
  emptyMessage: string;
}

export interface StructuredPdfReportInput {
  storeName: string;
  reportTitle: string;
  periodLabel: string;
  printedAtLabel: string;
  kpis: PdfKpiItem[];
  sections: PdfTableSection[];
}

export interface SalesPdfReportInput {
  storeName: string;
  periodLabel: string;
  printedAtLabel: string;
  summary: SalesSummaryReportDto;
  rows: SalesExportTransactionRow[];
}

const PAGE_MARGIN = 36;
const FOOTER_RESERVE = 42;
const BRAND_PRIMARY_HEX = '#14532D';
const BRAND_SOFT_BG_HEX = '#F0FDF4';
const ROW_STRIPE_HEX = '#F8FAF9';
const BORDER_SUBTLE_HEX = '#D4E4D9';
const INK_PRIMARY_HEX = '#102418';
const INK_SECONDARY_HEX = '#4B6755';

export function formatRupiahPdf(value: string | number): string {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  const sign = num < 0 ? '-' : '';
  const absFormatted = Math.round(Math.abs(num))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${absFormatted}`;
}

function sanitizePdfText(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim();
}

function truncateToFit(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
  fontSize: number,
): string {
  const clean = sanitizePdfText(text);
  doc.fontSize(fontSize);
  if (doc.widthOfString(clean) <= maxWidth) {
    return clean;
  }
  let clipped = clean;
  while (clipped.length > 1 && doc.widthOfString(`${clipped}...`) > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}...`;
}

function computeColumnWidths(columns: PdfTableColumn[], totalWidth: number): number[] {
  const totalWeight = columns.reduce((sum, col) => sum + Math.max(1, col.weight), 0);
  return columns.map((col) => (Math.max(1, col.weight) / totalWeight) * totalWidth);
}

/**
 * Menghasilkan dokumen PDF A4 profesional multi-halaman menggunakan PDFKit.
 */
export async function buildStructuredReportPdf(input: StructuredPdfReportInput): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      bufferPages: true,
      info: {
        Title: `${input.storeName} - ${input.reportTitle}`,
        Author: input.storeName,
        Subject: `Periode ${input.periodLabel}`,
        Creator: 'Istana Buah POS',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - PAGE_MARGIN * 2;
    const maxContentY = pageHeight - PAGE_MARGIN - FOOTER_RESERVE;

    // 1. Header Banner Halaman Pertama
    let y = PAGE_MARGIN;
    const bannerHeight = 56;
    doc.save();
    doc.roundedRect(PAGE_MARGIN, y, contentWidth, bannerHeight, 6).fill(BRAND_PRIMARY_HEX);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(14);
    doc.text(sanitizePdfText(input.storeName), PAGE_MARGIN + 14, y + 11, {
      width: contentWidth - 28,
      lineBreak: false,
    });
    doc.fillColor('#DCFCE7').font('Helvetica').fontSize(10);
    doc.text(sanitizePdfText(input.reportTitle), PAGE_MARGIN + 14, y + 31, {
      width: contentWidth - 28,
      lineBreak: false,
    });
    doc.restore();

    y += bannerHeight + 10;

    // Baris Metadata Periode & Waktu Cetak
    doc.fillColor(INK_SECONDARY_HEX).font('Helvetica').fontSize(8.5);
    doc.text(`Periode: ${sanitizePdfText(input.periodLabel)}`, PAGE_MARGIN, y, {
      width: contentWidth * 0.6,
      lineBreak: false,
    });
    doc.text(
      `Dicetak: ${sanitizePdfText(input.printedAtLabel)}`,
      PAGE_MARGIN + contentWidth * 0.6,
      y,
      {
        width: contentWidth * 0.4,
        align: 'right',
        lineBreak: false,
      },
    );
    y += 16;

    // 2. Kartu KPI Ringkasan (maksimal 4 kolom per baris)
    if (input.kpis.length > 0) {
      const colsPerRow = Math.min(4, Math.max(2, input.kpis.length));
      const gap = 8;
      const cardWidth = (contentWidth - gap * (colsPerRow - 1)) / colsPerRow;
      const cardHeight = 46;

      for (let idx = 0; idx < input.kpis.length; idx += colsPerRow) {
        const rowCards = input.kpis.slice(idx, idx + colsPerRow);
        if (y + cardHeight > maxContentY) {
          doc.addPage();
          y = PAGE_MARGIN;
        }
        rowCards.forEach((kpi, colIdx) => {
          const cardX = PAGE_MARGIN + colIdx * (cardWidth + gap);
          doc.save();
          doc
            .roundedRect(cardX, y, cardWidth, cardHeight, 4)
            .fillAndStroke(BRAND_SOFT_BG_HEX, BORDER_SUBTLE_HEX);
          doc.fillColor(INK_SECONDARY_HEX).font('Helvetica').fontSize(7.5);
          doc.text(truncateToFit(doc, kpi.label, cardWidth - 12, 7.5), cardX + 6, y + 7, {
            width: cardWidth - 12,
            lineBreak: false,
          });
          doc.fillColor(INK_PRIMARY_HEX).font('Helvetica-Bold').fontSize(10.5);
          doc.text(truncateToFit(doc, kpi.value, cardWidth - 12, 10.5), cardX + 6, y + 19, {
            width: cardWidth - 12,
            lineBreak: false,
          });
          if (kpi.note) {
            doc.fillColor(INK_SECONDARY_HEX).font('Helvetica').fontSize(7);
            doc.text(truncateToFit(doc, kpi.note, cardWidth - 12, 7), cardX + 6, y + 34, {
              width: cardWidth - 12,
              lineBreak: false,
            });
          }
          doc.restore();
        });
        y += cardHeight + 10;
      }
    }

    const drawContinuationHeader = (sectionTitle: string): number => {
      let nextY = PAGE_MARGIN;
      doc.fillColor(BRAND_PRIMARY_HEX).font('Helvetica-Bold').fontSize(10.5);
      doc.text(
        `${sanitizePdfText(input.storeName)} — ${sanitizePdfText(sectionTitle)} (${sanitizePdfText(input.periodLabel)})`,
        PAGE_MARGIN,
        nextY,
        { width: contentWidth, lineBreak: false },
      );
      nextY += 15;
      doc
        .moveTo(PAGE_MARGIN, nextY)
        .lineTo(PAGE_MARGIN + contentWidth, nextY)
        .lineWidth(0.75)
        .strokeColor(BORDER_SUBTLE_HEX)
        .stroke();
      return nextY + 10;
    };

    const drawTableHeader = (
      columns: PdfTableColumn[],
      colWidths: number[],
      topY: number,
    ): number => {
      const headerHeight = 20;
      doc.save();
      doc.rect(PAGE_MARGIN, topY, contentWidth, headerHeight).fill(BRAND_PRIMARY_HEX);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.8);

      let cursorX = PAGE_MARGIN;
      columns.forEach((col, index) => {
        const w = colWidths[index] ?? 60;
        const text = truncateToFit(doc, col.header, w - 8, 7.8);
        doc.text(text, cursorX + 4, topY + 6, {
          width: w - 8,
          align: col.align ?? 'left',
          lineBreak: false,
        });
        cursorX += w;
      });
      doc.restore();
      return topY + headerHeight;
    };

    // 3. Render Setiap Section Tabel dengan Paginasi Otomatis
    const rowHeight = 18;
    for (const section of input.sections) {
      if (y + 52 > maxContentY) {
        doc.addPage();
        y = PAGE_MARGIN;
      }

      doc.fillColor(INK_PRIMARY_HEX).font('Helvetica-Bold').fontSize(10.5);
      doc.text(sanitizePdfText(section.title), PAGE_MARGIN, y, {
        width: contentWidth,
        lineBreak: false,
      });
      y += 16;

      const colWidths = computeColumnWidths(section.columns, contentWidth);
      y = drawTableHeader(section.columns, colWidths, y);

      if (section.rows.length === 0) {
        doc.save();
        doc.rect(PAGE_MARGIN, y, contentWidth, 24).fillAndStroke(ROW_STRIPE_HEX, BORDER_SUBTLE_HEX);
        doc.fillColor(INK_SECONDARY_HEX).font('Helvetica-Oblique').fontSize(8.5);
        doc.text(sanitizePdfText(section.emptyMessage), PAGE_MARGIN + 8, y + 7, {
          width: contentWidth - 16,
          lineBreak: false,
        });
        doc.restore();
        y += 34;
        continue;
      }

      section.rows.forEach((rowCells, rowIdx) => {
        if (y + rowHeight > maxContentY) {
          doc.addPage();
          y = drawContinuationHeader(section.title);
          y = drawTableHeader(section.columns, colWidths, y);
        }

        doc.save();
        if (rowIdx % 2 === 1) {
          doc.rect(PAGE_MARGIN, y, contentWidth, rowHeight).fill(ROW_STRIPE_HEX);
        }
        doc
          .moveTo(PAGE_MARGIN, y + rowHeight)
          .lineTo(PAGE_MARGIN + contentWidth, y + rowHeight)
          .lineWidth(0.4)
          .strokeColor(BORDER_SUBTLE_HEX)
          .stroke();

        doc.fillColor(INK_PRIMARY_HEX).font('Helvetica').fontSize(7.6);
        let cursorX = PAGE_MARGIN;
        section.columns.forEach((col, colIdx) => {
          const w = colWidths[colIdx] ?? 60;
          const cellValue = rowCells[colIdx] ?? '';
          const clipped = truncateToFit(doc, cellValue, w - 8, 7.6);
          doc.text(clipped, cursorX + 4, y + 5, {
            width: w - 8,
            align: col.align ?? 'left',
            lineBreak: false,
          });
          cursorX += w;
        });
        doc.restore();
        y += rowHeight;
      });

      y += 14;
    }

    // 4. Footer Nomor Halaman Akurat di Setiap Halaman
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const footerRuleY = pageHeight - PAGE_MARGIN - 16;
      doc.save();
      doc
        .moveTo(PAGE_MARGIN, footerRuleY)
        .lineTo(PAGE_MARGIN + contentWidth, footerRuleY)
        .lineWidth(0.6)
        .strokeColor(BORDER_SUBTLE_HEX)
        .stroke();
      doc.fillColor(INK_SECONDARY_HEX).font('Helvetica').fontSize(8);
      doc.text(
        `Halaman ${i + 1} dari ${range.count} — ${sanitizePdfText(input.storeName)}`,
        PAGE_MARGIN,
        footerRuleY + 5,
        { width: contentWidth, align: 'left', lineBreak: false },
      );
      doc.restore();
    }

    doc.end();
  });
}

/**
 * Menghasilkan dokumen PDF Laporan Penjualan A4 multi-halaman via PDFKit (M12-002).
 */
export async function buildSalesReportPdf(input: SalesPdfReportInput): Promise<Buffer> {
  const { summary } = input;
  return buildStructuredReportPdf({
    storeName: input.storeName,
    reportTitle: 'Laporan Penjualan & Laba Kotor',
    periodLabel: input.periodLabel,
    printedAtLabel: input.printedAtLabel,
    kpis: [
      {
        label: 'Total Penjualan',
        value: formatRupiahPdf(summary.totalRevenue),
        note: `${summary.totalTransactions} selesai · ${summary.voidedTransactions} batal`,
      },
      {
        label: 'Total HPP (Modal)',
        value: formatRupiahPdf(summary.totalCostOfGoodsSold),
        note: `Rata-rata ${formatRupiahPdf(summary.avgTransactionValue)}/trx`,
      },
      {
        label: 'Laba Kotor',
        value: formatRupiahPdf(summary.grossProfit),
        note: `Margin kotor ${summary.profitMargin}%`,
      },
    ],
    sections: [
      {
        title: 'Detail Transaksi Penjualan',
        columns: [
          { header: 'No. Transaksi', weight: 19, align: 'left' },
          { header: 'Waktu', weight: 16, align: 'left' },
          { header: 'Kasir', weight: 15, align: 'left' },
          { header: 'Metode', weight: 11, align: 'left' },
          { header: 'Status', weight: 11, align: 'left' },
          { header: 'Total', weight: 14, align: 'right' },
          { header: 'Laba Kotor', weight: 14, align: 'right' },
        ],
        rows: input.rows.map((row) => [
          row.transactionNo,
          row.transactedAtLabel,
          row.cashierName,
          row.paymentMethod,
          row.status,
          formatRupiahPdf(row.totalAmount),
          formatRupiahPdf(row.grossProfit),
        ]),
        emptyMessage: 'Tidak ada transaksi pada periode ini.',
      },
    ],
  });
}
