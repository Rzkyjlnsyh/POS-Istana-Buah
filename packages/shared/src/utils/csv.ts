/**
 * CSV Utility: Parser, Serializer, and Product Import Template Generator
 */

export interface ParsedCsvRow {
  rowNumber: number;
  data: Record<string, string>;
}

/**
 * Parses raw CSV string into an array of row objects keyed by the header columns.
 * Supports:
 * - Windows (CRLF) and Unix (LF) line breaks
 * - Quoted values containing commas or line breaks
 * - Escaped double quotes ("") inside quotes
 * - Trimming of keys and whitespace
 */
export function parseCsv(csvText: string): ParsedCsvRow[] {
  if (!csvText || csvText.trim().length === 0) {
    return [];
  }

  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i += 1; // skip next quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i += 1; // skip \n
      }
      currentRow.push(currentField.trim());
      currentField = '';

      // Ignore entirely empty rows
      if (currentRow.some((field) => field.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  // Last field and row
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length < 2) {
    return [];
  }

  const headerRow = lines[0];
  if (!headerRow) {
    return [];
  }
  const dataRows = lines.slice(1);
  const headers = headerRow.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  return dataRows.map((row, index) => {
    const rowObj: Record<string, string> = {};
    headers.forEach((header, colIndex) => {
      rowObj[header] = row[colIndex] ?? '';
    });

    return {
      rowNumber: index + 2, // 1-based, header is row 1
      data: rowObj,
    };
  });
}

/**
 * Escapes a cell value for standard CSV formatting.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates the standardized CSV template for bulk product import.
 */
export function generateProductCsvTemplate(): string {
  const headers = [
    'name',
    'categoryName',
    'productType',
    'price',
    'cost',
    'stockQty',
    'minStockAlert',
    'barcode',
    'description',
  ];

  const sampleRows = [
    [
      'Mangga Harum Manis Super',
      'Buah Lokal',
      'WEIGHT',
      '35000',
      '24000',
      '50',
      '10',
      '',
      'Mangga manis segar pilihan langsung dari petani Probolinggo',
    ],
    [
      'Apel Fuji Wang Shan',
      'Buah Impor',
      'UNIT',
      '12500',
      '8500',
      '120',
      '20',
      '8991234567890',
      'Apel manis renyah kualitas grade A',
    ],
    [
      'Jeruk Medan Manis Super',
      'Buah Lokal',
      'WEIGHT',
      '28000',
      '19000',
      '75',
      '15',
      '',
      'Jeruk peras manis banyak air',
    ],
    [
      'Semangka Merah Tanpa Biji',
      'Buah Lokal',
      'WEIGHT',
      '14000',
      '9500',
      '150',
      '30',
      '',
      'Semangka merah manis segar hidrasi tinggi',
    ],
  ];

  const lines = [headers.join(','), ...sampleRows.map((row) => row.map(escapeCsvCell).join(','))];

  return lines.join('\r\n');
}
