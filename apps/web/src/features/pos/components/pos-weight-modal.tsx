import type { ProductDto } from '@istana-buah/shared';
import { AlertCircle, Calculator, Check, Delete, RotateCcw } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { formatRupiah } from '../utils/formatters';

export interface PosWeightModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductDto | null;
  initialWeight?: number;
  onConfirm: (product: ProductDto, weight: number) => void;
}

export function PosWeightModal({
  isOpen,
  onClose,
  product,
  initialWeight = 0,
  onConfirm,
}: PosWeightModalProps) {
  // Input string untuk menampung digit numpad (misal: "1.250")
  const [weightStr, setWeightStr] = useState<string>('');

  // Sinkronisasi berat awal saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      if (initialWeight > 0) {
        setWeightStr(initialWeight.toFixed(3));
      } else {
        setWeightStr('');
      }
    }
  }, [initialWeight, isOpen]);

  const currentWeight = parseFloat(weightStr) || 0;
  const pricePerKg = Number(product?.pricePerKg ?? 0);
  const availableStock = Number(product?.stockQty ?? 0);
  const calculatedTotal = Math.round(currentWeight * pricePerKg);
  const isOverStock = availableStock > 0 && currentWeight > availableStock;
  const isConfirmDisabled = currentWeight <= 0;

  // Numpad key handlers
  const handleDigit = useCallback((digit: string) => {
    setWeightStr((prev) => {
      // Jika ada desimal, batasi hingga maksimal 3 digit desimal
      const parts = prev.split('.');
      if (parts[1] && parts[1].length >= 3) {
        return prev;
      }

      // Mencegah multiple zero di awal (misal "00")
      if (prev === '0' && digit === '0') return prev;
      if (prev === '0' && digit !== '0') return digit;

      return prev + digit;
    });
  }, []);

  const handleDecimal = useCallback(() => {
    setWeightStr((prev) => {
      if (!prev) return '0.';
      if (prev.includes('.')) return prev;
      return prev + '.';
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setWeightStr((prev) => {
      if (prev.length <= 1) return '';
      return prev.slice(0, -1);
    });
  }, []);

  const handleClear = useCallback(() => {
    setWeightStr('');
  }, []);

  const handleAddPreset = useCallback((preset: number) => {
    setWeightStr((prev) => {
      const val = (parseFloat(prev) || 0) + preset;
      return Math.max(0, val).toFixed(3);
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (!product || isConfirmDisabled) return;
    // Bulatkan ke 3 desimal
    const finalWeight = Math.round(currentWeight * 1000) / 1000;
    onConfirm(product, finalWeight);
    onClose();
  }, [currentWeight, isConfirmDisabled, onClose, onConfirm, product]);

  // Listener keyboard fisik
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        handleDecimal();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Delete' || e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (!isConfirmDisabled) {
          handleConfirm();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleBackspace,
    handleClear,
    handleConfirm,
    handleDecimal,
    handleDigit,
    isConfirmDisabled,
    isOpen,
  ]);

  if (!product) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Input Berat Produk"
      description="Masukkan berat aktual buah dalam kilogram (akurasi 3 desimal / gram)."
      size="default"
    >
      <div className="flex flex-col gap-4">
        {/* Info Produk & Harga per kg */}
        <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-canvas p-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-ink-primary sm:text-base">
              {product.name}
            </h3>
            <p className="text-xs text-ink-secondary">
              Tersedia:{' '}
              <span className="font-semibold text-ink-primary">{availableStock.toFixed(3)} kg</span>
            </p>
          </div>
          <div className="text-right">
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800">
              {formatRupiah(pricePerKg)} / kg
            </span>
          </div>
        </div>

        {/* Warning Melebihi Stok */}
        {isOverStock ? (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs font-medium text-amber-900"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <span>Perhatian: Berat melebihi stok tercatat ({availableStock.toFixed(3)} kg).</span>
          </div>
        ) : null}

        {/* Tampilan Berat Display Utama (3 Desimal) */}
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-primary-500/40 bg-surface-panel p-4 shadow-inner">
          <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            Berat Timbang (kg)
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              data-testid="weight-display-value"
              className="font-mono text-4xl font-extrabold tracking-tight text-primary-700 sm:text-5xl"
            >
              {weightStr ? currentWeight.toFixed(3) : '0.000'}
            </span>
            <span className="text-lg font-bold text-ink-secondary">kg</span>
          </div>
          <span className="mt-1 text-xs text-ink-muted">
            = {Math.round(currentWeight * 1000)} gram
          </span>
        </div>

        {/* Kalkulasi Total Real-time */}
        <div className="flex items-center justify-between rounded-xl bg-surface-canvas px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <Calculator className="h-4 w-4 text-primary-600" aria-hidden="true" />
            <span>Total Harga:</span>
          </div>
          <div className="font-mono text-base font-extrabold text-ink-primary sm:text-lg">
            {formatRupiah(calculatedTotal)}
          </div>
        </div>

        {/* Preset Cepat (+0.1, +0.25, +0.5, +1.0 kg) */}
        <div className="flex gap-1.5">
          {[0.1, 0.25, 0.5, 1.0].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleAddPreset(preset)}
              className="flex-1 rounded-lg border border-border-strong bg-surface-canvas py-1.5 text-xs font-bold text-ink-secondary hover:bg-surface-muted active:scale-95 transition-all"
            >
              +{preset} kg
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            aria-label="Bersihkan input berat"
            className="flex items-center justify-center rounded-lg border border-border-strong bg-surface-canvas px-2.5 py-1.5 text-xs font-bold text-semantic-danger-ink hover:bg-rose-50 active:scale-95 transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="ml-1">C</span>
          </button>
        </div>

        {/* Grid Numpad Layar Sentuh (3x4) */}
        <div className="grid grid-cols-3 gap-2">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => handleDigit(num)}
              className="flex h-12 items-center justify-center rounded-xl border border-border-strong bg-surface-panel font-mono text-lg font-bold text-ink-primary shadow-xs hover:bg-surface-muted active:scale-95 transition-all"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            onClick={handleDecimal}
            aria-label="Titik desimal"
            className="flex h-12 items-center justify-center rounded-xl border border-border-strong bg-surface-panel font-mono text-lg font-bold text-ink-primary shadow-xs hover:bg-surface-muted active:scale-95 transition-all"
          >
            .
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="flex h-12 items-center justify-center rounded-xl border border-border-strong bg-surface-panel font-mono text-lg font-bold text-ink-primary shadow-xs hover:bg-surface-muted active:scale-95 transition-all"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            aria-label="Hapus satu angka"
            className="flex h-12 items-center justify-center rounded-xl border border-border-strong bg-surface-canvas text-ink-primary shadow-xs hover:bg-surface-muted active:scale-95 transition-all"
          >
            <Delete className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tombol Aksi: Batal & Tambah ke Keranjang */}
        <div className="flex gap-2 pt-2 border-t border-border-subtle">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1 text-xs">
            Batal
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={isConfirmDisabled}
            onClick={handleConfirm}
            className="flex-2 gap-1.5 text-xs font-bold"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>Tambah ke Keranjang</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}
