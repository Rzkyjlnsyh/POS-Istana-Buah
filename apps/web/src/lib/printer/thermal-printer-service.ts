import type { TransactionDto } from '@istana-buah/shared';
import { webConfig } from '../../config/app.config';
import {
  type ThermalPaperWidth,
  buildReceiptDataFromTransaction,
  encodeEscPosReceipt,
} from './escpos-encoder';

export type ThermalPrintMethod = 'browser' | 'usb' | 'serial' | 'network';

export interface ThermalPrinterConfig {
  method: ThermalPrintMethod;
  paperWidth: ThermalPaperWidth;
  networkIp: string;
  networkPort: number;
  serialBaudRate: number;
  openCashDrawer: boolean;
  autoCut: boolean;
  autoPrintOnCheckout: boolean;
}

const PRINTER_CONFIG_STORAGE_KEY = 'istana_buah_printer_config';

export const DEFAULT_PRINTER_CONFIG: ThermalPrinterConfig = {
  method: 'browser',
  paperWidth: '58mm',
  networkIp: webConfig.printerDefaultIp,
  networkPort: webConfig.printerDefaultPort,
  serialBaudRate: 9600,
  openCashDrawer: true,
  autoCut: true,
  autoPrintOnCheckout: false,
};

// Tipe minimal WebUSB & WebSerial agar tidak bergantung pada @types/w3c-web-usb eksternal
interface WebUsbEndpoint {
  direction: 'in' | 'out';
  type: 'bulk' | 'interrupt' | 'isochronous';
  endpointNumber: number;
}

interface WebUsbAlternateInterface {
  endpoints: WebUsbEndpoint[];
}

interface WebUsbInterface {
  interfaceNumber: number;
  alternates: WebUsbAlternateInterface[];
}

interface WebUsbConfiguration {
  interfaces: WebUsbInterface[];
}

interface WebUsbDevice {
  configuration: WebUsbConfiguration | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<unknown>;
}

interface NavigatorWithHardware extends Navigator {
  usb?: {
    getDevices(): Promise<WebUsbDevice[]>;
    requestDevice(options: { filters: Array<Record<string, unknown>> }): Promise<WebUsbDevice>;
  };
  serial?: {
    getPorts(): Promise<WebSerialPort[]>;
    requestPort(): Promise<WebSerialPort>;
  };
}

interface WebSerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  writable: {
    getWriter(): {
      write(chunk: Uint8Array): Promise<void>;
      releaseLock(): void;
    };
  } | null;
}

/**
 * Memuat konfigurasi printer kasir dari localStorage dengan fallback aman.
 */
export function loadPrinterConfig(): ThermalPrinterConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_PRINTER_CONFIG };
  }

  try {
    const raw = window.localStorage.getItem(PRINTER_CONFIG_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRINTER_CONFIG };
    const parsed = JSON.parse(raw) as Partial<ThermalPrinterConfig>;

    return {
      method:
        parsed.method === 'usb' ||
        parsed.method === 'serial' ||
        parsed.method === 'network' ||
        parsed.method === 'browser'
          ? parsed.method
          : DEFAULT_PRINTER_CONFIG.method,
      paperWidth: parsed.paperWidth === '80mm' ? '80mm' : '58mm',
      networkIp:
        typeof parsed.networkIp === 'string' && parsed.networkIp.trim()
          ? parsed.networkIp.trim()
          : DEFAULT_PRINTER_CONFIG.networkIp,
      networkPort:
        typeof parsed.networkPort === 'number' && parsed.networkPort > 0
          ? parsed.networkPort
          : DEFAULT_PRINTER_CONFIG.networkPort,
      serialBaudRate:
        typeof parsed.serialBaudRate === 'number' && parsed.serialBaudRate > 0
          ? parsed.serialBaudRate
          : DEFAULT_PRINTER_CONFIG.serialBaudRate,
      openCashDrawer:
        typeof parsed.openCashDrawer === 'boolean'
          ? parsed.openCashDrawer
          : DEFAULT_PRINTER_CONFIG.openCashDrawer,
      autoCut:
        typeof parsed.autoCut === 'boolean' ? parsed.autoCut : DEFAULT_PRINTER_CONFIG.autoCut,
      autoPrintOnCheckout:
        typeof parsed.autoPrintOnCheckout === 'boolean'
          ? parsed.autoPrintOnCheckout
          : DEFAULT_PRINTER_CONFIG.autoPrintOnCheckout,
    };
  } catch {
    return { ...DEFAULT_PRINTER_CONFIG };
  }
}

