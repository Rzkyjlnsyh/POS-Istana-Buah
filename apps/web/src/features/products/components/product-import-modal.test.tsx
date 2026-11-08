import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as productApi from '../api/product-api';
import { ProductImportModal } from './product-import-modal';

vi.mock('../api/product-api', () => ({
  batchImportProducts: vi.fn(),
}));

describe('ProductImportModal (M02-007)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('lulus audit aksesibilitas WCAG 2.1 AA (axe-core 0 pelanggaran)', async () => {
    const { container } = render(<ProductImportModal {...defaultProps} />);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('mengunduh template CSV resmi saat tombol Unduh Template diklik', async () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-csv');
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    render(<ProductImportModal {...defaultProps} />);

    const downloadBtn = screen.getByRole('button', { name: /Unduh Template CSV/i });
    await userEvent.click(downloadBtn);

    expect(createObjectURLMock).toHaveBeenCalled();
  });

  it('menolak berkas yang bukan berekstensi .csv', async () => {
    render(<ProductImportModal {...defaultProps} />);

    const nonCsvFile = new File(['dummy content'], 'produk.txt', { type: 'text/plain' });
    const fileInput = screen.getByLabelText(/Pilih berkas CSV produk/i);

    fireEvent.change(fileInput, { target: { files: [nonCsvFile] } });

    expect(await screen.findByText(/Hanya berkas format .csv yang didukung/i)).toBeInTheDocument();
  });

  it('memproses berkas CSV valid, menampilkan pratinjau dan metrik valid', async () => {
    render(<ProductImportModal {...defaultProps} />);

    const validCsvContent = `name,categoryName,productType,price,cost,stockQty,minStockAlert,barcode\nMangga Harum Manis,Buah Lokal,WEIGHT,35000,24000,50,10,2001234567891\nApel Washington,Buah Impor,UNIT,12000,8000,100,20,`;
    const csvFile = new File([validCsvContent], 'produk-valid.csv', { type: 'text/csv' });

    const fileInput = screen.getByLabelText(/Pilih berkas CSV produk/i);
    await userEvent.upload(fileInput, csvFile);

    // Verifikasi nama berkas tampil
    expect(await screen.findByText('produk-valid.csv')).toBeInTheDocument();
    // Verifikasi nama produk dalam pratinjau tabel
    expect(screen.getByText('Mangga Harum Manis')).toBeInTheDocument();
    expect(screen.getByText('Apel Washington')).toBeInTheDocument();

    // Verifikasi ringkasan metrik
    expect(screen.getByText('Valid (Siap Impor)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Impor 2 Produk Valid/i })).toBeInTheDocument();
  });

  it('mendeteksi baris tidak valid dan menandainya dalam pratinjau', async () => {
    render(<ProductImportModal {...defaultProps} />);

    // Baris 2 harga 0 (tidak valid), tipe invalid
    const invalidCsv = `name,categoryName,productType,price\nValid Fruit,Buah Lokal,WEIGHT,15000\nBad Fruit,Buah Lokal,UNKNOWN,0`;
    const csvFile = new File([invalidCsv], 'produk-invalid.csv', { type: 'text/csv' });

    const fileInput = screen.getByLabelText(/Pilih berkas CSV produk/i);
    await userEvent.upload(fileInput, csvFile);

    expect(await screen.findByText('produk-invalid.csv')).toBeInTheDocument();
    expect(screen.getByText(/1 baris tidak memenuhi syarat/i)).toBeInTheDocument();
  });

  it('melakukan impor batch saat tombol submit ditekan dan memanggil onSuccess', async () => {
    vi.mocked(productApi.batchImportProducts).mockResolvedValueOnce({
      totalProcessed: 1,
      importedCount: 1,
      failedCount: 0,
      errors: [],
      createdProductIds: ['new-p-1'],
    });

    render(<ProductImportModal {...defaultProps} />);

    const validCsvContent = `name,categoryName,productType,price\nJeruk Sunkist,Buah Impor,UNIT,8000`;
    const csvFile = new File([validCsvContent], 'jeruk.csv', { type: 'text/csv' });

    const fileInput = screen.getByLabelText(/Pilih berkas CSV produk/i);
    await userEvent.upload(fileInput, csvFile);

    const submitBtn = await screen.findByRole('button', { name: /Impor 1 Produk Valid/i });
    await userEvent.click(submitBtn);

    await waitFor(() => {
      expect(productApi.batchImportProducts).toHaveBeenCalledTimes(1);
      expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/1 Produk Berhasil Disimpan/i)).toBeInTheDocument();
    });
  });

  it('menangani error dari server saat proses impor batch gagal', async () => {
    vi.mocked(productApi.batchImportProducts).mockRejectedValueOnce(
      new Error('Koneksi database terputus'),
    );

    render(<ProductImportModal {...defaultProps} />);

    const validCsv = `name,categoryName,productType,price\nDurian Montong,Buah Lokal,WEIGHT,60000`;
    const csvFile = new File([validCsv], 'durian.csv', { type: 'text/csv' });

    const fileInput = screen.getByLabelText(/Pilih berkas CSV produk/i);
    await userEvent.upload(fileInput, csvFile);

    const submitBtn = await screen.findByRole('button', { name: /Impor 1 Produk Valid/i });
    await userEvent.click(submitBtn);

    expect(await screen.findByText(/Koneksi database terputus/i)).toBeInTheDocument();
  });
});
