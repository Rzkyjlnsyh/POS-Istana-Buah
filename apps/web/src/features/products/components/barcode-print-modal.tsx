import type { ProductDto } from '@istana-buah/shared';
import { Barcode as BarcodeIcon, Check, Copy, Printer, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BarcodeSvg } from '../../../components/common/barcode-svg';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Modal } from '../../../components/ui/modal';

export type LabelPaperFormat = '58mm' | '80mm' | 'sticker';

export interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductDto | null;
  initialBarcode?: string;
}

function formatRupiah(amount: string | null): string {
  if (!amount) return '-';
  const val = parseFloat(amount);
  if (isNaN(val)) return '-';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function getTodayFormatted(): string {
  const now = new Date();
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
}

/**
 * Modal cetak label barcode thermal (M02-006).
 * Mendukung format thermal 58mm, 80mm, serta stiker 40x30mm dengan preview langsung
 * dan perintah cetak presisi via window.print().
 */
export function BarcodePrintModal({
  isOpen,
  onClose,
  product,
  initialBarcode,
}: BarcodePrintModalProps) {
  const [selectedBarcode, setSelectedBarcode] = useState('');
  const [paperFormat, setPaperFormat] = useState<LabelPaperFormat>('58mm');
  const [copies, setCopies] = useState(1);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!product || !isOpen) {
      return;
    }

    if (initialBarcode) {
      setSelectedBarcode(initialBarcode);
    } else {
      const primary =
        product.barcodes.find((b) => b.isPrimary)?.barcode ?? product.barcodes[0]?.barcode ?? '';
      setSelectedBarcode(primary);
    }

    setCopies(1);
    setIsCopied(false);
  }, [product, isOpen, initialBarcode]);

  if (!product) {
    return null;
  }

  const sellingPrice = product.productType === 'WEIGHT' ? product.pricePerKg : product.pricePerUnit;
  const unitSuffix = product.productType === 'WEIGHT' ? 'kg' : 'pcs';

  const handleCopyBarcode = async () => {
    if (!selectedBarcode) return;
    try {
      await navigator.clipboard.writeText(selectedBarcode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Lebar style label sesuai format
  const formatWidthClasses = {
    '58mm': 'max-w-[210px]',
    '80mm': 'max-w-[300px]',
    sticker: 'max-w-[180px]',
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Cetak Label Barcode"
      description="Konfigurasi format kertas thermal dan cetak stiker barcode produk."
      size="lg"
    >
      <div className="space-y-6 text-sm">
        {/* Pilihan Barcode & Pengaturan Format */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Pilihan Barcode */}
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="select-barcode-print" className="text-xs font-bold text-ink-primary">
              Barcode yang Dicetak
            </Label>
            {product.barcodes.length === 0 ? (
              <p className="text-xs text-red-600">Produk ini belum memiliki barcode.</p>
            ) : product.barcodes.length === 1 ? (
              <div className="flex h-10 items-center rounded-xl border border-border-subtle bg-surface-canvas px-3 font-mono text-xs font-bold text-ink-primary">
                {product.barcodes[0]?.barcode}
              </div>
            ) : (
              <select
                id="select-barcode-print"
                value={selectedBarcode}
                onChange={(e) => setSelectedBarcode(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-border-subtle bg-surface-panel px-3 font-mono text-xs text-ink-primary focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {product.barcodes.map((bc) => (
                  <option key={bc.id} value={bc.barcode}>
                    {bc.barcode} {bc.isPrimary ? '(Utama)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Format Kertas Thermal */}
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="select-paper-format" className="text-xs font-bold text-ink-primary">
              Ukuran Kertas Thermal
            </Label>
            <select
              id="select-paper-format"
              value={paperFormat}
              onChange={(e) => setPaperFormat(e.target.value as LabelPaperFormat)}
              className="flex h-10 w-full rounded-xl border border-border-subtle bg-surface-panel px-3 text-xs text-ink-primary focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="58mm">Thermal 58mm</option>
              <option value="80mm">Thermal 80mm</option>
              <option value="sticker">Stiker 40x30mm</option>
            </select>
          </div>

          {/* Jumlah Salinan */}
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="input-label-copies" className="text-xs font-bold text-ink-primary">
              Jumlah Salinan
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="input-label-copies"
                type="number"
                min="1"
                max="100"
                value={copies}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setCopies(isNaN(val) || val < 1 ? 1 : Math.min(100, val));
                }}
                className="h-10 text-xs"
              />
              <div className="flex gap-1">
                {[1, 5, 10].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setCopies(preset)}
                    className={`rounded-lg px-2 py-1 text-xs font-semibold border ${
                      copies === preset
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                        : 'border-border-subtle bg-surface-canvas text-ink-secondary hover:bg-surface-subtle'
                    }`}
                  >
                    {preset}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview Label Thermal */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-ink-secondary">
              <Sparkles className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
              Preview Label Thermal ({paperFormat})
            </span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleCopyBarcode()}
              disabled={!selectedBarcode}
              className="h-7 text-xs text-ink-secondary"
            >
              {isCopied ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  Tersalin!
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Salin Kode
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center justify-center rounded-2xl border border-dashed border-border-subtle bg-surface-canvas p-6">
            {/* Template Desain Label Thermal */}
            <div
              className={`w-full ${formatWidthClasses[paperFormat]} rounded-xl border border-neutral-300 bg-white p-4 shadow-sm text-center text-neutral-900 select-none`}
            >
              <p className="text-xs font-extrabold tracking-wider uppercase text-neutral-800">
                ISTANA BUAH SEMARANG
              </p>
              <p className="text-xs text-neutral-500 uppercase tracking-tight">
                Supermarket Buah Segar
              </p>
              <div className="my-1.5 border-b border-dashed border-neutral-300" />

              <p className="text-xs font-bold leading-tight text-neutral-900 line-clamp-2">
                {product.name}
              </p>
              <p className="text-xs text-neutral-500">{product.category.name}</p>

              <div className="my-1.5">
                <span className="text-sm font-black tabular-nums text-emerald-800">
                  {formatRupiah(sellingPrice)}
                </span>
                <span className="text-xs text-neutral-600"> / {unitSuffix}</span>
              </div>

              {selectedBarcode ? (
                <div className="my-2 flex justify-center">
                  <BarcodeSvg value={selectedBarcode} height={46} showText={true} />
                </div>
              ) : (
                <div className="my-4 flex items-center justify-center rounded border border-neutral-200 bg-neutral-50 p-2 text-xs text-neutral-400">
                  <BarcodeIcon className="mr-1 h-4 w-4" aria-hidden="true" />
                  Tanpa Barcode
                </div>
              )}

              <div className="border-t border-dashed border-neutral-300 pt-1 flex items-center justify-between text-xs text-neutral-500 font-mono">
                <span>Tgl: {getTodayFormatted()}</span>
                <span>POS-IB</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse justify-end gap-3 pt-3 border-t border-border-subtle sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">
            Tutup
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={handlePrint}
            disabled={!selectedBarcode}
            className="w-full sm:w-auto"
          >
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Cetak {copies} Label Thermal
          </Button>
        </div>
      </div>

      {/* Area Cetak Tersembunyi untuk Browser print (@media print) */}
      <div id="thermal-print-area" className="hidden print:block">
        {Array.from({ length: copies }).map((_, idx) => (
          <div
            key={idx}
            className={`w-full ${
              paperFormat === '58mm'
                ? 'max-w-[58mm]'
                : paperFormat === '80mm'
                  ? 'max-w-[80mm]'
                  : 'max-w-[40mm]'
            } mx-auto p-2 text-center text-black font-sans print-page-break`}
            style={{ pageBreakAfter: 'always', breakAfter: 'page' }}
          >
            <p className="text-xs font-extrabold uppercase tracking-wide">ISTANA BUAH SEMARANG</p>
            <p className="text-xs uppercase">Supermarket Buah Segar</p>
            <hr className="my-1 border-black" />

            <p className="text-xs font-bold leading-tight">{product.name}</p>
            <p className="text-xs">{product.category.name}</p>

            <p className="my-1 text-xs font-black">
              {formatRupiah(sellingPrice)} / {unitSuffix}
            </p>

            {selectedBarcode ? (
              <div className="my-1 flex justify-center">
                <BarcodeSvg value={selectedBarcode} height={44} showText={true} />
              </div>
            ) : null}

            <hr className="my-1 border-black" />
            <div className="flex justify-between text-xs font-mono">
              <span>Tgl: {getTodayFormatted()}</span>
              <span>POS-IB</span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
