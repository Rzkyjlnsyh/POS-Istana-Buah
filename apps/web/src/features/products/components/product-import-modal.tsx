import {
  generateProductCsvTemplate,
  parseCsv,
  type BatchImportProductItem,
  type BatchImportProductResult,
  type ProductType,
} from '@istana-buah/shared';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { batchImportProducts } from '../api/product-api';

export interface ProductImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRowPreview {
  rowNumber: number;
  name: string;
  categoryName: string;
  productType: ProductType | 'INVALID';
  price: number;
  cost: number | null;
  stockQty: number | null;
  minStockAlert: number | null;
  barcode: string | null;
  description: string | null;
  isValid: boolean;
  errorMessage?: string;
}

export function ProductImportModal({ isOpen, onClose, onSuccess }: ProductImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rows, setRows] = useState<ParsedRowPreview[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<BatchImportProductResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setFile(null);
    setIsDragging(false);
    setRows([]);
    setParseError(null);
    setIsSubmitting(false);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleDownloadTemplate = () => {
    const csvContent = generateProductCsvTemplate();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template-produk-istana-buah.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseFileContent = (csvText: string) => {
    setParseError(null);
    setImportResult(null);

    try {
      const rawRows = parseCsv(csvText);
      if (rawRows.length === 0) {
        setParseError('Berkas CSV kosong atau tidak memiliki baris data produk');
        setRows([]);
        return;
      }

      const parsed: ParsedRowPreview[] = rawRows.map((raw) => {
        const d = raw.data;
        const name = (d.name ?? '').trim();
        const categoryName = (d.categoryname ?? '').trim();
        const rawType = (d.producttype ?? '').trim().toUpperCase();
        const rawPrice = Number((d.price ?? '').replace(/[^0-9.]/g, ''));
        const rawCost = d.cost ? Number(d.cost.replace(/[^0-9.]/g, '')) : null;
        const rawStock = d.stockqty ? Number(d.stockqty.replace(/[^0-9.]/g, '')) : 0;
        const rawMinAlert = d.minstockalert ? Number(d.minstockalert.replace(/[^0-9.]/g, '')) : 10;
        const barcode = (d.barcode ?? '').trim() || null;
        const description = (d.description ?? '').trim() || null;

        const errors: string[] = [];

        if (name.length < 2) {
          errors.push('Nama produk minimal 2 karakter');
        }
        if (categoryName.length === 0) {
          errors.push('Kategori wajib diisi');
        }
        if (rawType !== 'WEIGHT' && rawType !== 'UNIT') {
          errors.push('Tipe produk harus WEIGHT atau UNIT');
        }
        if (Number.isNaN(rawPrice) || rawPrice <= 0) {
          errors.push('Harga jual harus lebih besar dari 0');
        }
        if (rawCost !== null && (Number.isNaN(rawCost) || rawCost < 0)) {
          errors.push('HPP tidak boleh negatif');
        }
        if (barcode && !/^[A-Za-z0-9_-]{3,50}$/.test(barcode)) {
          errors.push('Format barcode tidak valid (3-50 karakter alfanumerik)');
        }

        const isValid = errors.length === 0;

        return {
          rowNumber: raw.rowNumber,
          name: name || `Baris ${String(raw.rowNumber)}`,
          categoryName,
          productType: (rawType === 'WEIGHT' || rawType === 'UNIT' ? rawType : 'INVALID') as
            ProductType | 'INVALID',
          price: Number.isNaN(rawPrice) ? 0 : rawPrice,
          cost: rawCost,
          stockQty: Number.isNaN(rawStock) ? 0 : rawStock,
          minStockAlert: Number.isNaN(rawMinAlert) ? 10 : rawMinAlert,
          barcode,
          description,
          isValid,
          errorMessage: isValid ? undefined : errors.join('; '),
        };
      });

      setRows(parsed);
    } catch {
      setParseError('Gagal memproses berkas CSV. Pastikan format berkas valid.');
      setRows([]);
    }
  };

  const processFile = (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setParseError('Hanya berkas format .csv yang didukung');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === 'string') {
        parseFileContent(text);
      }
    };
    reader.onerror = () => {
      setParseError('Gagal membaca berkas dari perangkat Anda');
    };
    reader.readAsText(selectedFile);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  const validRows = rows.filter((r) => r.isValid);
  const invalidRows = rows.filter((r) => !r.isValid);

  const handleStartImport = async () => {
    if (validRows.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setParseError(null);

    const payload: BatchImportProductItem[] = validRows.map((r) => ({
      name: r.name,
      categoryName: r.categoryName,
      productType: r.productType as ProductType,
      price: r.price,
      cost: r.cost,
      stockQty: r.stockQty,
      minStockAlert: r.minStockAlert,
      barcode: r.barcode,
      description: r.description,
    }));

    try {
      const result = await batchImportProducts(payload);
      setImportResult(result);
      if (result.importedCount > 0) {
        onSuccess();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kegagalan saat impor batch produk';
      setParseError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Impor Produk Massal (CSV)"
      size="xl"
      aria-label="Modal Impor Produk Massal"
    >
      <div className="space-y-5">
        {/* Banner Petunjuk & Download Template */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface-subtle p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                Format Berkas Impor Produk Istana Buah
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Gunakan template resmi untuk memastikan kolom produk timbang (WEIGHT) dan satuan
                (UNIT) terisi akurat. Barcode akan otomatis di-generate jika dikosongkan.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleDownloadTemplate}
            className="flex-shrink-0 w-full sm:w-auto"
          >
            <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Unduh Template CSV
          </Button>
        </div>

        {parseError && (
          <Alert variant="danger" className="py-2.5">
            <span>{parseError}</span>
          </Alert>
        )}

        {/* Status Selesai Impor */}
        {importResult ? (
          <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-emerald-950">
                  Impor Selesai: {importResult.importedCount} Produk Berhasil Disimpan
                </h4>
                <p className="text-xs text-emerald-800 mt-0.5">
                  Total diproses: {importResult.totalProcessed} baris. Produk langsung aktif dan
                  dapat dicari oleh kasir di POS.
                </p>
              </div>
            </div>

            {importResult.failedCount > 0 && (
              <div className="rounded-lg border border-red-200 bg-white p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-red-800">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span>{importResult.failedCount} Baris Gagal Diimpor:</span>
                </div>
                <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto pl-6 list-disc">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>
                      Baris {err.row} {err.name ? `("${err.name}")` : ''}: {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {/* Zona Upload File */}
        {!file ? (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/50'
                : 'border-border-subtle bg-surface-canvas hover:border-emerald-400 hover:bg-surface-subtle'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Pilih berkas CSV produk"
            />
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 mb-3">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-text-primary">
              Klik untuk memilih berkas atau seret & lepas berkas ke sini
            </p>
            <p className="text-xs text-text-muted mt-1">
              Mendukung berkas format .CSV (hingga 500 baris per batch)
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header File Terpilih */}
            <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-subtle px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{file.name}</p>
                  <p className="text-xs text-text-muted">
                    {(file.size / 1024).toFixed(1)} KB • Total {rows.length} baris terbaca
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={resetState}
                disabled={isSubmitting}
                aria-label="Ganti berkas CSV"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5 text-red-500" />
                Ganti Berkas
              </Button>
            </div>

            {/* Metric Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-border-subtle bg-surface-canvas p-3 text-center">
                <span className="text-xs text-text-muted font-medium">Total Baris</span>
                <p className="text-lg font-bold text-text-primary mt-0.5">{rows.length}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-center">
                <span className="text-xs text-emerald-800 font-medium">Valid (Siap Impor)</span>
                <p className="text-lg font-bold text-emerald-700 mt-0.5">{validRows.length}</p>
              </div>
              <div
                className={`rounded-lg border p-3 text-center ${
                  invalidRows.length > 0
                    ? 'border-red-200 bg-red-50/50'
                    : 'border-border-subtle bg-surface-canvas'
                }`}
              >
                <span
                  className={`text-xs font-medium ${
                    invalidRows.length > 0 ? 'text-red-800' : 'text-text-muted'
                  }`}
                >
                  Tidak Valid
                </span>
                <p
                  className={`text-lg font-bold mt-0.5 ${
                    invalidRows.length > 0 ? 'text-red-700' : 'text-text-muted'
                  }`}
                >
                  {invalidRows.length}
                </p>
              </div>
            </div>

            {/* Peringatan jika ada baris tidak valid */}
            {invalidRows.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <span>
                    {invalidRows.length} baris tidak memenuhi syarat validasi dan akan dilewati saat
                    impor:
                  </span>
                </div>
                <div className="max-h-24 overflow-y-auto pl-5 space-y-0.5">
                  {invalidRows.map((inv) => (
                    <p key={inv.rowNumber}>
                      Baris {inv.rowNumber} ({inv.name}): {inv.errorMessage}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Tabel Pratinjau Baris */}
            <div className="rounded-xl border border-border-subtle overflow-hidden">
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs text-text-primary">
                  <thead className="sticky top-0 bg-surface-subtle border-b border-border-subtle text-text-muted uppercase">
                    <tr>
                      <th className="py-2.5 px-3">No</th>
                      <th className="py-2.5 px-3">Nama Produk</th>
                      <th className="py-2.5 px-3">Kategori</th>
                      <th className="py-2.5 px-3">Tipe</th>
                      <th className="py-2.5 px-3 text-right">Harga Jual</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {rows.slice(0, 50).map((r) => (
                      <tr
                        key={r.rowNumber}
                        className={r.isValid ? 'hover:bg-surface-subtle/50' : 'bg-red-50/40'}
                      >
                        <td className="py-2 px-3 font-mono text-text-muted">{r.rowNumber}</td>
                        <td className="py-2 px-3 font-medium">
                          {r.name}
                          {r.barcode && (
                            <span className="block font-mono text-text-muted text-xs">
                              {r.barcode}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3">{r.categoryName}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex px-1.5 py-0.5 rounded text-xs font-semibold ${
                              r.productType === 'WEIGHT'
                                ? 'bg-amber-100 text-amber-800'
                                : r.productType === 'UNIT'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {r.productType}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">
                          {formatRupiah(r.price)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {r.isValid ? (
                            <span className="inline-flex items-center text-emerald-700 font-semibold text-xs">
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              Valid
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center text-red-700 font-semibold text-xs"
                              title={r.errorMessage}
                            >
                              <AlertCircle className="mr-1 h-3.5 w-3.5" />
                              Error
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 50 && (
                <div className="p-2 text-center text-xs text-text-muted bg-surface-subtle border-t border-border-subtle">
                  Menampilkan 50 dari {rows.length} baris produk
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex flex-col-reverse justify-end gap-3 pt-4 border-t border-border-subtle sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            {importResult ? 'Selesai' : 'Batal'}
          </Button>

          {!importResult && file && (
            <Button
              type="button"
              variant="primary"
              onClick={handleStartImport}
              disabled={isSubmitting || validRows.length === 0}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  Mengimpor {validRows.length} Produk...
                </>
              ) : (
                <>
                  <UploadCloud className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Impor {validRows.length} Produk Valid
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
