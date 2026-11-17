import type { TransactionDto } from '@istana-buah/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PRINTER_CONFIG,
  executeThermalPrint,
  loadPrinterConfig,
  printViaNetworkIp,
  printViaWebSerial,
  printViaWebUsb,
  savePrinterConfig,
} from './thermal-printer-service';

const tx = {
  id: 'tx-1',
  transactionNo: 'TRX-20261117-0001',
  cashierName: 'Siti',
  transactedAt: '2026-11-17T07:30:00.000Z',
  paymentMethod: 'CASH',
  subtotal: '15000',
  discountAmount: '0',
  taxAmount: '0',
  totalAmount: '15000',
  amountPaid: '20000',
  changeAmount: '5000',
  items: [
    {
      productName: 'Nanas Madu',
      productType: 'UNIT',
      quantity: '1',
      unitPrice: '15000',
      lineTotal: '15000',
    },
  ],
} as unknown as TransactionDto;

function setNavigatorProp(name: string, value: unknown) {
  Object.defineProperty(navigator, name, { value, configurable: true });
}

describe('thermal-printer-service (M03-007)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'usb');
    Reflect.deleteProperty(navigator, 'serial');
  });

  it('memuat konfigurasi default bila storage kosong atau rusak', () => {
    expect(loadPrinterConfig()).toEqual(DEFAULT_PRINTER_CONFIG);
    window.localStorage.setItem('istana_buah_printer_config', '{rusak');
    expect(loadPrinterConfig()).toEqual(DEFAULT_PRINTER_CONFIG);
  });

  it('menyimpan & memuat konfigurasi, memvalidasi nilai tak valid', () => {
    savePrinterConfig({
      ...DEFAULT_PRINTER_CONFIG,
      method: 'network',
      paperWidth: '80mm',
      networkIp: '10.0.0.5',
      networkPort: 9101,
      autoCut: false,
    });
    const loaded = loadPrinterConfig();
    expect(loaded.method).toBe('network');
    expect(loaded.paperWidth).toBe('80mm');
    expect(loaded.networkIp).toBe('10.0.0.5');
    expect(loaded.networkPort).toBe(9101);
    expect(loaded.autoCut).toBe(false);

    window.localStorage.setItem(
      'istana_buah_printer_config',
      JSON.stringify({ method: 'bogus', paperWidth: 'x', networkIp: ' ', networkPort: -1 }),
    );
    const sanitized = loadPrinterConfig();
    expect(sanitized.method).toBe(DEFAULT_PRINTER_CONFIG.method);
    expect(sanitized.paperWidth).toBe('58mm');
    expect(sanitized.networkIp).toBe(DEFAULT_PRINTER_CONFIG.networkIp);
    expect(sanitized.networkPort).toBe(DEFAULT_PRINTER_CONFIG.networkPort);
  });

  it('WebUSB: error jelas bila tidak didukung', async () => {
    await expect(printViaWebUsb(new Uint8Array([1]))).rejects.toThrow(/WebUSB/);
  });

  it('WebUSB: mengirim bytes ke endpoint OUT lalu menutup perangkat', async () => {
    const device = {
      configuration: {
        interfaces: [
          {
            interfaceNumber: 0,
            alternates: [{ endpoints: [{ direction: 'out', type: 'bulk', endpointNumber: 3 }] }],
          },
        ],
      },
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      selectConfiguration: vi.fn().mockResolvedValue(undefined),
      claimInterface: vi.fn().mockResolvedValue(undefined),
      transferOut: vi.fn().mockResolvedValue({}),
    };
    setNavigatorProp('usb', {
      getDevices: vi.fn().mockResolvedValue([device]),
      requestDevice: vi.fn(),
    });

    const bytes = new Uint8Array([0x1b, 0x40]);
    await printViaWebUsb(bytes);
    expect(device.claimInterface).toHaveBeenCalledWith(0);
    expect(device.transferOut).toHaveBeenCalledWith(3, bytes);
    expect(device.close).toHaveBeenCalledTimes(1);
  });

  it('WebUSB: meminta perangkat bila belum ada yang dipasangkan & tetap menutup saat gagal', async () => {
    const device = {
      configuration: null,
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      selectConfiguration: vi.fn().mockResolvedValue(undefined),
      claimInterface: vi.fn().mockRejectedValue(new Error('claim gagal')),
      transferOut: vi.fn(),
    };
    const requestDevice = vi.fn().mockResolvedValue(device);
    setNavigatorProp('usb', { getDevices: vi.fn().mockResolvedValue([]), requestDevice });

    await expect(printViaWebUsb(new Uint8Array([1]))).rejects.toThrow('claim gagal');
    expect(requestDevice).toHaveBeenCalled();
    expect(device.selectConfiguration).toHaveBeenCalledWith(1);
    expect(device.close).toHaveBeenCalledTimes(1);
  });

  it('Web Serial: error bila tidak didukung', async () => {
    await expect(printViaWebSerial(new Uint8Array([1]))).rejects.toThrow(/Web Serial/);
  });

  it('Web Serial: menulis bytes lalu melepas writer & menutup port', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const releaseLock = vi.fn();
    const port = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      writable: { getWriter: () => ({ write, releaseLock }) },
    };
    setNavigatorProp('serial', {
      getPorts: vi.fn().mockResolvedValue([port]),
      requestPort: vi.fn(),
    });

    const bytes = new Uint8Array([7, 8]);
    await printViaWebSerial(bytes, 19200);
    expect(port.open).toHaveBeenCalledWith({ baudRate: 19200 });
    expect(write).toHaveBeenCalledWith(bytes);
    expect(releaseLock).toHaveBeenCalled();
    expect(port.close).toHaveBeenCalled();
  });

  it('Web Serial: error bila port tidak writable', async () => {
    const port = {
      open: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      writable: null,
    };
    setNavigatorProp('serial', {
      getPorts: vi.fn().mockResolvedValue([]),
      requestPort: vi.fn().mockResolvedValue(port),
    });
    await expect(printViaWebSerial(new Uint8Array([1]))).rejects.toThrow(/writable/);
    expect(port.close).toHaveBeenCalled();
  });

  it('Network: menolak IP kosong, mengirim POST, dan melempar saat HTTP error', async () => {
    await expect(printViaNetworkIp(new Uint8Array([1]), '  ')).rejects.toThrow(/IP/);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const bytes = new Uint8Array([1, 2]);
    await printViaNetworkIp(bytes, '10.0.0.5', 9100);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://10.0.0.5:9100/print',
      expect.objectContaining({ method: 'POST', body: bytes }),
    );

    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(printViaNetworkIp(bytes, '10.0.0.5', 9100)).rejects.toThrow(/500/);
    vi.unstubAllGlobals();
  });

  it('executeThermalPrint: mode browser memanggil window.print', async () => {
    const printSpy = vi.fn();
    window.print = printSpy;

    const result = await executeThermalPrint(tx, { method: 'browser' });
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(result.method).toBe('browser');
    expect(result.bytesLength).toBeGreaterThan(0);
  });

  it('executeThermalPrint: mode network mengirim bytes ESC/POS', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const result = await executeThermalPrint(tx, {
      method: 'network',
      networkIp: '10.0.0.9',
      networkPort: 9100,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.method).toBe('network');
    vi.unstubAllGlobals();
  });
});
