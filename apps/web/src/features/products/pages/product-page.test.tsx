import type { CategoryDto, ProductDto } from '@istana-buah/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../../stores/auth-store';
import * as categoryApi from '../../categories/api/category-api';
import * as productApi from '../api/product-api';
import { ProductPage } from './product-page';

vi.mock('../api/product-api');
vi.mock('../../categories/api/category-api');

const mockCategories: CategoryDto[] = [
  {
    id: 'cat-1',
    name: 'Buah Lokal',
    description: 'Mangga, pepaya, nanas',
    sortOrder: 1,
    isActive: true,
    productCount: 5,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-2',
    name: 'Buah Impor',
    description: 'Apel fuji, pir shingo',
    sortOrder: 2,
    isActive: true,
    productCount: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockProducts: ProductDto[] = [
  {
    id: 'prod-1',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Buah Lokal' },
    name: 'Mangga Harum Manis Probolinggo',
    description: 'Mangga manis segar matang pohon',
    productType: 'WEIGHT',
    pricePerKg: '35000.00',
    pricePerUnit: null,
    costPerKg: '25000.00',
    costPerUnit: null,
    stockQty: '8.500',
    minStockAlert: '10.000', // Stok menipis (8.5 <= 10.0)
    imageUrl: null,
    isActive: true,
    barcodes: [
      { id: 'bc-1', barcode: '2001000000018', isPrimary: true },
      { id: 'bc-2', barcode: '2001000000025', isPrimary: false },
    ],
    createdAt: '2026-02-01T08:00:00.000Z',
    updatedAt: '2026-02-01T08:00:00.000Z',
  },
  {
    id: 'prod-2',
    categoryId: 'cat-2',
    category: { id: 'cat-2', name: 'Buah Impor' },
    name: 'Apel Fuji RRC Super Pack',
    description: 'Apel renyah manis per pcs',
    productType: 'UNIT',
    pricePerKg: null,
    pricePerUnit: '15000.00',
    costPerKg: null,
    costPerUnit: '10000.00',
    stockQty: '50.000',
    minStockAlert: '15.000',
    imageUrl: 'https://example.com/apel.jpg',
    isActive: true,
    barcodes: [{ id: 'bc-3', barcode: '8991234567890', isPrimary: true }],
    createdAt: '2026-02-02T08:00:00.000Z',
    updatedAt: '2026-02-02T08:00:00.000Z',
  },
  {
    id: 'prod-3',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Buah Lokal' },
    name: 'Pepaya California Nonaktif',
    description: 'Stok musiman habis',
    productType: 'WEIGHT',
    pricePerKg: '12000.00',
    pricePerUnit: null,
    costPerKg: '8000.00',
    costPerUnit: null,
    stockQty: '0.000',
    minStockAlert: '5.000',
    imageUrl: null,
    isActive: false,
    barcodes: [],
    createdAt: '2026-02-03T08:00:00.000Z',
    updatedAt: '2026-02-03T08:00:00.000Z',
  },
];

describe('ProductPage (M02-005) & Management Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(categoryApi.getCategories).mockResolvedValue([...mockCategories]);
    vi.mocked(productApi.getProducts).mockResolvedValue({
      items: [...mockProducts],
      meta: {
        page: 1,
        limit: 10,
        total: 3,
      },
    });

    useAuthStore.getState().setSession({
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      user: {
        id: 'usr-owner',
        username: 'owner',
        fullName: 'Budi Santoso',
        role: 'OWNER',
      },
    });
  });

  it('memenuhi kepatuhan aksesibilitas WCAG 2.1 AA (0 pelanggaran axe-core)', async () => {
    const { container } = render(<ProductPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Mangga Harum Manis Probolinggo').length).toBeGreaterThanOrEqual(
        1,
      );
    });

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('merender daftar produk dengan data harga, indikator stok menipis, dan badge tipe', async () => {
    render(<ProductPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Mangga Harum Manis Probolinggo').length).toBeGreaterThanOrEqual(
        1,
      );
      expect(screen.getAllByText('Apel Fuji RRC Super Pack').length).toBeGreaterThanOrEqual(1);
    });

    // Indikator stok menipis harus muncul untuk prod-1
    const lowStockBadges = screen.getAllByText('Menipis');
    expect(lowStockBadges.length).toBeGreaterThanOrEqual(1);

    // Badge tipe Kg dan Pcs
    expect(screen.getAllByText('Kg').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Pcs').length).toBeGreaterThanOrEqual(1);

    // Format harga Rupiah
    expect(screen.getAllByText(/Rp\s*35\.000/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Rp\s*15\.000/i).length).toBeGreaterThanOrEqual(1);
  });

  it('menampilkan HPP hanya untuk OWNER/MANAGER dan menyembunyikannya dari CASHIER', async () => {
    // 1. Saat login sebagai OWNER: HPP tampil
    const { unmount } = render(<ProductPage />);

    await waitFor(() => {
      expect(screen.getByText('HPP')).toBeInTheDocument();
      expect(screen.getAllByText(/Rp\s*25\.000/i).length).toBeGreaterThanOrEqual(1);
    });

    unmount();

    // 2. Saat login sebagai CASHIER: HPP tidak tampil sama sekali (NFR-SEC-09)
    useAuthStore.getState().setSession({
      accessToken: 'cashier-token',
      refreshToken: 'cashier-refresh',
      user: {
        id: 'usr-cashier',
        username: 'kasir1',
        fullName: 'Siti Kasir',
        role: 'CASHIER',
      },
    });

    render(<ProductPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Mangga Harum Manis Probolinggo').length).toBeGreaterThanOrEqual(
        1,
      );
    });

    expect(screen.queryByText('HPP')).not.toBeInTheDocument();
    expect(screen.queryByText(/Rp\s*25\.000/i)).not.toBeInTheDocument();
  });

  it('melakukan filter pencarian, kategori, tipe produk, dan stok menipis', async () => {
    const user = userEvent.setup();
    render(<ProductPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Mangga Harum Manis Probolinggo').length).toBeGreaterThanOrEqual(
        1,
      );
    });

    // 1. Pencarian teks
    const searchInput = screen.getByLabelText('Cari produk');
    await user.type(searchInput, 'Mangga');

    await waitFor(() => {
      expect(productApi.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'Mangga',
        }),
      );
    });

    // 2. Filter Kategori
    const categorySelect = screen.getByLabelText('Filter Kategori');
    await user.selectOptions(categorySelect, 'cat-1');

    await waitFor(() => {
      expect(productApi.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: 'cat-1',
        }),
      );
    });

    // 3. Filter Tipe
    const typeSelect = screen.getByLabelText('Filter Tipe Produk');
    await user.selectOptions(typeSelect, 'WEIGHT');

    await waitFor(() => {
      expect(productApi.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'WEIGHT',
        }),
      );
    });

    // 4. Toggle Stok Menipis
    const lowStockCheckbox = screen.getByLabelText('Hanya Tampilkan Stok Menipis');
    await user.click(lowStockCheckbox);

    await waitFor(() => {
      expect(productApi.getProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          lowStock: true,
        }),
      );
    });
  });

  it('membuka modal detail saat tombol detail diklik dan menampilkan info lengkap produk', async () => {
    const user = userEvent.setup();
    render(<ProductPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Mangga Harum Manis Probolinggo').length).toBeGreaterThanOrEqual(
        1,
      );
    });

    const detailBtn = screen.getByLabelText('Lihat detail Mangga Harum Manis Probolinggo');
    await user.click(detailBtn);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Detail Produk')).toBeInTheDocument();
    expect(within(dialog).getByText('Mangga manis segar matang pohon')).toBeInTheDocument();
    expect(within(dialog).getByText('2001000000018')).toBeInTheDocument();
    expect(within(dialog).getByText('Utama')).toBeInTheDocument();

    const closeBtn = within(dialog).getByRole('button', { name: 'Tutup' });
    await user.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('membuka modal tambah produk, menginput data produk timbang (WEIGHT), dan menyimpannya', async () => {
    const user = userEvent.setup();
    vi.mocked(productApi.createProduct).mockResolvedValueOnce({
      ...mockProducts[0]!,
      id: 'prod-new',
      name: 'Semangka Non Biji Super',
    });

    render(<ProductPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Tambah Produk' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Tambah Produk' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Tambah Produk Baru')).toBeInTheDocument();

    // Isi field
    const nameInput = within(dialog).getByLabelText(/Nama Produk/i);
    await user.type(nameInput, 'Semangka Non Biji Super');

    const categorySelect = within(dialog).getByLabelText(/Kategori Produk/i);
    await user.selectOptions(categorySelect, 'cat-1');

    const priceInput = within(dialog).getByLabelText(/Harga Jual per Kg/i);
    await user.type(priceInput, '12000');

    const hppInput = within(dialog).getByLabelText(/HPP per Kg/i);
    await user.type(hppInput, '8000');

    // Submit form
    const submitBtn = within(dialog).getByRole('button', { name: 'Tambah Produk' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(productApi.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Semangka Non Biji Super',
          categoryId: 'cat-1',
          productType: 'WEIGHT',
          pricePerKg: 12000,
          costPerKg: 8000,
        }),
      );
    });
  });

  it('membuka modal hapus produk dan memanggil deleteProduct saat konfirmasi', async () => {
    const user = userEvent.setup();
    vi.mocked(productApi.deleteProduct).mockResolvedValueOnce('Produk berhasil dihapus');

    render(<ProductPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Mangga Harum Manis Probolinggo').length).toBeGreaterThanOrEqual(
        1,
      );
    });

    const deleteBtn = screen.getByLabelText('Hapus Mangga Harum Manis Probolinggo');
    await user.click(deleteBtn);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Hapus Produk')).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Apakah Anda yakin ingin menghapus produk/i),
    ).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: 'Ya, Hapus Produk' });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(productApi.deleteProduct).toHaveBeenCalledWith('prod-1');
    });
  });

  it('menghandle generate barcode otomatis di dalam modal form', async () => {
    const user = userEvent.setup();
    vi.mocked(productApi.generateProductBarcode).mockResolvedValueOnce('2009999999991');

    render(<ProductPage />);

    await user.click(screen.getByRole('button', { name: 'Tambah Produk' }));

    const dialog = screen.getByRole('dialog');
    const generateBtn = within(dialog).getByRole('button', {
      name: 'Generate Barcode Otomatis',
    });
    await user.click(generateBtn);

    await waitFor(() => {
      expect(productApi.generateProductBarcode).toHaveBeenCalled();
      expect(within(dialog).getByText('2009999999991')).toBeInTheDocument();
    });
  });
});
