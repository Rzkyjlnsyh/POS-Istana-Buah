import type { CategoryDto, ProductDto } from '@istana-buah/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetOfflineCryptoKey } from '../../../lib/db/offline-crypto';
import { upsertCachedCatalog } from '../../../lib/db/offline-catalog-service';
import { getOfflineTransactions } from '../../../lib/db/offline-transaction-service';
import { resetPosIndexedDb } from '../../../lib/db/pos-indexed-db';
import { useAuthStore } from '../../../stores/auth-store';
import * as transactionApi from '../api/transaction-api';
import { usePosCartStore } from '../stores/pos-cart-store';
import { PosPage } from './pos-page';

vi.mock('../api/transaction-api', () => ({
  createTransaction: vi.fn(),
  getTransactions: vi.fn(),
  getTransactionById: vi.fn(),
  voidTransaction: vi.fn(),
}));

const offlineCategory: CategoryDto = {
  id: 'cat-offline',
  name: 'Buah Offline',
  description: null,
  sortOrder: 1,
  isActive: true,
  productCount: 1,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const offlineProduct: ProductDto = {
  id: 'prod-mangga-offline',
  categoryId: 'cat-offline',
  category: { id: 'cat-offline', name: 'Buah Offline' },
  name: 'Mangga Offline',
  description: null,
  productType: 'UNIT',
  pricePerKg: null,
  pricePerUnit: '15000.00',
  costPerKg: null,
  costPerUnit: '10000.00',
  stockQty: '5.000',
  minStockAlert: '1.000',
  imageUrl: null,
  isActive: true,
  barcodes: [{ id: 'bc-off-1', barcode: '899999000001', isPrimary: true }],
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('PosPage Offline Checkout Integration (TC-OFFLINE-001)', () => {
  const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');

  beforeEach(async () => {
    vi.clearAllMocks();
    resetOfflineCryptoKey();
    await resetPosIndexedDb();
    usePosCartStore.getState().clearCart();
    useAuthStore.getState().setSession({
      accessToken: 'token-offline',
      refreshToken: 'refresh-offline',
      user: {
        id: 'cashier-offline-1',
        username: 'kasir_offline',
        fullName: 'Dewi Kasir',
        role: 'CASHIER',
      },
    });
    await upsertCachedCatalog([offlineProduct], [offlineCategory], { replaceCatalog: true });
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
  });

  afterEach(async () => {
    if (originalOnLineDescriptor) {
      Object.defineProperty(window.navigator, 'onLine', originalOnLineDescriptor);
    }
    usePosCartStore.getState().clearCart();
    useAuthStore.getState().clearSession();
    await resetPosIndexedDb();
  });

  it('memuat produk dari IndexedDB saat offline, memproses transaksi PENDING_SYNC, mengurangi stok lokal & lolos axe-core', async () => {
    const { container } = render(<PosPage />);

    expect(await screen.findByText('Mangga Offline')).toBeInTheDocument();
    expect(screen.getByText(/Stok:\s*5\s*pcs/i)).toBeInTheDocument();

    // Tambah produk ke keranjang dari data cache lokal
    fireEvent.click(screen.getByRole('button', { name: /Mangga Offline/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tunai/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Uang Pas:/i }));
    fireEvent.click(screen.getByRole('button', { name: /Konfirmasi Pembayaran/i }));

    await waitFor(async () => {
      const pending = await getOfflineTransactions(['PENDING_SYNC']);
      expect(pending).toHaveLength(1);
    });

    expect(transactionApi.createTransaction).not.toHaveBeenCalled();
    expect(await screen.findByText(/Transaksi Berhasil Disimpan/i)).toBeInTheDocument();
    expect(screen.getByText(/Antrean Sinkronisasi:/i)).toBeInTheDocument();
    expect(screen.getByText(/Stok:\s*4\s*pcs/i)).toBeInTheDocument();

    // Buka struk dari data transaksi offline lokal
    fireEvent.click(screen.getByRole('button', { name: /Cetak Struk/i }));
    expect(await screen.findByText(/Menunggu Sinkronisasi/i)).toBeInTheDocument();

    const a11yResults = await axe.run(container);
    expect(a11yResults.violations).toEqual([]);
  });
});
