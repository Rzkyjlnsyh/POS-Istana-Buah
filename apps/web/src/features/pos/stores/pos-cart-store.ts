import type { ProductDto, ProductType } from '@istana-buah/shared';
import { create } from 'zustand';

export interface PosCartItem {
  id: string;
  productId: string;
  name: string;
  productType: ProductType;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  lineTotal: number;
  barcode?: string;
  availableStock: number;
  notes?: string;
}

export interface HeldCart {
  id: string;
  heldAt: string;
  items: PosCartItem[];
  notes?: string;
}

export interface PosCartState {
  items: PosCartItem[];
  globalDiscount: number;
  heldCarts: HeldCart[];
  selectedItemId: string | null;

  // Actions
  addItem: (product: ProductDto, initialQuantity?: number) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateItemDiscount: (itemId: string, discountAmount: number) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
  setGlobalDiscount: (amount: number) => void;
  setSelectedItemId: (itemId: string | null) => void;

  holdCart: (notes?: string) => void;
  recallHeldCart: (heldCartId: string) => void;
  removeHeldCart: (heldCartId: string) => void;

  // Computed getters
  getSubtotal: () => number;
  getTotalDiscount: () => number;
  getTotalAmount: () => number;
  getItemCount: () => number;
}

function calculateLineTotal(quantity: number, unitPrice: number, discountAmount: number): number {
  return Math.max(0, quantity * unitPrice - discountAmount);
}

export function getProductPrice(product: ProductDto): number {
  if (product.productType === 'WEIGHT') {
    return Number(product.pricePerKg ?? 0);
  }
  return Number(product.pricePerUnit ?? 0);
}

export const usePosCartStore = create<PosCartState>((set, get) => ({
  items: [],
  globalDiscount: 0,
  heldCarts: [],
  selectedItemId: null,

  addItem: (product: ProductDto, initialQuantity?: number) => {
    const unitPrice = getProductPrice(product);
    const availableStock = Number(product.stockQty ?? 0);
    const existingIndex = get().items.findIndex((it) => it.productId === product.id);

    if (existingIndex >= 0) {
      const existing = get().items[existingIndex]!;
      const addQty = initialQuantity !== undefined ? initialQuantity : 1;
      const newQty = existing.quantity + addQty;
      const newLineTotal = calculateLineTotal(newQty, existing.unitPrice, existing.discountAmount);

      const nextItems = [...get().items];
      nextItems[existingIndex] = {
        ...existing,
        quantity: newQty,
        lineTotal: newLineTotal,
      };

      set({ items: nextItems, selectedItemId: existing.id });
      return;
    }

    const defaultQty = initialQuantity !== undefined ? initialQuantity : 1;
    const primaryBarcode = product.barcodes?.find((b) => b.isPrimary)?.barcode;
    const newItem: PosCartItem = {
      id: `cart-${product.id}-${Date.now()}`,
      productId: product.id,
      name: product.name,
      productType: product.productType,
      unitPrice,
      quantity: defaultQty,
      discountAmount: 0,
      lineTotal: calculateLineTotal(defaultQty, unitPrice, 0),
      barcode: primaryBarcode,
      availableStock,
    };

    set({
      items: [...get().items, newItem],
      selectedItemId: newItem.id,
    });
  },

  updateQuantity: (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(itemId);
      return;
    }

    set({
      items: get().items.map((it) => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          quantity,
          lineTotal: calculateLineTotal(quantity, it.unitPrice, it.discountAmount),
        };
      }),
    });
  },

  updateItemDiscount: (itemId: string, discountAmount: number) => {
    const validDiscount = Math.max(0, discountAmount);
    set({
      items: get().items.map((it) => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          discountAmount: validDiscount,
          lineTotal: calculateLineTotal(it.quantity, it.unitPrice, validDiscount),
        };
      }),
    });
  },

  removeItem: (itemId: string) => {
    set({
      items: get().items.filter((it) => it.id !== itemId),
      selectedItemId: get().selectedItemId === itemId ? null : get().selectedItemId,
    });
  },

  clearCart: () => {
    set({
      items: [],
      globalDiscount: 0,
      selectedItemId: null,
    });
  },

  setGlobalDiscount: (amount: number) => {
    set({ globalDiscount: Math.max(0, amount) });
  },

  setSelectedItemId: (itemId: string | null) => {
    set({ selectedItemId: itemId });
  },

  holdCart: (notes?: string) => {
    const currentItems = get().items;
    if (currentItems.length === 0) return;

    const newHeld: HeldCart = {
      id: `held-${Date.now()}`,
      heldAt: new Date().toISOString(),
      items: [...currentItems],
      notes,
    };

    set({
      heldCarts: [...get().heldCarts, newHeld],
      items: [],
      globalDiscount: 0,
      selectedItemId: null,
    });
  },

  recallHeldCart: (heldCartId: string) => {
    const held = get().heldCarts.find((h) => h.id === heldCartId);
    if (!held) return;

    set({
      items: [...held.items],
      heldCarts: get().heldCarts.filter((h) => h.id !== heldCartId),
      selectedItemId: held.items[0]?.id ?? null,
    });
  },

  removeHeldCart: (heldCartId: string) => {
    set({
      heldCarts: get().heldCarts.filter((h) => h.id !== heldCartId),
    });
  },

  getSubtotal: () => {
    return get().items.reduce((sum, it) => sum + it.lineTotal, 0);
  },

  getTotalDiscount: () => {
    const itemsDiscount = get().items.reduce((sum, it) => sum + it.discountAmount, 0);
    return itemsDiscount + get().globalDiscount;
  },

  getTotalAmount: () => {
    const subtotal = get().getSubtotal();
    return Math.max(0, subtotal - get().globalDiscount);
  },

  getItemCount: () => {
    return get().items.length;
  },
}));
