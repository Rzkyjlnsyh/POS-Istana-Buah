import type { ProductDto } from '@istana-buah/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { getProductPrice, usePosCartStore } from './pos-cart-store';

const weightProduct: ProductDto = {
  id: 'prod-w',
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Buah Lokal' },
  name: 'Mangga Arumanis',
  description: null,
  productType: 'WEIGHT',
  pricePerKg: '25000.00',
  pricePerUnit: null,
  costPerKg: null,
  costPerUnit: null,
  stockQty: '15.000',
  minStockAlert: '2.000',
  imageUrl: null,
  isActive: true,
  barcodes: [{ id: 'bc-1', barcode: '899100000001', isPrimary: true }],
  createdAt: '2026-11-17T00:00:00.000Z',
  updatedAt: '2026-11-17T00:00:00.000Z',
};

const unitProduct: ProductDto = {
  id: 'prod-u',
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Buah Lokal' },
  name: 'Nanas Madu',
  description: null,
  productType: 'UNIT',
  pricePerKg: null,
  pricePerUnit: '15000.00',
  costPerKg: null,
  costPerUnit: null,
  stockQty: '20.000',
  minStockAlert: '5.000',
  imageUrl: null,
  isActive: true,
  barcodes: [{ id: 'bc-2', barcode: '899100000002', isPrimary: true }],
  createdAt: '2026-11-17T00:00:00.000Z',
  updatedAt: '2026-11-17T00:00:00.000Z',
};

describe('usePosCartStore (M03-005 / M03-009)', () => {
  beforeEach(() => {
    usePosCartStore.setState({
      items: [],
      globalDiscount: 0,
      heldCarts: [],
      selectedItemId: null,
    });
  });

  it('mengekstrak harga produk sesuai tipe WEIGHT vs UNIT', () => {
    expect(getProductPrice(weightProduct)).toBe(25000);
    expect(getProductPrice(unitProduct)).toBe(15000);
    expect(getProductPrice({ ...weightProduct, pricePerKg: null })).toBe(0);
  });

  it('menambah item, menggabungkan duplikasi produk, menghitung diskon & subtotal/total', () => {
    const store = usePosCartStore.getState();
    store.addItem(weightProduct, 1.5);
    store.addItem(unitProduct);
    store.addItem(unitProduct);

    const state = usePosCartStore.getState();
    expect(state.getItemCount()).toBe(2);
    expect(state.getSubtotal()).toBe(67500);

    const weightItemId = state.items[0]!.id;
    state.updateItemDiscount(weightItemId, 2500);
    state.setGlobalDiscount(5000);
    state.setSelectedItemId(weightItemId);

    const afterDiscount = usePosCartStore.getState();
    expect(afterDiscount.selectedItemId).toBe(weightItemId);
    expect(afterDiscount.getSubtotal()).toBe(65000);
    expect(afterDiscount.getTotalDiscount()).toBe(7500);
    expect(afterDiscount.getTotalAmount()).toBe(60000);

    // Diskon & total tidak pernah bernilai negatif
    afterDiscount.updateItemDiscount(weightItemId, -500);
    afterDiscount.setGlobalDiscount(999999);
    expect(usePosCartStore.getState().getTotalAmount()).toBe(0);
  });

  it('memperbarui kuantitas dan menghapus item otomatis bila kuantitas <= 0', () => {
    usePosCartStore.getState().addItem(unitProduct, 2);
    const id = usePosCartStore.getState().items[0]!.id;

    usePosCartStore.getState().updateQuantity(id, 4);
    expect(usePosCartStore.getState().items[0]?.lineTotal).toBe(60000);

    usePosCartStore.getState().updateQuantity(id, 0);
    expect(usePosCartStore.getState().getItemCount()).toBe(0);
    expect(usePosCartStore.getState().selectedItemId).toBeNull();
  });

  it('menahan (hold), memulihkan (recall), dan menghapus antrean tertahan', () => {
    usePosCartStore.getState().holdCart();
    expect(usePosCartStore.getState().heldCarts).toHaveLength(0);

    usePosCartStore.getState().addItem(unitProduct, 3);
    usePosCartStore.getState().holdCart('Pelanggan ke ATM');
    expect(usePosCartStore.getState().items).toHaveLength(0);
    expect(usePosCartStore.getState().heldCarts).toHaveLength(1);

    const heldId = usePosCartStore.getState().heldCarts[0]!.id;
    usePosCartStore.getState().recallHeldCart('tidak-ada');
    expect(usePosCartStore.getState().items).toHaveLength(0);

    usePosCartStore.getState().recallHeldCart(heldId);
    expect(usePosCartStore.getState().items).toHaveLength(1);
    expect(usePosCartStore.getState().heldCarts).toHaveLength(0);

    usePosCartStore.getState().holdCart('Antre lagi');
    const secondHeldId = usePosCartStore.getState().heldCarts[0]!.id;
    usePosCartStore.getState().removeHeldCart(secondHeldId);
    expect(usePosCartStore.getState().heldCarts).toHaveLength(0);
  });
});
