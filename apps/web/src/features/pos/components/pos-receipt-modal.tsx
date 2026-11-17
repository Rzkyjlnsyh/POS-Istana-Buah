import type { TransactionDto } from '@istana-buah/shared';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Globe,
  Monitor,
  Printer,
  Radio,
  Usb,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import {
  type ThermalPaperWidth,
  buildReceiptDataFromTransaction,
  formatPaymentMethodLabel,
  formatReceiptDateTime,
  formatReceiptTextLines,
} from '../../../lib/printer/escpos-encoder';
import {
  type ThermalPrintMethod,
  type ThermalPrinterConfig,
  executeThermalPrint,
  loadPrinterConfig,
  savePrinterConfig,
} from '../../../lib/printer/thermal-printer-service';
import { formatQuantity, formatRupiah } from '../utils/formatters';

export interface PosReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: TransactionDto | null;
  onPrinted?: (method: ThermalPrintMethod) => void;
}

const PRINT_METHODS: Array<{
  id: ThermalPrintMethod;
  label: string;
  desc: string;
}> = [
  {
    id: 'browser',
    label: 'Browser / OS Driver',
    desc: 'Dialog cetak sistem standar (@media print)',
  },
  {
    id: 'usb',
    label: 'WebUSB Direct (ESC/POS)',
    desc: 'Kabel USB langsung ke printer thermal',
  },
  {
    id: 'serial',
    label: 'Web Serial / Bluetooth COM',
    desc: 'Port COM serial atau Bluetooth thermal',
  },
  {
    id: 'network',
    label: 'Network IP Printer (LAN)',
    desc: 'Cetak via alamat IP lokal (port 9100)',
  },
];

/**
 * Modal Pratinjau Struk Belanja & Pengaturan Printer Thermal ESC/POS (M03-007).
 * Mendukung ukuran kertas 58mm & 80mm serta pengiriman protokol ESC/POS via
 * WebUSB, Web Serial, Network IP, maupun fallback Browser Print.
 */
