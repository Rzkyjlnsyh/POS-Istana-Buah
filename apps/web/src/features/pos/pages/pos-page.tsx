import type { CategoryDto, ProductDto } from '@istana-buah/shared';
import { ShoppingCart } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { getCategories } from '../../categories/api/category-api';
import { getProducts } from '../../products/api/product-api';
import { PosCartSection } from '../components/pos-cart-section';
import { PosProductSection } from '../components/pos-product-section';
import { PosStatusBar } from '../components/pos-status-bar';
import { usePosCartStore } from '../stores/pos-cart-store';
import { formatRupiah } from '../utils/formatters';

export function PosPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'products' | 'cart'>('products');
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const addItem = usePosCartStore((state) => state.addItem);
  const clearCart = usePosCartStore((state) => state.clearCart);
  const items = usePosCartStore((state) => state.items);
  const getTotalAmount = usePosCartStore((state) => state.getTotalAmount);

  const totalAmount = getTotalAmount();

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
    addItem(product);
  };

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

      {/* Bottom Status Bar */}
      <PosStatusBar />
    </div>
  );
}
