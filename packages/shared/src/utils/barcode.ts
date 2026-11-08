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
