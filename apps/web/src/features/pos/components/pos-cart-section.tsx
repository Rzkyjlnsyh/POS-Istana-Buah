import {
  Banknote,
  Minus,
  PauseCircle,
  PlayCircle,
  Plus,
  QrCode,
  RotateCcw,
  Send,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import React, { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { usePosCartStore, type PosCartItem } from '../stores/pos-cart-store';
import { formatQuantity, formatRupiah } from '../utils/formatters';

export interface PosCartSectionProps {
  onPayCash: () => void;
  onPayQris: () => void;
  onPayTransfer: () => void;
  onHoldCart?: () => void;
  onRecallCart?: (heldId: string) => void;
}

export function PosCartSection({
  onPayCash,
  onPayQris,
  onPayTransfer,
  onHoldCart,
  onRecallCart,
}: PosCartSectionProps) {
  const items = usePosCartStore((state) => state.items);
  const globalDiscount = usePosCartStore((state) => state.globalDiscount);
  const heldCarts = usePosCartStore((state) => state.heldCarts);
  const updateQuantity = usePosCartStore((state) => state.updateQuantity);
  const removeItem = usePosCartStore((state) => state.removeItem);
  const clearCart = usePosCartStore((state) => state.clearCart);
  const setGlobalDiscount = usePosCartStore((state) => state.setGlobalDiscount);
  const holdCart = usePosCartStore((state) => state.holdCart);
  const recallHeldCart = usePosCartStore((state) => state.recallHeldCart);

  const getSubtotal = usePosCartStore((state) => state.getSubtotal);
  const getTotalAmount = usePosCartStore((state) => state.getTotalAmount);

  const subtotal = getSubtotal();
  const totalAmount = getTotalAmount();
  const isCartEmpty = items.length === 0;

  const [showDiscountInput, setShowDiscountInput] = useState(false);
  const [showHeldModal, setShowHeldModal] = useState(false);

  const handleStepQuantity = (item: PosCartItem, delta: number) => {
    const step = item.productType === 'WEIGHT' ? 0.5 : 1;
    const newQty = Math.max(0, Number((item.quantity + delta * step).toFixed(3)));
    if (newQty <= 0) {
      removeItem(item.id);
    } else {
      updateQuantity(item.id, newQty);
    }
  };

  const handleHold = () => {
    if (isCartEmpty) return;
    if (onHoldCart) {
      onHoldCart();
    } else {
      holdCart();
    }
  };

  return (
    <section
      aria-label="Keranjang belanja kasir"
      className="flex flex-1 flex-col overflow-hidden bg-surface-panel"
    >
      {/* 1. Header Keranjang */}
      <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-primary-600" aria-hidden="true" />
          <h2 className="text-sm font-bold text-ink-primary">Keranjang Belanja</h2>
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-800">
            {items.length} item
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {heldCarts.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowHeldModal(true)}
              aria-label={`Buka daftar ${heldCarts.length} transaksi tertahan`}
              className="inline-flex items-center gap-1 rounded-lg border border-semantic-warning-border bg-semantic-warning-bg px-2.5 py-1.5 text-xs font-semibold text-semantic-warning-ink hover:bg-amber-100"
            >
              <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Pulihkan ({heldCarts.length})</span>
            </button>
          ) : null}

          <button
            type="button"
            disabled={isCartEmpty}
            onClick={handleHold}
            aria-label="Tahan transaksi saat ini"
            className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-canvas px-2.5 py-1.5 text-xs font-semibold text-ink-secondary hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Tahan</span>
          </button>

          <button
            type="button"
            disabled={isCartEmpty}
            onClick={() => clearCart()}
            aria-label="Kosongkan keranjang belanja"
            className="inline-flex items-center gap-1 rounded-lg border border-border-subtle bg-surface-canvas px-2.5 py-1.5 text-xs font-semibold text-semantic-danger-ink hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Batal</span>
          </button>
        </div>
      </div>

      {/* 2. Daftar Item Keranjang (Scrollable) */}
      <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
        {isCartEmpty ? (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center p-6 text-center text-ink-muted">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-ink-muted mb-3">
              <ShoppingCart className="h-7 w-7 stroke-1" aria-hidden="true" />
            </div>
            <p className="text-sm font-semibold text-ink-primary">Keranjang belanja kosong</p>
            <p className="mt-1 max-w-[240px] text-xs text-ink-secondary">
              Pilih produk di katalog sebelah kiri atau scan barcode untuk menambahkan item.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 p-3 transition-colors hover:bg-surface-canvas/50 sm:p-4"
              >
                {/* Baris Atas: Nama Produk & Tombol Hapus */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-ink-primary sm:text-sm">
                      {item.name}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatRupiah(item.unitPrice)} /{item.productType === 'WEIGHT' ? 'kg' : 'pcs'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Hapus ${item.name} dari keranjang`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-rose-50 hover:text-semantic-danger-ink"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Baris Bawah: Stepper Kuantitas & Total Item */}
                <div className="flex items-center justify-between gap-3 pt-1">
                  {/* Stepper Quantity */}
                  <div className="flex items-center gap-1 rounded-xl border border-border-strong bg-surface-canvas p-1">
                    <button
                      type="button"
                      onClick={() => handleStepQuantity(item, -1)}
                      aria-label={`Kurangi kuantitas ${item.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-panel text-ink-primary shadow-xs hover:bg-surface-muted active:scale-95"
                    >
                      <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>

                    <span className="min-w-[68px] text-center font-mono text-xs font-bold text-ink-primary">
                      {formatQuantity(item.quantity, item.productType)}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleStepQuantity(item, 1)}
                      aria-label={`Tambah kuantitas ${item.name}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-panel text-ink-primary shadow-xs hover:bg-surface-muted active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    {item.discountAmount > 0 ? (
                      <p className="text-xs text-semantic-danger-ink line-through">
                        {formatRupiah(item.quantity * item.unitPrice)}
                      </p>
                    ) : null}
                    <p className="font-mono text-xs font-bold text-ink-primary sm:text-sm">
                      {formatRupiah(item.lineTotal)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 3. Ringkasan Pembayaran & Total */}
      <div className="border-t border-border-subtle bg-surface-canvas p-4">
        <div className="space-y-1.5 text-xs text-ink-secondary">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="font-mono font-semibold text-ink-primary">
              {formatRupiah(subtotal)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowDiscountInput(!showDiscountInput)}
              className="text-primary-700 underline underline-offset-2 hover:text-primary-800"
            >
              {globalDiscount > 0 ? 'Ubah Diskon' : '+ Tambah Diskon'}
            </button>
            <span className="font-mono font-semibold text-semantic-danger-ink">
              {globalDiscount > 0 ? `-${formatRupiah(globalDiscount)}` : 'Rp 0'}
            </span>
          </div>

          {showDiscountInput ? (
            <div className="flex items-center gap-2 pt-1 pb-1">
              <label htmlFor="pos-global-discount" className="sr-only">
                Nominal Diskon Transaksi
              </label>
              <input
                id="pos-global-discount"
                type="number"
                min="0"
                step="500"
                value={globalDiscount || ''}
                onChange={(e) => setGlobalDiscount(Number(e.target.value) || 0)}
                placeholder="Nominal diskon (Rp)..."
                className="w-full rounded-lg border border-border-strong bg-surface-panel px-2.5 py-1.5 text-xs font-medium text-ink-primary focus:border-primary-600 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowDiscountInput(false)}
                className="rounded-lg border border-border-strong bg-surface-panel px-2.5 py-1.5 text-xs font-semibold text-ink-primary hover:bg-surface-muted"
              >
                Selesai
              </button>
            </div>
          ) : null}

          <div className="flex justify-between">
            <span>Pajak (0%)</span>
            <span className="font-mono text-ink-muted">Rp 0</span>
          </div>
        </div>

        {/* Total Belanja Utama */}
        <div className="mt-3 flex items-baseline justify-between rounded-xl bg-primary-900 px-4 py-3 text-white shadow-sm">
          <div>
            <p className="text-xs font-medium tracking-wide uppercase text-primary-200">
              Total Pembayaran
            </p>
            <p className="font-mono text-xl font-black tracking-tight sm:text-2xl text-white">
              {formatRupiah(totalAmount)}
            </p>
          </div>
          <span className="text-xs font-semibold text-primary-200">{items.length} Item</span>
        </div>

        {/* 4. Tombol Aksi Pembayaran Cepat */}
        <div className="mt-3 space-y-2">
          {/* Tombol Utama: Bayar Tunai (F1) */}
          <Button
            type="button"
            size="lg"
            disabled={isCartEmpty}
            onClick={onPayCash}
            className="w-full justify-between bg-primary-600 text-white hover:bg-primary-700 text-sm font-bold shadow-md"
          >
            <div className="flex items-center gap-2">
              <Banknote className="h-5 w-5" aria-hidden="true" />
              <span>Bayar Tunai</span>
            </div>
            <kbd className="rounded border border-primary-400 bg-primary-700/80 px-2 py-0.5 text-xs font-bold text-white">
              F1
            </kbd>
          </Button>

          {/* Tombol Sekunder: QRIS & Transfer Bank */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isCartEmpty}
              onClick={onPayQris}
              className="justify-between text-xs font-bold"
            >
              <div className="flex items-center gap-1.5">
                <QrCode className="h-4 w-4 text-ink-primary" aria-hidden="true" />
                <span>QRIS</span>
              </div>
              <kbd className="rounded border border-border-strong bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-ink-muted">
                F2
              </kbd>
            </Button>

            <Button
              type="button"
              variant="secondary"
              disabled={isCartEmpty}
              onClick={onPayTransfer}
              className="justify-between text-xs font-bold"
            >
              <div className="flex items-center gap-1.5">
                <Send className="h-4 w-4 text-ink-primary" aria-hidden="true" />
                <span>Transfer</span>
              </div>
              <kbd className="rounded border border-border-strong bg-surface-muted px-1.5 py-0.5 text-xs font-semibold text-ink-muted">
                F3
              </kbd>
            </Button>
          </div>
        </div>
      </div>

      {/* Modal Pulihkan Transaksi Tertahan */}
      {showHeldModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Daftar transaksi tertahan"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-surface-panel p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <h3 className="text-base font-bold text-ink-primary">Transaksi Tertahan</h3>
              <button
                type="button"
                onClick={() => setShowHeldModal(false)}
                className="rounded-lg p-1 text-ink-muted hover:bg-surface-muted"
                aria-label="Tutup modal"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 max-h-60 overflow-y-auto space-y-2">
              {heldCarts.map((h, idx) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-xl border border-border-subtle p-3 hover:bg-surface-canvas"
                >
                  <div>
                    <p className="text-xs font-bold text-ink-primary">
                      Antrean #{idx + 1} ({h.items.length} item)
                    </p>
                    <p className="text-xs text-ink-muted">
                      {new Date(h.heldAt).toLocaleTimeString('id-ID')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (onRecallCart) {
                        onRecallCart(h.id);
                      } else {
                        recallHeldCart(h.id);
                      }
                      setShowHeldModal(false);
                    }}
                    className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
                  >
                    Buka
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
