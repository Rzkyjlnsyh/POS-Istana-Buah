import { useEffect, useRef } from 'react';

export interface UseUsbBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  minBarcodeLength?: number;
  maxKeyIntervalMs?: number;
}

/**
 * Hook global listener untuk mendeteksi pemindai barcode USB HID hardware (M03-004).
 * Pemindai USB HID beroperasi sebagai input keyboard berkecepatan tinggi (<50ms per karakter)
 * diakhiri dengan tombol Enter.
 */
export function useUsbBarcodeScanner({
  onScan,
  enabled = true,
  minBarcodeLength = 3,
  maxKeyIntervalMs = 50,
}: UseUsbBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const isScannerSequenceRef = useRef<boolean>(false);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Abaikan tombol modifier
      if (
        event.key === 'Shift' ||
        event.key === 'Control' ||
        event.key === 'Alt' ||
        event.key === 'Meta' ||
        event.key === 'Tab'
      ) {
        return;
      }

      const now = Date.now();
      const elapsed = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Handle Enter (Akhir dari transmisi barcode oleh scanner)
      if (event.key === 'Enter') {
        const barcode = bufferRef.current.trim();
        const wasScanner = isScannerSequenceRef.current;

        bufferRef.current = '';
        isScannerSequenceRef.current = false;

        if (barcode.length >= minBarcodeLength && (wasScanner || elapsed <= maxKeyIntervalMs * 2)) {
          event.preventDefault();
          event.stopPropagation();
          onScan(barcode);
        }
        return;
      }

      // Jika jeda antar karakter melebihi batas waktu scanner, reset buffer
      if (elapsed > maxKeyIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = '';
        isScannerSequenceRef.current = false;
      }

      // Hanya tampung karakter cetak tunggal (karakter 1 huruf/angka)
      if (event.key.length === 1) {
        if (bufferRef.current.length > 0 && elapsed <= maxKeyIntervalMs) {
          isScannerSequenceRef.current = true;
        }
        bufferRef.current += event.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, maxKeyIntervalMs, minBarcodeLength, onScan]);
}