export function PosReceiptModal({ isOpen, onClose, transaction, onPrinted }: PosReceiptModalProps) {
  const [config, setConfig] = useState<ThermalPrinterConfig>(() => loadPrinterConfig());
  const [isPrinting, setIsPrinting] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setConfig(loadPrinterConfig());
      setFeedback(null);
      setCopiedText(false);
      setIsPrinting(false);
    }
  }, [isOpen]);

  const receiptData = useMemo(() => {
    if (!transaction) return null;
    return buildReceiptDataFromTransaction(transaction);
  }, [transaction]);

  const textLines = useMemo(() => {
    if (!receiptData) return [];
    return formatReceiptTextLines(receiptData, config.paperWidth);
  }, [receiptData, config.paperWidth]);

  if (!transaction || !receiptData) {
    return null;
  }

  const updateConfig = (patch: Partial<ThermalPrinterConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      savePrinterConfig(next);
      return next;
    });
    setFeedback(null);
  };

  const handleCopyReceiptText = async () => {
    const plainText = textLines.join('\n');
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(plainText);
      }
    } catch {
      // Abaikan jika izin clipboard dibatasi
    }
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const handlePrintNow = async () => {
    setIsPrinting(true);
    setFeedback(null);
    savePrinterConfig(config);

    try {
      const result = await executeThermalPrint(transaction, config);
      setFeedback({
        type: 'success',
        message: `Struk berhasil dikirim ke printer (${result.method.toUpperCase()} · ${result.bytesLength} bytes ESC/POS).`,
      });
      onPrinted?.(result.method);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal mencetak struk ke printer thermal. Periksa koneksi perangkat.';
      setFeedback({
        type: 'error',
        message: msg,
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const renderMethodIcon = (methodId: ThermalPrintMethod) => {
    switch (methodId) {
      case 'usb':
        return <Usb className="h-4 w-4 text-primary-700" aria-hidden="true" />;
      case 'serial':
        return <Radio className="h-4 w-4 text-amber-700" aria-hidden="true" />;
      case 'network':
        return <Globe className="h-4 w-4 text-blue-700" aria-hidden="true" />;
      default:
        return <Monitor className="h-4 w-4 text-emerald-700" aria-hidden="true" />;
    }
  };

  const subtotalNum = Number(receiptData.subtotal);
  const discountNum = Number(receiptData.discountAmount);
  const taxNum = Number(receiptData.taxAmount);
  const totalNum = Number(receiptData.totalAmount);
  const paidNum = Number(receiptData.amountPaid);
  const changeNum = Number(receiptData.changeAmount);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Pratinjau & Cetak Struk Kasir"
      description={`Nomor Transaksi: ${receiptData.transactionNo}`}
      size="xl"
      className="max-h-[92vh] overflow-y-auto"
    >
      {feedback ? (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`mb-4 flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-semantic-danger-border bg-semantic-danger-bg text-semantic-danger-ink'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Kolom Kiri: Visualisasi Struk Kertas Thermal (6 kolom) */}
        <div className="flex flex-col items-center rounded-2xl border border-border-subtle bg-surface-subtle p-4 lg:col-span-6">
          <div className="mb-3 flex w-full items-center justify-between">
            <span className="text-xs font-bold text-ink-secondary">
              Simulasi Kertas Thermal ({config.paperWidth})
            </span>
            <button
              type="button"
              onClick={() => void handleCopyReceiptText()}
              className="inline-flex items-center gap-1 rounded-lg border border-border-strong bg-surface-panel px-2.5 py-1 text-xs font-semibold text-ink-primary hover:bg-surface-subtle"
            >
              {copiedText ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  <span className="text-emerald-700">Teks Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-ink-secondary" aria-hidden="true" />
                  <span>Salin Teks Struk</span>
                </>
              )}
            </button>
          </div>

          {/* Kertas Struk Monospace */}
          <div
            id="thermal-print-area"
            data-testid="thermal-receipt-paper"
            className={`w-full rounded-xl border border-neutral-300 bg-white p-4 font-mono text-xs leading-relaxed text-neutral-900 shadow-sm transition-all ${
              config.paperWidth === '58mm' ? 'max-w-[290px]' : 'max-w-[380px]'
            }`}
          >
            {/* Header Toko */}
            <div className="text-center border-b-2 border-dashed border-neutral-300 pb-2.5">
              <p className="text-sm font-black tracking-wide text-neutral-950">
                {receiptData.storeName.toUpperCase()}
              </p>
              <p className="text-xs text-neutral-600">{receiptData.storeAddress}</p>
              <p className="text-xs text-neutral-600">Telp: {receiptData.storePhone}</p>
            </div>

            {/* Metadata Transaksi */}
            <div className="border-b border-dashed border-neutral-300 py-2 space-y-0.5">
              <div className="flex justify-between">
                <span>No. Struk:</span>
                <span className="font-bold">{receiptData.transactionNo}</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu:</span>
                <span>{formatReceiptDateTime(receiptData.transactedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir:</span>
                <span>{receiptData.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span>Metode:</span>
                <span className="font-bold">
                  {formatPaymentMethodLabel(receiptData.paymentMethod)}
                </span>
              </div>
            </div>

            {/* Daftar Item */}
            <div className="border-b border-dashed border-neutral-300 py-2 space-y-1.5">
              {receiptData.items.map((item, idx) => (
                <div key={`${item.name}-${idx}`}>
                  <p className="font-bold text-neutral-900">{item.name}</p>
                  <div className="flex justify-between text-neutral-700">
                    <span>
                      {formatQuantity(Number(item.quantity), item.productType)} x{' '}
                      {formatRupiah(Number(item.unitPrice))}
                    </span>
                    <span className="font-semibold text-neutral-900">
                      {formatRupiah(Number(item.lineTotal))}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Ringkasan Total */}
            <div className="border-b-2 border-dashed border-neutral-300 py-2 space-y-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotalNum)}</span>
              </div>
              {discountNum > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <span>Diskon</span>
                  <span>-{formatRupiah(discountNum)}</span>
                </div>
              ) : null}
              {taxNum > 0 ? (
                <div className="flex justify-between">
                  <span>Pajak (PPN)</span>
                  <span>{formatRupiah(taxNum)}</span>
                </div>
              ) : null}
              <div className="flex justify-between pt-1 text-sm font-black text-neutral-950">
                <span>TOTAL</span>
                <span>{formatRupiah(totalNum)}</span>
              </div>
              <div className="flex justify-between">
                <span>DIBAYAR</span>
                <span>{formatRupiah(paidNum)}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-800">
                <span>KEMBALIAN</span>
                <span>{formatRupiah(changeNum)}</span>
              </div>
            </div>

            {/* Footer Pesan */}
            <div className="pt-2.5 text-center text-xs text-neutral-600">
              <p>{receiptData.footerMessage}</p>
            </div>
          </div>
        </div>

        {/* Kolom Kanan: Konfigurasi Printer Thermal & ESC/POS (6 kolom) */}
        <div className="space-y-4 lg:col-span-6">
          {/* Pilihan Lebar Kertas */}
          <div>
            <p className="text-xs font-bold text-ink-primary mb-1.5">Ukuran Kertas Thermal</p>
            <div className="grid grid-cols-2 gap-2.5">
              {(['58mm', '80mm'] as ThermalPaperWidth[]).map((width) => (
                <button
                  key={width}
                  type="button"
                  onClick={() => updateConfig({ paperWidth: width })}
                  className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-all ${
                    config.paperWidth === width
                      ? 'border-primary-600 bg-primary-50 text-primary-900 ring-2 ring-primary-500/20'
                      : 'border-border-subtle bg-surface-panel text-ink-secondary hover:bg-surface-subtle'
                  }`}
                >
                  <span>Kertas {width}</span>
                  <span className="text-xs font-normal text-ink-muted">
                    {width === '58mm' ? '32 kolom' : '48 kolom'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Pilihan Metode Koneksi Printer */}
          <div>
            <p className="text-xs font-bold text-ink-primary mb-1.5">
              Metode Koneksi Printer Kasir
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PRINT_METHODS.map((pm) => {
                const isSelected = config.method === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => updateConfig({ method: pm.id })}
                    className={`flex flex-col items-start rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? 'border-primary-600 bg-primary-50/70 ring-2 ring-primary-500/20'
                        : 'border-border-subtle bg-surface-panel hover:bg-surface-subtle'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        {renderMethodIcon(pm.id)}
                        <span className="text-xs font-bold text-ink-primary">{pm.label}</span>
                      </div>
                      {isSelected ? (
                        <Check className="h-3.5 w-3.5 text-primary-700" aria-hidden="true" />
                      ) : null}
                    </div>
                    <p className="text-xs text-ink-secondary">{pm.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pengaturan Spesifik Network Printer */}
          {config.method === 'network' ? (
            <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3.5">
              <div className="col-span-2">
                <label
                  htmlFor="printer-network-ip"
                  className="block text-xs font-bold text-ink-primary mb-1"
                >
                  Alamat IP Printer Thermal
                </label>
                <input
                  id="printer-network-ip"
                  type="text"
                  value={config.networkIp}
                  onChange={(e) => updateConfig({ networkIp: e.target.value })}
                  placeholder="192.168.1.200"
                  className="h-10 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-xs font-semibold text-ink-primary focus:border-primary-600 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="printer-network-port"
                  className="block text-xs font-bold text-ink-primary mb-1"
                >
                  Port TCP/HTTP
                </label>
                <input
                  id="printer-network-port"
                  type="number"
                  value={config.networkPort}
                  onChange={(e) =>
                    updateConfig({ networkPort: parseInt(e.target.value, 10) || 9100 })
                  }
                  className="h-10 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-xs font-semibold text-ink-primary focus:border-primary-600 focus:outline-none"
                />
              </div>
            </div>
          ) : null}

          {/* Pengaturan Spesifik Serial Baud Rate */}
          {config.method === 'serial' ? (
            <div className="rounded-2xl border border-border-subtle bg-surface-subtle p-3.5">
              <label
                htmlFor="printer-serial-baud"
                className="block text-xs font-bold text-ink-primary mb-1"
              >
                Kecepatan Baud Rate (Serial COM)
              </label>
              <select
                id="printer-serial-baud"
                value={config.serialBaudRate}
                onChange={(e) =>
                  updateConfig({ serialBaudRate: parseInt(e.target.value, 10) || 9600 })
                }
                className="h-10 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-xs font-semibold text-ink-primary focus:border-primary-600 focus:outline-none"
              >
                <option value={9600}>9600 bps (Standar POS)</option>
                <option value={19200}>19200 bps</option>
                <option value={38400}>38400 bps</option>
                <option value={115200}>115200 bps (High Speed)</option>
              </select>
            </div>
          ) : null}

          {/* Opsi Perangkat Keras ESC/POS */}
          <div className="space-y-2 rounded-2xl border border-border-subtle bg-surface-subtle p-3.5">
            <p className="text-xs font-bold text-ink-primary">Perintah Perangkat Keras ESC/POS</p>

            <label className="flex items-center gap-2.5 text-xs text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={config.openCashDrawer}
                onChange={(e) => updateConfig({ openCashDrawer: e.target.checked })}
                className="h-4 w-4 rounded border-border-strong text-primary-600 focus:ring-primary-500"
              />
              <span>Buka laci uang (Cash Drawer Kick) otomatis pada transaksi Tunai</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={config.autoCut}
                onChange={(e) => updateConfig({ autoCut: e.target.checked })}
                className="h-4 w-4 rounded border-border-strong text-primary-600 focus:ring-primary-500"
              />
              <span>Potong kertas otomatis (Auto-Cut GS V) setelah struk selesai</span>
            </label>
          </div>
        </div>
      </div>

      {/* Footer Tombol Aksi */}
      <div className="mt-6 flex flex-col-reverse items-center justify-end gap-3 border-t border-border-subtle pt-4 sm:flex-row">
        <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
          Tutup
        </Button>

        <Button
          type="button"
          variant="primary"
          disabled={isPrinting}
          onClick={() => void handlePrintNow()}
          className="w-full sm:w-auto min-w-[200px]"
        >
          <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
          <span>{isPrinting ? 'Mengirim ke Printer...' : 'Cetak Struk Sekarang'}</span>
        </Button>
      </div>
    </Modal>
  );
}
