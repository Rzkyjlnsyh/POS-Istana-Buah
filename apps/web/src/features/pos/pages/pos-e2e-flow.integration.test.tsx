import type {
  CategoryDto,
  CreateTransactionInput,
  ProductDto,
  TransactionDto,
} from '@istana-buah/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as printerService from '../../../lib/printer/thermal-printer-service';
import { AppRoutes } from '../../../routes/app-router';
import { useAuthStore } from '../../../stores/auth-store';
import * as categoryApi from '../../categories/api/category-api';
import * as productApi from '../../products/api/product-api';
import * as transactionApi from '../api/transaction-api';
import { usePosCartStore } from '../stores/pos-cart-store';

vi.mock('../../categories/api/category-api');
vi.mock('../../products/api/product-api');
vi.mock('../api/transaction-api');
vi.mock('../../../lib/printer/thermal-printer-service', async (importOriginal) => {
  const actual = await importOriginal<typeof printerService>();
  return { ...actual, executeThermalPrint: vi.fn() };
});

const categoriesFixture: CategoryDto[] = [
  {
    id: 'cat-1',
    name: 'Buah Lokal',
    description: 'Buah segar nusantara',
    sortOrder: 1,
    isActive: true,
    productCount: 2,
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
  },
];

const productsFixture: ProductDto[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Buah Lokal' },
    name: 'Mangga Harum Manis',
    description: null,
    productType: 'WEIGHT',
    pricePerKg: '25000.00',
    pricePerUnit: null,
    costPerKg: '18000.00',
    costPerUnit: null,
    stockQty: '20.000',
    minStockAlert: '3.000',
    imageUrl: null,
    isActive: true,
    barcodes: [{ id: 'bc-1', barcode: '8991001000011', isPrimary: true }],
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Buah Lokal' },
    name: 'Nanas Madu Pemalang',
    description: null,
    productType: 'UNIT',
    pricePerKg: null,
    pricePerUnit: '15000.00',
    costPerKg: null,
    costPerUnit: '10000.00',
    stockQty: '15.000',
    minStockAlert: '3.000',
    imageUrl: null,
    isActive: true,
    barcodes: [{ id: 'bc-2', barcode: '8991001000028', isPrimary: true }],
    createdAt: '2026-11-17T00:00:00.000Z',
    updatedAt: '2026-11-17T00:00:00.000Z',
  },
];

