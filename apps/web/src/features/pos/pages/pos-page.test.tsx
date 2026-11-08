import type { CategoryDto, ProductDto } from '@istana-buah/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../../../stores/auth-store';
import * as categoryApi from '../../categories/api/category-api';
import * as productApi from '../../products/api/product-api';
import { usePosCartStore } from '../stores/pos-cart-store';
import { PosPage } from './pos-page';

vi.mock('../../categories/api/category-api');
vi.mock('../../products/api/product-api');
vi.mock('@zxing/library', () => {
  return {
    BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
      listVideoInputDevices: vi
        .fn()
        .mockResolvedValue([{ deviceId: 'cam-mock', label: 'Kamera Mock' }]),
      decodeFromVideoDevice: vi.fn(),
      reset: vi.fn(),
    })),
  };
});

const mockCategories: CategoryDto[] = [
  {
    id: 'cat-lokal',
    name: 'Buah Lokal',
    description: 'Mangga, pepaya, jeruk nusantara',
    sortOrder: 1,
    isActive: true,
    productCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-impor',
    name: 'Buah Impor',
    description: 'Apel fuji, anggur jepang',
    sortOrder: 2,
    isActive: true,
    productCount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockProducts: ProductDto[] = [
  {
    id: 'prod-mangga',
    categoryId: 'cat-lokal',
    category: { id: 'cat-lokal', name: 'Buah Lokal' },
    name: 'Mangga Harum Manis',
    description: 'Mangga segar matang pohon',
    productType: 'WEIGHT',
    pricePerKg: '25000.00',
    pricePerUnit: null,
    costPerKg: '18000.00',
    costPerUnit: null,
    stockQty: '15.500',
    minStockAlert: '5.000',
    imageUrl: null,
    isActive: true,
    barcodes: [{ id: 'b1', barcode: '899100100001', isPrimary: true }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'prod-nanas',
    categoryId: 'cat-lokal',
    category: { id: 'cat-lokal', name: 'Buah Lokal' },
    name: 'Nanas Madu Pemalang',
    description: 'Nanas manis siap makan',
    productType: 'UNIT',
    pricePerKg: null,
    pricePerUnit: '15000.00',
    costPerKg: null,
    costPerUnit: '10000.00',
    stockQty: '20.000',
    minStockAlert: '5.000',
    imageUrl: null,
    isActive: true,
    barcodes: [{ id: 'b2', barcode: '899100100002', isPrimary: true }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'prod-apel',
    categoryId: 'cat-impor',
    category: { id: 'cat-impor', name: 'Buah Impor' },
    name: 'Apel Fuji RRC Super',
    description: 'Apel merah renyah',
    productType: 'WEIGHT',
    pricePerKg: '45000.00',
    pricePerUnit: null,
    costPerKg: '32000.00',
    costPerUnit: null,
    stockQty: '0.000', // Stok habis
    minStockAlert: '3.000',
    imageUrl: null,
    isActive: true,
    barcodes: [{ id: 'b3', barcode: '899100100003', isPrimary: true }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('PosPage (M03-002) POS Layout, 2-Panel Responsiveness & Cart Interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePosCartStore.getState().clearCart();

    vi.mocked(categoryApi.getCategories).mockResolvedValue([...mockCategories]);
    vi.mocked(productApi.getProducts).mockImplementation(async (params) => {
      let filtered = [...mockProducts];
      if (params?.categoryId) {
        filtered = filtered.filter((p) => p.categoryId === params.categoryId);
      }
      if (params?.search) {
        const query = params.search.toLowerCase();
        filtered = filtered.filter((p) => p.name.toLowerCase().includes(query));
      }
      return {
        items: filtered,
        meta: { page: 1, limit: 100, total: filtered.length },
      };
    });

    useAuthStore.getState().setSession({
      accessToken: 'token-cashier',
      refreshToken: 'refresh-cashier',
      user: {
        id: 'u-cashier',
        username: 'kasir1',
        fullName: 'Siti Kasir',
        role: 'CASHIER',
      },
    });
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (0 pelanggaran axe-core)', async () => {
    const { container } = render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    });

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('merender layout 2-panel (katalog produk 60% dan keranjang belanja 40%) beserta status bar', async () => {
    render(<PosPage />);

    // Panel Kiri: Produk & Pencarian
    expect(
      screen.getByRole('region', { name: /katalog produk dan pencarian/i }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/cari nama produk atau scan barcode/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /semua produk/i })).toBeInTheDocument();

    // Panel Kanan: Keranjang
    expect(screen.getByRole('region', { name: /keranjang belanja kasir/i })).toBeInTheDocument();
    expect(screen.getByText(/keranjang belanja kosong/i)).toBeInTheDocument();

    // Tombol Bayar
    expect(screen.getByRole('button', { name: /bayar tunai/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /qris/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /transfer/i })).toBeInTheDocument();

    // Status Bar Bawah
    const statusBar = screen.getByRole('contentinfo', { name: /status kasir/i });
    expect(statusBar).toBeInTheDocument();
    expect(within(statusBar).getByText(/shift 1 \(pagi\)/i)).toBeInTheDocument();
    expect(within(statusBar).getByText('F1')).toBeInTheDocument();
  });

  it('menampilkan produk, membedakan tipe WEIGHT vs UNIT, dan menonaktifkan produk habis', async () => {
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    });

    // Cek badge tipe produk
    expect(screen.getAllByText('Timbang (kg)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Satuan (pcs)')).toBeInTheDocument();

    // Produk dengan stok 0 dinonaktifkan
    const outOfStockCard = screen.getByText('Apel Fuji RRC Super').closest('button');
    expect(outOfStockCard).toBeDisabled();
    expect(within(outOfStockCard!).getByText(/habis/i)).toBeInTheDocument();
  });

  it('menambahkan produk ke keranjang belanja saat diklik dan menghitung subtotal serta total', async () => {
    const user = userEvent.setup();
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    });

    // 1. Klik produk timbang Mangga (Rp 25.000)
    const manggaCard = screen.getByText('Mangga Harum Manis').closest('button')!;
    await user.click(manggaCard);

    // Keranjang harus memuat Mangga
    const cartRegion = screen.getByRole('region', { name: /keranjang belanja kasir/i });
    expect(within(cartRegion).getByText('Mangga Harum Manis')).toBeInTheDocument();
    expect(within(cartRegion).getByText('1 item')).toBeInTheDocument();

    // 2. Klik produk satuan Nanas (Rp 15.000)
    const nanasCard = screen.getByText('Nanas Madu Pemalang').closest('button')!;
    await user.click(nanasCard);

    // Total belanja harus Rp 40.000 (25.000 + 15.000)
    expect(within(cartRegion).getByText('2 item')).toBeInTheDocument();
    expect(within(cartRegion).getAllByText(/rp\s*40\.000/i).length).toBeGreaterThanOrEqual(1);
  });

  it('mengubah kuantitas item dengan tombol stepper dan menghapus item dari keranjang', async () => {
    const user = userEvent.setup();
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Nanas Madu Pemalang')).toBeInTheDocument();
    });

    // Tambahkan Nanas ke keranjang
    await user.click(screen.getByText('Nanas Madu Pemalang').closest('button')!);

    const cartRegion = screen.getByRole('region', { name: /keranjang belanja kasir/i });
    expect(within(cartRegion).getByText(/1 pcs/i)).toBeInTheDocument();

    // Tambah kuantitas via tombol stepper (+)
    const plusButton = within(cartRegion).getByRole('button', {
      name: /tambah kuantitas nanas madu pemalang/i,
    });
    await user.click(plusButton);

    // Kuantitas jadi 2 pcs, total jadi Rp 30.000
    expect(within(cartRegion).getByText(/2 pcs/i)).toBeInTheDocument();
    expect(within(cartRegion).getAllByText(/rp\s*30\.000/i).length).toBeGreaterThanOrEqual(1);

    // Hapus item via tombol hapus
    const deleteButton = within(cartRegion).getByRole('button', {
      name: /hapus nanas madu pemalang dari keranjang/i,
    });
    await user.click(deleteButton);

    // Keranjang kembali kosong
    expect(within(cartRegion).getByText(/keranjang belanja kosong/i)).toBeInTheDocument();
  });

  it('mendukung fitur Tahan dan Pulihkan transaksi keranjang', async () => {
    const user = userEvent.setup();
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    });

    // Tambahkan Mangga
    await user.click(screen.getByText('Mangga Harum Manis').closest('button')!);

    const cartRegion = screen.getByRole('region', { name: /keranjang belanja kasir/i });
    expect(within(cartRegion).getByText('1 item')).toBeInTheDocument();

    // Klik tombol Tahan
    const holdButton = within(cartRegion).getByRole('button', {
      name: /tahan transaksi saat ini/i,
    });
    await user.click(holdButton);

    // Keranjang aktif jadi kosong, tombol Pulihkan (1) muncul
    expect(within(cartRegion).getByText(/keranjang belanja kosong/i)).toBeInTheDocument();
    const restoreButton = within(cartRegion).getByRole('button', {
      name: /buka daftar 1 transaksi tertahan/i,
    });
    expect(restoreButton).toBeInTheDocument();

    // Buka modal pulihkan
    await user.click(restoreButton);
    const dialog = screen.getByRole('dialog', { name: /daftar transaksi tertahan/i });
    expect(dialog).toBeInTheDocument();

    // Klik tombol Buka pada transaksi tertahan
    const bukaButton = within(dialog).getByRole('button', { name: /^buka$/i });
    await user.click(bukaButton);

    // Mangga dipulihkan ke keranjang aktif
    expect(within(cartRegion).getByText('Mangga Harum Manis')).toBeInTheDocument();
  });

  it('mendukung pintasan keyboard F4 untuk memfokuskan pencarian', async () => {
    render(<PosPage />);

    const searchInput = screen.getByPlaceholderText(/cari nama produk atau scan barcode/i);
    expect(searchInput).not.toHaveFocus();

    // Tekan F4
    fireEvent.keyDown(window, { key: 'F4' });
    expect(searchInput).toHaveFocus();
  });

  it('M03-003: mendukung lazy loading gambar pada kartu produk dan fallback ikon saat gambar tidak ada', async () => {
    vi.mocked(productApi.getProducts).mockResolvedValueOnce({
      items: [
        {
          ...mockProducts[0]!,
          imageUrl: 'https://images.unsplash.com/photo-mango.jpg',
        },
      ],
      meta: { page: 1, limit: 100, total: 1 },
    });

    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    });

    const img = screen.getByRole('img', { name: 'Mangga Harum Manis' });
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('M03-003: melakukan filter pencarian produk real-time dan menyorot teks yang cocok', async () => {
    const user = userEvent.setup();
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/cari nama produk atau scan barcode/i);
    await user.type(searchInput, 'Mangga');

    await waitFor(() => {
      expect(screen.getByText('Mangga')).toBeInTheDocument();
      expect(screen.queryByText('Nanas Madu Pemalang')).not.toBeInTheDocument();
    });
  });

  it('M03-003: menyaring produk berdasarkan tab kategori dan mendukung tombol geser horisontal', async () => {
    const user = userEvent.setup();
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    });

    // Klik tab Buah Impor
    const imporTab = screen.getByRole('tab', { name: /buah impor/i });
    await user.click(imporTab);

    await waitFor(() => {
      expect(screen.getByText('Apel Fuji RRC Super')).toBeInTheDocument();
      expect(screen.queryByText('Mangga Harum Manis')).not.toBeInTheDocument();
    });

    // Klik tombol scroll kiri & kanan kategori
    const scrollRight = screen.getByRole('button', { name: /geser kategori ke kanan/i });
    const scrollLeft = screen.getByRole('button', { name: /geser kategori ke kiri/i });
    expect(scrollRight).toBeInTheDocument();
    expect(scrollLeft).toBeInTheDocument();
    await user.click(scrollRight);
    await user.click(scrollLeft);
  });

  it('M03-004: mendeteksi scanner barcode USB HID dan otomatis memasukkan produk ke keranjang', async () => {
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Nanas Madu Pemalang')).toBeInTheDocument();
    });

    let mockTime = 2000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

    // Simulasikan pemindai USB HID membaca barcode '899100100002' (Nanas Madu)
    const barcodeChars = '899100100002'.split('');
    for (const char of barcodeChars) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      mockTime += 15;
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText(/nanas madu pemalang ditambahkan ke keranjang/i)).toBeInTheDocument();
    });

    // Keranjang terupdate dengan produk tersebut
    const cartItems = screen.getByLabelText(/daftar item keranjang/i);
    expect(within(cartItems).getByText('Nanas Madu Pemalang')).toBeInTheDocument();
  });

  it('M03-004: membuka modal kamera saat tombol pemindai kamera diklik', async () => {
    const user = userEvent.setup();
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    });

    const cameraBtn = screen.getByRole('button', { name: /buka pemindai kamera barcode/i });
    await user.click(cameraBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /pindai barcode produk/i })).toBeInTheDocument();
  });

  it('M03-004: menangani input barcode manual dengan tombol Enter dan menampilkan notifikasi jika tidak ditemukan', async () => {
    const user = userEvent.setup();
    vi.mocked(productApi.getProductByBarcode).mockRejectedValueOnce(new Error('Not found'));

    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/cari nama produk atau scan barcode/i);
    await user.type(searchInput, '9999999999999{Enter}');

    await waitFor(() => {
      expect(screen.getByText(/barcode "9999999999999" tidak terdaftar/i)).toBeInTheDocument();
    });
  });

  it('M03-004: menampilkan peringatan saat barcode yang di-scan memiliki stok habis', async () => {
    render(<PosPage />);

    await waitFor(() => {
      expect(screen.getByText('Apel Fuji RRC Super')).toBeInTheDocument();
    });

    let mockTime = 3000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

    // Apel Fuji memiliki stok 0.000
    const barcodeChars = '899100100003'.split('');
    for (const char of barcodeChars) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      mockTime += 15;
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await waitFor(() => {
      expect(screen.getByText(/stok apel fuji rrc super habis/i)).toBeInTheDocument();
    });
  });
});
