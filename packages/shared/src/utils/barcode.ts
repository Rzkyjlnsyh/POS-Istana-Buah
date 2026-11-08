/**
 * Modul Utilitas Barcode (M02-003 / M02-006).
 * Mendukung perhitungan check digit GS1 EAN-13, validasi, dan encoding pattern biner
 * untuk rendering visual SVG & cetak label thermal printer.
 */

const L_PATTERNS = [
  '0001101', // 0
  '0011001', // 1
  '0010011', // 2
  '0111101', // 3
  '0100011', // 4
  '0110001', // 5
  '0101111', // 6
  '0111011', // 7
  '0110111', // 8
  '0001011', // 9
];

const G_PATTERNS = [
  '0100111', // 0
  '0110011', // 1
  '0011011', // 2
  '0100001', // 3
  '0011101', // 4
  '0111001', // 5
  '0000101', // 6
  '0010001', // 7
  '0001001', // 8
  '0010111', // 9
];

const R_PATTERNS = [
  '1110010', // 0
  '1100110', // 1
  '1101100', // 2
  '1000010', // 3
  '1011100', // 4
  '1001110', // 5
  '1010000', // 6
  '1000100', // 7
  '1001000', // 8
  '1110100', // 9
];

const PARITY_TABLE = [
  'LLLLLL', // 0
  'LLGLGG', // 1
  'LLGGLG', // 2
  'LLGGGL', // 3
  'LGLLGG', // 4
  'LGGLLG', // 5
  'LGGGLL', // 6
  'LGLGLG', // 7
  'LGLGGL', // 8
  'LGGLGL', // 9
];

// Code 39 Patterns (B = wide bar (11), b = narrow bar (1), S = wide space (00), s = narrow space (0))
const CODE_39_PATTERNS: Record<string, string> = {
  '0': '101001101101',
  '1': '110100101011',
  '2': '101100101011',
  '3': '110110010101',
  '4': '101001101011',
  '5': '110100110101',
  '6': '101100110101',
  '7': '101001011011',
  '8': '110100101101',
  '9': '101100101101',
  A: '110101001011',
  B: '101101001011',
  C: '110110100101',
  D: '101011001011',
  E: '110101100101',
  F: '101101100101',
  G: '101010011011',
  H: '110101001101',
  I: '101101001101',
  J: '101011001101',
  K: '110101010011',
  L: '101101010011',
  M: '110110101001',
  N: '101011010011',
  O: '110101101001',
  P: '101101101001',
  Q: '101010110011',
  R: '110101011001',
  S: '101101011001',
  T: '101011011001',
  U: '110010101011',
  V: '100110101011',
  W: '110011010101',
  X: '100101101011',
  Y: '110010110101',
  Z: '100110110101',
  '-': '100101011011',
  '.': '110010101101',
  ' ': '100110101101',
  $: '100100100101',
  '/': '100100101001',
  '+': '100101001001',
  '%': '101001001001',
  '*': '100101101101', // Start / Stop
};

/**
 * Menghitung check digit EAN-13 GS1 (Modulus 10).
 * Mengambil 12 digit numerik pertama, menghitung bobot:
 * - digit posisi ganjil (indeks 0, 2, 4, 6, 8, 10): bobot 1
 * - digit posisi genap (indeks 1, 3, 5, 7, 9, 11): bobot 3
 * check digit = (10 - (sum % 10)) % 10
 */
export function calculateEan13CheckDigit(twelveDigits: string): number {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error('Input harus berupa string 12 digit angka');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number.parseInt(twelveDigits[i] as string, 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }

  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

/**
 * Memvalidasi apakah sebuah string barcode merupakan EAN-13 yang valid dengan check digit GS1 yang benar.
 */
export function isValidEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) {
    return false;
  }
  const twelve = barcode.slice(0, 12);
  const expectedCheckDigit = calculateEan13CheckDigit(twelve);
  const actualCheckDigit = Number.parseInt(barcode[12] as string, 10);
  return expectedCheckDigit === actualCheckDigit;
}

/**
 * Mengonversi barcode EAN-13 13 digit ke dalam pola string biner 95 modul (1 = batang hitam, 0 = spasi putih).
 */
export function encodeEan13Pattern(barcode: string): string {
  if (!/^\d{13}$/.test(barcode)) {
    throw new Error('Barcode EAN-13 harus berupa 13 digit numerik');
  }

  const firstDigit = Number.parseInt(barcode[0] as string, 10);
  const parities = PARITY_TABLE[firstDigit] ?? 'LLLLLL';

  let pattern = '101'; // Left guard (3 modul)

  // 6 digit sebelah kiri (modul 4 hingga 45)
  for (let i = 0; i < 6; i++) {
    const digit = Number.parseInt(barcode[i + 1] as string, 10);
    const parity = parities[i];
    pattern += parity === 'L' ? (L_PATTERNS[digit] ?? '') : (G_PATTERNS[digit] ?? '');
  }

  pattern += '01010'; // Center guard (5 modul)

  // 6 digit sebelah kanan (modul 51 hingga 92)
  for (let i = 0; i < 6; i++) {
    const digit = Number.parseInt(barcode[i + 7] as string, 10);
    pattern += R_PATTERNS[digit] ?? '';
  }

  pattern += '101'; // Right guard (3 modul)

  return pattern;
}

/**
 * Mengonversi string alfanumerik ke dalam pola Code 39 standar dengan start/stop delimiter.
 */
export function encodeCode39Pattern(text: string): string {
  const sanitized = text.toUpperCase();
  const fullText = `*${sanitized}*`;

  let pattern = '';
  for (let i = 0; i < fullText.length; i++) {
    const char = fullText[i] as string;
    const charPattern = CODE_39_PATTERNS[char];
    if (charPattern) {
      pattern += charPattern;
      if (i < fullText.length - 1) {
        pattern += '0'; // Inter-character gap
      }
    }
  }

  return pattern;
}

/**
 * Mengonversi barcode ke dalam pattern modul biner.
 * Jika berupa 13 digit angka, gunakan standar GS1 EAN-13 (95 modul).
 * Jika bukan 13 digit angka, gunakan standar Code 39.
 */
export function encodeBarcodePattern(barcode: string): string {
  const trimmed = barcode.trim();
  if (/^\d{13}$/.test(trimmed)) {
    return encodeEan13Pattern(trimmed);
  }
  return encodeCode39Pattern(trimmed);
}
