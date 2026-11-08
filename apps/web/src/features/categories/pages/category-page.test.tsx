import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CategoryDto } from '@istana-buah/shared';
import * as categoryApi from '../api/category-api';
import { CategoryPage } from './category-page';
import { FrontendApiError } from '../../../lib/api/api-error';

vi.mock('../api/category-api');

const mockCategories: CategoryDto[] = [
  {
    id: 'cat-1',
    name: 'Buah Tropis',
    description: 'Mangga, pisang, nanas, pepaya',
    sortOrder: 1,
    isActive: true,
    productCount: 12,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-2',
    name: 'Buah Impor',
    description: 'Apel fuji, anggur autumn, pir xiang lie',
    sortOrder: 2,
    isActive: true,
    productCount: 8,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'cat-3',
    name: 'Buah Musiman',
    description: 'Durian, rambutan, duku',
    sortOrder: 3,
    isActive: false,
    productCount: 0,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
  },
];

describe('CategoryPage (M02-004) Accessibility & CRUD Features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(categoryApi.getCategories).mockResolvedValue([...mockCategories]);
  });

  it('memenuhi standar aksesibilitas WCAG 2.1 AA (0 pelanggaran axe-core) pada tabel kategori', async () => {
    const { container } = render(<CategoryPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Buah Tropis').length).toBeGreaterThanOrEqual(1);
    });

    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('merender daftar kategori dengan badge status, jumlah produk, dan urutan prioritas', async () => {
    render(<CategoryPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Buah Tropis').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Buah Impor').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Buah Musiman').length).toBeGreaterThanOrEqual(1);
    });

    expect(screen.getAllByText('12 Produk').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('8 Produk').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('0 Produk').length).toBeGreaterThanOrEqual(1);

    // Verifikasi badge aktif & nonaktif
    const activeBadges = screen.getAllByText('Aktif');
    expect(activeBadges.length).toBeGreaterThanOrEqual(2);
    const inactiveBadges = screen.getAllByText('Nonaktif');
    expect(inactiveBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('menyaring kategori secara instan melalui pencarian nama/deskripsi dan tab status', async () => {
    const user = userEvent.setup();
    render(<CategoryPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Buah Tropis').length).toBeGreaterThanOrEqual(1);
    });

    // 1. Pencarian teks
    const searchInput = screen.getByLabelText('Cari kategori produk');
    await user.type(searchInput, 'Tropis');

    expect(screen.getAllByText('Buah Tropis').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText('Buah Impor').length).toBe(0);
    expect(screen.queryAllByText('Buah Musiman').length).toBe(0);

    // Bersihkan pencarian via tombol X
    const clearButton = screen.getByLabelText('Hapus kata kunci pencarian');
    await user.click(clearButton);
    expect(screen.getAllByText('Buah Impor').length).toBeGreaterThanOrEqual(1);

    // 2. Filter status: Nonaktif
    const inactiveTab = screen.getByRole('button', { name: /Nonaktif/i });
    await user.click(inactiveTab);

    expect(screen.queryAllByText('Buah Tropis').length).toBe(0);
    expect(screen.queryAllByText('Buah Impor').length).toBe(0);
    expect(screen.getAllByText('Buah Musiman').length).toBeGreaterThanOrEqual(1);
  });

  it('berhasil menambahkan kategori baru melalui modal dan menampilkan notifikasi sukses', async () => {
    const user = userEvent.setup();
    const newCategory: CategoryDto = {
      id: 'cat-4',
      name: 'Buah Organik',
      description: 'Hasil kebun organik bersertifikat',
      sortOrder: 4,
      isActive: true,
      productCount: 0,
      createdAt: '2026-01-04T00:00:00.000Z',
      updatedAt: '2026-01-04T00:00:00.000Z',
    };

    vi.mocked(categoryApi.createCategory).mockResolvedValue(newCategory);

    const { container } = render(<CategoryPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Buah Tropis').length).toBeGreaterThanOrEqual(1);
    });

    // Buka modal tambah kategori
    const addButton = screen.getByRole('button', { name: /Tambah Kategori/i });
    await user.click(addButton);

    // Verifikasi modal aksesibel (0 pelanggaran axe-core)
    const modalAxe = await axe.run(container);
    expect(modalAxe.violations).toEqual([]);

    // Isi form
    const nameInput = screen.getByLabelText(/Nama Kategori/i);
    await user.type(nameInput, 'Buah Organik');

    const descInput = screen.getByLabelText(/Deskripsi/i);
    await user.type(descInput, 'Hasil kebun organik bersertifikat');

    // Submit
    const modalDialog = screen.getByRole('dialog');
    const submitBtn = within(modalDialog).getByRole('button', { name: 'Tambah Kategori' });
    await user.click(submitBtn);

    expect(categoryApi.createCategory).toHaveBeenCalledWith({
      name: 'Buah Organik',
      description: 'Hasil kebun organik bersertifikat',
      sortOrder: 0,
      isActive: true,
    });

    await waitFor(() => {
      expect(screen.getByText('Kategori "Buah Organik" berhasil ditambahkan.')).toBeInTheDocument();
      expect(screen.getAllByText('Buah Organik').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('menangani error validasi duplikasi nama kategori (DUPLICATE_CATEGORY)', async () => {
    const user = userEvent.setup();
    vi.mocked(categoryApi.createCategory).mockRejectedValue(
      new FrontendApiError({
        code: 'DUPLICATE_CATEGORY',
        message: 'Nama kategori sudah digunakan',
        statusCode: 409,
      }),
    );

    render(<CategoryPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Buah Tropis').length).toBeGreaterThanOrEqual(1);
    });

    const addButton = screen.getByRole('button', { name: /Tambah Kategori/i });
    await user.click(addButton);

    const nameInput = screen.getByLabelText(/Nama Kategori/i);
    await user.type(nameInput, 'Buah Tropis');

    const modalDialog = screen.getByRole('dialog');
    const submitBtn = within(modalDialog).getByRole('button', { name: 'Tambah Kategori' });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText('Nama kategori sudah digunakan. Silakan gunakan nama lain.'),
      ).toBeInTheDocument();
    });
  });

  it('berhasil memperbarui data kategori melalui modal edit', async () => {
    const user = userEvent.setup();
    const updatedCategory: CategoryDto = {
      ...mockCategories[0]!,
      name: 'Buah Tropis Nusantara',
      description: 'Koleksi mangga, pisang, nanas pilihan',
    };

    vi.mocked(categoryApi.updateCategory).mockResolvedValue(updatedCategory);

    render(<CategoryPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Buah Tropis').length).toBeGreaterThanOrEqual(1);
    });

    // Buka edit kategori pertama
    const editButtons = screen.getAllByLabelText('Edit kategori Buah Tropis');
    await user.click(editButtons[0]!);

    expect(screen.getByRole('heading', { name: 'Edit Kategori' })).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Nama Kategori/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Buah Tropis Nusantara');

    const submitBtn = screen.getByRole('button', { name: 'Simpan Perubahan' });
    await user.click(submitBtn);

    expect(categoryApi.updateCategory).toHaveBeenCalledWith('cat-1', {
      name: 'Buah Tropis Nusantara',
      description: 'Mangga, pisang, nanas, pepaya',
      sortOrder: 1,
      isActive: true,
    });

    await waitFor(() => {
      expect(
        screen.getByText('Kategori "Buah Tropis Nusantara" berhasil diperbarui.'),
      ).toBeInTheDocument();
    });
  });

  it('mencegah penghapusan kategori jika masih memuat produk aktif (productCount > 0)', async () => {
    const user = userEvent.setup();
    render(<CategoryPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Buah Tropis').length).toBeGreaterThanOrEqual(1);
    });

    // Klik tombol hapus pada Buah Tropis (productCount = 12)
    const deleteButtons = screen.getAllByLabelText('Hapus kategori Buah Tropis');
    await user.click(deleteButtons[0]!);

    expect(screen.getByRole('heading', { name: 'Konfirmasi Hapus Kategori' })).toBeInTheDocument();
    expect(screen.getByText(/Kategori Memiliki Produk Terkait/i)).toBeInTheDocument();
    expect(screen.getByText('12 produk aktif')).toBeInTheDocument();

    // Tombol hapus kategori wajib disabled
    const confirmDeleteBtn = screen.getByRole('button', { name: 'Hapus Kategori' });
    expect(confirmDeleteBtn).toBeDisabled();
  });

  it('berhasil menghapus kategori kosong (productCount = 0)', async () => {
    const user = userEvent.setup();
    vi.mocked(categoryApi.deleteCategory).mockResolvedValue('Kategori berhasil dihapus');

    const { container } = render(<CategoryPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Buah Musiman').length).toBeGreaterThanOrEqual(1);
    });

    // Klik tombol hapus pada Buah Musiman (productCount = 0)
    const deleteButtons = screen.getAllByLabelText('Hapus kategori Buah Musiman');
    await user.click(deleteButtons[0]!);

    // Verifikasi aksesibilitas modal hapus
    const modalAxe = await axe.run(container);
    expect(modalAxe.violations).toEqual([]);

    const confirmDeleteBtn = screen.getByRole('button', { name: 'Hapus Kategori' });
    expect(confirmDeleteBtn).not.toBeDisabled();
    await user.click(confirmDeleteBtn);

    expect(categoryApi.deleteCategory).toHaveBeenCalledWith('cat-3');

    await waitFor(() => {
      expect(screen.getByText('Kategori "Buah Musiman" berhasil dihapus.')).toBeInTheDocument();
      expect(screen.queryAllByText('Buah Musiman').length).toBe(0);
    });
  });
});