describe('M03-009 End-to-End Integration: Alur Lengkap Kasir POS hingga Riwayat & Void', () => {
  let ledger: TransactionDto[];

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    usePosCartStore.setState({ items: [], globalDiscount: 0, heldCarts: [], selectedItemId: null });
    ledger = [];

    useAuthStore.getState().setSession({
      accessToken: 'token-cashier',
      refreshToken: 'refresh-cashier',
      user: {
        id: 'u-cashier',
        username: 'kasir_e2e',
        fullName: 'Siti Kasir',
        role: 'CASHIER',
      },
    });

    vi.mocked(categoryApi.getCategories).mockResolvedValue([...categoriesFixture]);
    vi.mocked(productApi.getProducts).mockResolvedValue({
      items: [...productsFixture],
      meta: { page: 1, limit: 100, total: productsFixture.length },
    });

    // Backend ledger tiruan stateful agar sinkron antar halaman /pos <-> /pos/history
    vi.mocked(transactionApi.createTransaction).mockImplementation(
      async (input: CreateTransactionInput) => {
        const subtotal = input.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
        const total = Math.max(0, subtotal - (input.discountAmount ?? 0));
        const change = input.paymentMethod === 'CASH' ? Math.max(0, input.amountPaid - total) : 0;
        const seq = String(ledger.length + 1).padStart(4, '0');
        const created: TransactionDto = {
          id: `tx-e2e-${seq}`,
          transactionNo: `TRX-20261117-${seq}`,
          shiftId: null,
          cashierId: useAuthStore.getState().user?.id ?? 'u-cashier',
          cashierName: useAuthStore.getState().user?.fullName ?? 'Siti Kasir',
          status: 'COMPLETED',
          subtotal: String(subtotal),
          discountAmount: String(input.discountAmount ?? 0),
          taxAmount: '0',
          totalAmount: String(total),
          paymentMethod: input.paymentMethod,
          amountPaid: String(input.amountPaid),
          changeAmount: String(change),
          notes: input.notes ?? null,
          voidedBy: null,
          voidedAt: null,
          voidReason: null,
          clientId: input.clientId ?? null,
          syncedAt: null,
          transactedAt: '2026-11-17T06:30:00.000Z',
          createdAt: '2026-11-17T06:30:00.000Z',
          updatedAt: '2026-11-17T06:30:00.000Z',
          items: input.items.map((it, idx) => {
            const prod = productsFixture.find((p) => p.id === it.productId)!;
            return {
              id: `ti-${seq}-${idx}`,
              transactionId: `tx-e2e-${seq}`,
              productId: it.productId,
              productName: prod.name,
              productType: prod.productType,
              quantity: String(it.quantity),
              unitPrice: String(it.unitPrice),
              unitCost: null,
              discountAmount: String(it.discountAmount ?? 0),
              lineTotal: String(it.quantity * it.unitPrice),
              createdAt: '2026-11-17T06:30:00.000Z',
            };
          }),
        };
        ledger.unshift(created);
        return created;
      },
    );

    vi.mocked(transactionApi.getTransactions).mockImplementation(async (params) => {
      let filtered = [...ledger];
      if (params?.paymentMethod) {
        filtered = filtered.filter((tx) => tx.paymentMethod === params.paymentMethod);
      }
      if (params?.status) {
        filtered = filtered.filter((tx) => tx.status === params.status);
      }
      return {
        items: filtered,
        meta: { page: params?.page ?? 1, limit: params?.limit ?? 20, total: filtered.length },
      };
    });

    vi.mocked(transactionApi.getTransactionById).mockImplementation(async (id: string) => {
      const found = ledger.find((t) => t.id === id);
      if (!found) throw new Error('Not found');
      return found;
    });

    vi.mocked(transactionApi.voidTransaction).mockImplementation(
      async (id: string, reason: string) => {
        const idx = ledger.findIndex((t) => t.id === id);
        const updated: TransactionDto = {
          ...ledger[idx]!,
          status: 'VOIDED',
          voidReason: reason,
          voidedAt: '2026-11-17T07:00:00.000Z',
        };
        ledger[idx] = updated;
        return updated;
      },
    );

    vi.mocked(printerService.executeThermalPrint).mockResolvedValue({
      method: 'browser',
      bytesLength: 412,
    });
  });

  it('menjalankan alur lengkap: pilih WEIGHT + UNIT -> Hold/Recall -> Checkout Tunai -> Cetak Struk -> Riwayat & Reprint -> Void Manager', async () => {
    const user = userEvent.setup();

    const { container, unmount } = render(
      <MemoryRouter initialEntries={['/pos']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    // 1. Tunggu katalog tampil
    const catalog = await screen.findByRole('region', { name: /katalog produk dan pencarian/i });
    await within(catalog).findByText('Mangga Harum Manis');

    // 2. Pilih produk WEIGHT -> input berat 1.500 kg via preset (+1 kg + +0.5 kg)
    await user.click(within(catalog).getByRole('button', { name: /mangga harum manis/i }));
    await user.click(screen.getByRole('button', { name: /\+1 kg/i }));
    await user.click(screen.getByRole('button', { name: /\+0\.5 kg/i }));
    await user.click(screen.getByRole('button', { name: /tambah ke keranjang/i }));

    // Tambah produk UNIT 2 pcs
    const nanasBtn = within(catalog).getByRole('button', { name: /nanas madu pemalang/i });
    await user.click(nanasBtn);
    await user.click(nanasBtn);

    // Total keranjang: (1.5 * 25000 = 37500) + (2 * 15000 = 30000) = Rp 67.500
    const cart = screen.getByRole('region', { name: /keranjang belanja kasir/i });
    expect(within(cart).getAllByText('Rp 67.500').length).toBeGreaterThanOrEqual(1);

    // 3. Tahan (Hold) lalu Pulihkan (Recall) keranjang tanpa kehilangan item
    await user.click(within(cart).getByRole('button', { name: /tahan transaksi saat ini/i }));
    expect(within(cart).getByText('Keranjang belanja kosong')).toBeInTheDocument();

    await user.click(
      within(cart).getByRole('button', { name: /buka daftar .* transaksi tertahan/i }),
    );
    await user.click(await screen.findByRole('button', { name: 'Buka' }));
    expect(within(cart).getAllByText('Rp 67.500').length).toBeGreaterThanOrEqual(1);

    // 4. Checkout Tunai dengan uang Rp 100.000 -> kembalian Rp 32.500
    await user.click(within(cart).getByRole('button', { name: /bayar tunai/i }));
    const cashInput = screen.getByLabelText(/uang diterima dari pelanggan/i);
    await user.type(cashInput, '100000');

    await user.click(screen.getByRole('button', { name: /konfirmasi pembayaran/i }));

    // 5. Verifikasi Modal Sukses, Nomor Transaksi, & Counter StatusBar
    await waitFor(() => {
      expect(screen.getByText('Transaksi Berhasil Disimpan')).toBeInTheDocument();
      expect(screen.getByText('TRX-20261117-0001')).toBeInTheDocument();
      expect(screen.getByText(/^Rp\s*32\.500$/)).toBeInTheDocument();
    });

    // 6. Cetak Struk ESC/POS
    await user.click(screen.getByRole('button', { name: /cetak struk/i }));
    const paper = await screen.findByTestId('thermal-receipt-paper');
    expect(paper).toHaveTextContent('TRX-20261117-0001');
    expect(paper).toHaveTextContent('Mangga Harum Manis');

    await user.click(screen.getByRole('button', { name: /cetak struk sekarang/i }));
    await waitFor(() => {
      expect(printerService.executeThermalPrint).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: /tutup dialog/i }));
    await user.click(await screen.findByRole('button', { name: /transaksi baru/i }));

    const statusBar = screen.getByRole('contentinfo', { name: /status kasir/i });
    expect(within(statusBar).getByText('1')).toBeInTheDocument();

    // 7. Navigasi ke Riwayat Transaksi via header link & verifikasi Reprint + RBAC CASHIER
    await user.click(screen.getByRole('link', { name: /^Riwayat$/i }));
    expect(await screen.findByRole('heading', { name: 'Riwayat Transaksi' })).toBeInTheDocument();

    const detailRegion = await screen.findByRole('region', {
      name: /detail transaksi TRX-20261117-0001/i,
    });
    expect(within(detailRegion).getByText('Mangga Harum Manis')).toBeInTheDocument();
    expect(
      within(detailRegion).queryByRole('button', { name: /Batalkan \(Void\)/i }),
    ).not.toBeInTheDocument();

    const historyAxe = await axe.run(container);
    expect(historyAxe.violations).toHaveLength(0);
    unmount();

    // 8. Login ulang sebagai MANAGER pada /pos/history dan lakukan Void transaksi
    useAuthStore.getState().setSession({
      accessToken: 'token-mgr',
      refreshToken: 'refresh-mgr',
      user: {
        id: 'u-mgr',
        username: 'manajer_e2e',
        fullName: 'Budi Manajer',
        role: 'MANAGER',
      },
    });

    render(
      <MemoryRouter initialEntries={['/pos/history']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    const mgrDetail = await screen.findByRole('region', {
      name: /detail transaksi TRX-20261117-0001/i,
    });
    await user.click(within(mgrDetail).getByRole('button', { name: /Batalkan \(Void\)/i }));
    await user.type(within(mgrDetail).getByLabelText(/Alasan Pembatalan/i), 'Uji void end-to-end');
    await user.click(within(mgrDetail).getByRole('button', { name: /Konfirmasi Void Transaksi/i }));

    await waitFor(() => {
      expect(within(mgrDetail).getByRole('note')).toHaveTextContent(/Uji void end-to-end/);
    });
  });
});
