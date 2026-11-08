import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUsbBarcodeScanner } from './use-usb-barcode-scanner';

describe('useUsbBarcodeScanner hook (M03-004)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('mendeteksi pemindaian scanner USB cepat (<50ms per karakter) dan memanggil onScan saat Enter', () => {
    const onScan = vi.fn();
    renderHook(() => useUsbBarcodeScanner({ onScan, maxKeyIntervalMs: 50 }));

    let mockTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

    const barcodeChars = ['8', '9', '9', '1', '2', '3', '4', '5'];
    for (const char of barcodeChars) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      mockTime += 15; // Kecepatan scanner hardware sangat tinggi (~15ms per karakter)
    }

    // Akhiri dengan Enter
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('89912345');
  });

  it('mengabaikan pengetikan manual lambat (>50ms per karakter)', () => {
    const onScan = vi.fn();
    renderHook(() => useUsbBarcodeScanner({ onScan, maxKeyIntervalMs: 50 }));

    let mockTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

    // Karakter pertama
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '8', bubbles: true }));
    mockTime += 300; // Manusia mengetik lambat (300ms)

    // Karakter kedua
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true }));
    mockTime += 300;

    // Enter ditekan
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onScan).not.toHaveBeenCalled();
  });

  it('mengabaikan tombol kontrol dan modifier (Shift, Control, Alt)', () => {
    const onScan = vi.fn();
    renderHook(() => useUsbBarcodeScanner({ onScan, maxKeyIntervalMs: 50 }));

    const mockTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onScan).not.toHaveBeenCalled();
  });

  it('tidak memproses barcode jika panjang kurang dari minBarcodeLength', () => {
    const onScan = vi.fn();
    renderHook(() => useUsbBarcodeScanner({ onScan, minBarcodeLength: 5, maxKeyIntervalMs: 50 }));

    let mockTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

    // Ketik cepat 3 karakter (kurang dari 5)
    for (const char of ['1', '2', '3']) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      mockTime += 10;
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onScan).not.toHaveBeenCalled();
  });
});