/**
 * Menyimpan konfigurasi printer kasir ke localStorage.
 */
export function savePrinterConfig(config: ThermalPrinterConfig): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PRINTER_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Abaikan jika storage penuh / mode privat
  }
}

/**
 * Mengirim data ESC/POS langsung ke printer thermal USB via WebUSB API.
 */
export async function printViaWebUsb(bytes: Uint8Array): Promise<void> {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
    NavigatorWithHardware | undefined;

  if (!nav?.usb) {
    throw new Error(
      'Browser ini tidak mendukung WebUSB. Gunakan Chrome/Edge atau mode Browser Print.',
    );
  }

  const pairedDevices = await nav.usb.getDevices();
  const device =
    pairedDevices.length > 0 ? pairedDevices[0]! : await nav.usb.requestDevice({ filters: [] });

  await device.open();
  try {
    if (!device.configuration) {
      await device.selectConfiguration(1);
    }

    const iface = device.configuration?.interfaces[0];
    const interfaceNumber = iface?.interfaceNumber ?? 0;
    await device.claimInterface(interfaceNumber);

    const outEndpoint = iface?.alternates[0]?.endpoints.find((ep) => ep.direction === 'out');
    const endpointNumber = outEndpoint?.endpointNumber ?? 1;

    await device.transferOut(endpointNumber, bytes);
  } finally {
    await device.close();
  }
}

/**
 * Mengirim data ESC/POS langsung ke printer thermal Serial/Bluetooth COM via Web Serial API.
 */
export async function printViaWebSerial(bytes: Uint8Array, baudRate = 9600): Promise<void> {
  const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as
    NavigatorWithHardware | undefined;

  if (!nav?.serial) {
    throw new Error(
      'Browser ini tidak mendukung Web Serial API. Gunakan Chrome/Edge atau mode Browser Print.',
    );
  }

  const ports = await nav.serial.getPorts();
  const port = ports.length > 0 ? ports[0]! : await nav.serial.requestPort();

  await port.open({ baudRate });
  try {
    if (!port.writable) {
      throw new Error('Port serial printer tidak dapat ditulisi (writable stream null).');
    }
    const writer = port.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  } finally {
    await port.close();
  }
}

/**
 * Mengirim data ESC/POS ke printer thermal jaringan (LAN / Wi-Fi IP Printer).
 */
export async function printViaNetworkIp(
  bytes: Uint8Array,
  ip: string,
  port = webConfig.printerDefaultPort,
): Promise<void> {
  const cleanIp = ip.trim();
  if (!cleanIp) {
    throw new Error('Alamat IP printer jaringan wajib diisi.');
  }

  const targetUrl = `http://${cleanIp}:${port}/print`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), webConfig.printerNetworkTimeoutMs);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: bytes,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Printer jaringan merespons dengan status HTTP ${response.status}.`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Orkestrator pencetakan struk transaksi POS sesuai konfigurasi aktif (M03-007).
 */
export async function executeThermalPrint(
  transaction: TransactionDto,
  overrideConfig?: Partial<ThermalPrinterConfig>,
): Promise<{ method: ThermalPrintMethod; bytesLength: number }> {
  const config: ThermalPrinterConfig = {
    ...loadPrinterConfig(),
    ...overrideConfig,
  };

  const receiptData = buildReceiptDataFromTransaction(transaction);
  const escPosBytes = encodeEscPosReceipt(receiptData, {
    paperWidth: config.paperWidth,
    openCashDrawer: config.openCashDrawer && transaction.paymentMethod === 'CASH',
    autoCut: config.autoCut,
  });

  if (config.method === 'usb') {
    await printViaWebUsb(escPosBytes);
  } else if (config.method === 'serial') {
    await printViaWebSerial(escPosBytes, config.serialBaudRate);
  } else if (config.method === 'network') {
    await printViaNetworkIp(escPosBytes, config.networkIp, config.networkPort);
  } else {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  return {
    method: config.method,
    bytesLength: escPosBytes.byteLength,
  };
}
