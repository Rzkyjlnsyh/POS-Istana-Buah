import type { CategoryDto, ProductDto } from '@istana-buah/shared';
import { AlertCircle, CheckCircle2, ShoppingCart } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { getCategories } from '../../categories/api/category-api';
import { getProductByBarcode, getProducts } from '../../products/api/product-api';
import { PosCameraScannerModal } from '../components/pos-camera-scanner-modal';
import { PosCartSection } from '../components/pos-cart-section';
import { PosProductSection } from '../components/pos-product-section';
import { PosStatusBar } from '../components/pos-status-bar';
import { PosWeightModal } from '../components/pos-weight-modal';
import { useUsbBarcodeScanner } from '../hooks/use-usb-barcode-scanner';
import { type PosCartItem, usePosCartStore } from '../stores/pos-cart-store';
import { formatRupiah } from '../utils/formatters';
import { scannerSound } from '../utils/scanner-sound';

export function PosPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [weightModal, setWeightModal] = useState<{
    isOpen: boolean;
    product: ProductDto | null;
    initialWeight?: number;
    editingItemId?: string;
  }>({
    isOpen: false,
    product: null,
    initialWeight: 0,
  });
  const [scanNotification, setScanNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const addItem = usePosCartStore((state) => state.addItem);
  const updateQuantity = usePosCartStore((state) => state.updateQuantity);
  const clearCart = usePosCartStore((state) => state.clearCart);
  const items = usePosCartStore((state) => state.items);
  const getTotalAmount = usePosCartStore((state) => state.getTotalAmount);

  const totalAmount = getTotalAmount();

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setScanNotification({ type, message });
    setTimeout(() => {
      setScanNotification((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  }, []);

  // 1. Muat Kategori Aktif
  const loadCategories = useCallback(async () => {
    try {
      const data = await getCategories({ isActive: true, limit: 50 });
      setCategories(data);
    } catch {
      // Abaikan error jaringan sementara
    }
  }, []);

  // 2. Muat Produk Aktif
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getProducts({
        categoryId: selectedCategoryId ?? undefined,
        search: searchQuery.trim() || undefined,
        isActive: true,
        limit: 100,
      });
      setProducts(res.items);
    } catch {
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedCategoryId]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (!searchQuery) {
      void loadProducts();
      return;
    }
    const timer = setTimeout(() => {
      void loadProducts();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadProducts, searchQuery]);

  // Handlers
  const handleSelectProduct = (product: ProductDto) => {
    if (product.productType === 'WEIGHT') {
      setWeightModal({
        isOpen: true,
        product,
        initialWeight: 0,
      });
      return;
    }
    addItem(product);
  };

  const handleEditItemWeight = (item: PosCartItem) => {
    const foundProduct = products.find((p) => p.id === item.productId);
    const productData: ProductDto = foundProduct ?? {
      id: item.productId,
      name: item.name,
      description: null,
      categoryId: '',
      category: { id: '', name: 'Umum' },
      productType: item.productType,
      pricePerKg: item.productType === 'WEIGHT' ? String(item.unitPrice) : null,
      pricePerUnit: item.productType === 'UNIT' ? String(item.unitPrice) : null,
      costPerKg: null,
      costPerUnit: null,
      stockQty: String(item.availableStock),
      minStockAlert: '0',
      imageUrl: null,
      isActive: true,
      barcodes: item.barcode ? [{ id: 'b1', barcode: item.barcode, isPrimary: true }] : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setWeightModal({
      isOpen: true,
      product: productData,
      initialWeight: item.quantity,
      editingItemId: item.id,
    });
  };

  const handleConfirmWeight = (product: ProductDto, weight: number) => {
    if (weightModal.editingItemId) {
      updateQuantity(weightModal.editingItemId, weight);
      showNotification('success', `Berat ${product.name} diperbarui menjadi ${weight} kg.`);
    } else {
      addItem(product, weight);
      showNotification('success', `${product.name} (${weight} kg) ditambahkan ke keranjang.`);
    }
    setWeightModal({ isOpen: false, product: null });
  };

  const handleBarcodeScan = useCallback(
    async (barcode: string) => {
      const cleanCode = barcode.trim();
      if (!cleanCode) return;

      // Cari di memori lokal terlebih dahulu
      let matchedProduct = products.find((p) => p.barcodes?.some((b) => b.barcode === cleanCode));

      // Jika tidak ditemukan di memori lokal, lookup via endpoint API
      if (!matchedProduct) {
        try {
          matchedProduct = await getProductByBarcode(cleanCode);
        } catch {
          matchedProduct = undefined;
        }
      }

      if (!matchedProduct) {
        scannerSound.playErrorBeep();
        showNotification('error', `Barcode "${cleanCode}" tidak terdaftar.`);
        return;
      }

      if (Number(matchedProduct.stockQty) <= 0) {
        scannerSound.playErrorBeep();
        showNotification('error', `Stok ${matchedProduct.name} habis.`);
        return;
      }

      if (matchedProduct.productType === 'WEIGHT') {
        setWeightModal({
          isOpen: true,
          product: matchedProduct,
          initialWeight: 0,
        });
        scannerSound.playSuccessBeep();
        return;
      }

      addItem(matchedProduct);
      scannerSound.playSuccessBeep();
      showNotification('success', `${matchedProduct.name} ditambahkan ke keranjang.`);
    },
    [addItem, products, showNotification],
  );

  // Pasang listener Scanner Hardware USB HID
  useUsbBarcodeScanner({
    onScan: handleBarcodeScan,
    enabled: true,
  });

  const handlePayCash = useCallback(() => {
    // Akan diintegrasikan dengan Payment Modal (M03-006)
  }, []);

  const handlePayQris = useCallback(() => {
    // Akan diintegrasikan dengan Payment Modal (M03-006)
  }, []);

  const handlePayTransfer = useCallback(() => {
    // Akan diintegrasikan dengan Payment Modal (M03-006)
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;

      if (e.key === 'F1') {
        e.preventDefault();
        handlePayCash();
      } else if (e.key === 'F2') {
        e.preventDefault();
        handlePayQris();
      } else if (e.key === 'F3') {
        e.preventDefault();
        handlePayTransfer();
      } else if (e.key === 'F4') {
        e.preventDefault();
        const searchInput = document.getElementById('pos-product-search-input');
        if (searchInput) {
          searchInput.focus();
        }
      } else if (e.key === 'Escape' && !isInput) {
        e.preventDefault();
        clearCart();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearCart, handlePayCash, handlePayQris, handlePayTransfer]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <h1 className="sr-only">Layar Kasir (POS)</h1>

      {/* Notifikasi Pemindaian Barcode */}
      {scanNotification ? (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center justify-between border-b px-4 py-2 text-xs font-semibold ${
            scanNotification.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {scanNotification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" aria-hidden="true" />
            )}
            <span>{scanNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setScanNotification(null)}
            className="text-xs hover:underline"
          >
            Tutup
          </button>
        </div>
      ) : null}

      {/* Mobile Tab Switcher (<lg) */}
      <div className="flex border-b border-border-subtle bg-surface-panel lg:hidden">
        <button
          type="button"
          onClick={() => setMobileTab('products')}
          className={`flex-1 py-2.5 text-center text-xs font-bold border-b-2 transition-colors ${
            mobileTab === 'products'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-ink-secondary hover:text-ink-primary'
          }`}
        >
          Katalog Produk
        </button>
        <button
          type="button"
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-2.5 text-center text-xs font-bold border-b-2 transition-colors ${
            mobileTab === 'cart'
              ? 'border-primary-600 text-primary-700'
              : 'border-transparent text-ink-secondary hover:text-ink-primary'
          }`}
        >
          Keranjang ({items.length})
        </button>
      </div>

      {/* Main 2-Panel Layout */}
      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Panel Kiri: Produk (60% pada desktop) */}
        <div
          className={`flex flex-col overflow-hidden border-b border-border-subtle lg:w-[60%] lg:border-b-0 lg:border-r ${
            mobileTab === 'products' ? 'flex flex-1' : 'hidden lg:flex'
          }`}
        >
          <PosProductSection
            products={products}
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={setSelectedCategoryId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectProduct={handleSelectProduct}
            onOpenScannerModal={() => setIsCameraModalOpen(true)}
            onBarcodeSubmit={handleBarcodeScan}
            isLoading={isLoading}
          />
        </div>

        {/* Panel Kanan: Keranjang (40% pada desktop) */}
        <div
          className={`flex flex-col overflow-hidden lg:w-[40%] ${
            mobileTab === 'cart' ? 'flex flex-1' : 'hidden lg:flex'
          }`}
        >
          <PosCartSection
            onPayCash={handlePayCash}
            onPayQris={handlePayQris}
            onPayTransfer={handlePayTransfer}
            onEditItemWeight={handleEditItemWeight}
          />
        </div>
      </div>

      {/* Mobile Floating Cart Summary Button (<lg, when in product tab and cart not empty) */}
      {mobileTab === 'products' && items.length > 0 ? (
        <div className="border-t border-border-subtle bg-primary-900 p-3 text-white shadow-lg lg:hidden">
          <button
            type="button"
            onClick={() => setMobileTab('cart')}
            className="flex w-full items-center justify-between rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold shadow-md active:bg-primary-700"
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              <span>{items.length} Item</span>
            </div>
            <span>{formatRupiah(totalAmount)} · Lihat Keranjang →</span>
          </button>
        </div>
      ) : null}

      {/* Modal Kamera Scanner Barcode (M03-004) */}
      <PosCameraScannerModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onScan={handleBarcodeScan}
      />

      {/* Modal Input Berat Produk & Numpad (M03-005) */}
      <PosWeightModal
        isOpen={weightModal.isOpen}
        onClose={() => setWeightModal({ isOpen: false, product: null })}
        product={weightModal.product}
        initialWeight={weightModal.initialWeight}
        onConfirm={handleConfirmWeight}
      />

      {/* Bottom Status Bar */}
      <PosStatusBar />
    </div>
  );
}
