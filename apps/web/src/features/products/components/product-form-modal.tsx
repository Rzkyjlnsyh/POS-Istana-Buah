import type {
  CategoryDto,
  CreateProductInput,
  ProductDto,
  ProductType,
  UpdateProductInput,
} from '@istana-buah/shared';
import {
  AlertTriangle,
  Barcode as BarcodeIcon,
  Check,
  Package,
  Plus,
  Scale,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Modal } from '../../../components/ui/modal';
import { FrontendApiError } from '../../../lib/api/api-error';
import { createProduct, generateProductBarcode, updateProduct } from '../api/product-api';

export interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  product?: ProductDto | null;
  categories: CategoryDto[];
  onSuccess: (product: ProductDto) => void;
  canViewHpp: boolean;
}

/**
 * Modal form untuk menambah atau mengedit produk dengan validasi dinamis WEIGHT/UNIT (M02-005).
 */
export function ProductFormModal({
  isOpen,
  onClose,
  product,
  categories,
  onSuccess,
  canViewHpp,
}: ProductFormModalProps) {
  const isEditing = Boolean(product);

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [productType, setProductType] = useState<ProductType>('WEIGHT');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [minStockAlert, setMinStockAlert] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [newBarcode, setNewBarcode] = useState('');
  const [priceChangeReason, setPriceChangeReason] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingBarcode, setIsGeneratingBarcode] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (product) {
      setName(product.name);
      setCategoryId(product.categoryId);
      setProductType(product.productType);
      setSellingPrice(
        product.productType === 'WEIGHT'
          ? (product.pricePerKg ?? '')
          : (product.pricePerUnit ?? ''),
      );
      setCostPrice(
        product.productType === 'WEIGHT' ? (product.costPerKg ?? '') : (product.costPerUnit ?? ''),
      );
      setMinStockAlert(product.minStockAlert ?? '');
      setImageUrl(product.imageUrl ?? '');
      setDescription(product.description ?? '');
      setIsActive(product.isActive);
      setBarcodes(product.barcodes.map((b) => b.barcode));
      setPriceChangeReason('');
    } else {
      setName('');
      setCategoryId(categories.length > 0 ? (categories[0]?.id ?? '') : '');
      setProductType('WEIGHT');
      setSellingPrice('');
      setCostPrice('');
      setMinStockAlert('');
      setImageUrl('');
      setDescription('');
      setIsActive(true);
      setBarcodes([]);
      setPriceChangeReason('');
    }

    setNewBarcode('');
    setErrorMessage(null);
    setFieldErrors({});
  }, [isOpen, product, categories]);

  const handleAddBarcode = () => {
    const trimmed = newBarcode.trim();
    if (!trimmed) return;

    if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      setFieldErrors((prev) => ({
        ...prev,
        barcode: 'Barcode hanya boleh berisi alfanumerik, dash (-), atau underscore (_)',
      }));
      return;
    }

    if (barcodes.includes(trimmed)) {
      setFieldErrors((prev) => ({
        ...prev,
        barcode: 'Barcode ini sudah ditambahkan ke daftar',
      }));
      return;
    }

    if (barcodes.length >= 10) {
      setFieldErrors((prev) => ({
        ...prev,
        barcode: 'Maksimal 10 barcode per produk',
      }));
      return;
    }

    setBarcodes((prev) => [...prev, trimmed]);
    setNewBarcode('');
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.barcode;
      return copy;
    });
  };

  const handleRemoveBarcode = (indexToRemove: number) => {
    setBarcodes((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleGenerateBarcode = async () => {
    setIsGeneratingBarcode(true);
    setFieldErrors((prev) => {
      const copy = { ...prev };
      delete copy.barcode;
      return copy;
    });

    try {
      const generated = await generateProductBarcode();
      if (!barcodes.includes(generated)) {
        setBarcodes((prev) => [...prev, generated]);
      }
    } catch {
      setFieldErrors((prev) => ({
        ...prev,
        barcode: 'Gagal membuat barcode otomatis dari server',
      }));
    } finally {
      setIsGeneratingBarcode(false);
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Nama produk wajib diisi';
    } else if (name.trim().length < 2) {
      errors.name = 'Nama produk minimal 2 karakter';
    } else if (name.trim().length > 150) {
      errors.name = 'Nama produk maksimal 150 karakter';
    }

    if (!categoryId) {
      errors.categoryId = 'Kategori wajib dipilih';
    }

    const priceNum = parseFloat(sellingPrice);
    if (!sellingPrice.trim() || isNaN(priceNum) || priceNum <= 0) {
      errors.sellingPrice = 'Harga jual wajib lebih besar dari 0';
    }

    if (costPrice.trim()) {
      const costNum = parseFloat(costPrice);
      if (isNaN(costNum) || costNum < 0) {
        errors.costPrice = 'HPP tidak boleh bernilai negatif';
      }
    }

    if (minStockAlert.trim()) {
      const minStockNum = parseFloat(minStockAlert);
      if (isNaN(minStockNum) || minStockNum < 0) {
        errors.minStockAlert = 'Batas stok minimum tidak boleh bernilai negatif';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const priceNum = parseFloat(sellingPrice);
    const costNum = costPrice.trim() ? parseFloat(costPrice) : undefined;
    const minAlertNum = minStockAlert.trim() ? parseFloat(minStockAlert) : undefined;

    try {
      let savedProduct: ProductDto;

      if (isEditing && product) {
        const updatePayload: UpdateProductInput = {
          name: name.trim(),
          categoryId,
          productType,
          description: description.trim() || null,
          minStockAlert: minAlertNum ?? null,
          imageUrl: imageUrl.trim() || null,
          isActive,
          barcodes,
        };

        if (productType === 'WEIGHT') {
          updatePayload.pricePerKg = priceNum;
          updatePayload.pricePerUnit = null;
          if (canViewHpp) {
            updatePayload.costPerKg = costNum ?? null;
            updatePayload.costPerUnit = null;
          }
        } else {
          updatePayload.pricePerUnit = priceNum;
          updatePayload.pricePerKg = null;
          if (canViewHpp) {
            updatePayload.costPerUnit = costNum ?? null;
            updatePayload.costPerKg = null;
          }
        }

        if (priceChangeReason.trim()) {
          updatePayload.priceChangeReason = priceChangeReason.trim();
        }

        savedProduct = await updateProduct(product.id, updatePayload);
      } else {
        const createPayload: CreateProductInput = {
          name: name.trim(),
          categoryId,
          productType,
          description: description.trim() || null,
          minStockAlert: minAlertNum ?? null,
          imageUrl: imageUrl.trim() || null,
          isActive,
          barcodes: barcodes.length > 0 ? barcodes : undefined,
          pricePerKg: productType === 'WEIGHT' ? priceNum : null,
          pricePerUnit: productType === 'UNIT' ? priceNum : null,
          costPerKg:
            productType === 'WEIGHT' && canViewHpp && costNum !== undefined ? costNum : null,
          costPerUnit:
            productType === 'UNIT' && canViewHpp && costNum !== undefined ? costNum : null,
        };

        savedProduct = await createProduct(createPayload);
      }

      onSuccess(savedProduct);
      onClose();
    } catch (err) {
      if (err instanceof FrontendApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Terjadi kesalahan saat menyimpan data produk.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Produk' : 'Tambah Produk Baru'}
      description={
        isEditing
          ? 'Perbarui harga, stok minimum, atau atribut produk.'
          : 'Daftarkan buah segar atau produk ritel ke dalam katalog kasir.'
      }
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5 text-sm" noValidate>
        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        ) : null}

        {/* Baris Tipe Produk (WEIGHT / UNIT) */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-ink-primary">
            Tipe Penjualan Produk <span className="text-red-500">*</span>
          </Label>
          <div
            className="grid grid-cols-2 gap-3"
            role="radiogroup"
            aria-label="Tipe Penjualan Produk"
          >
            <button
              type="button"
              role="radio"
              aria-checked={productType === 'WEIGHT'}
              onClick={() => setProductType('WEIGHT')}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 font-semibold transition-all min-h-[48px] ${
                productType === 'WEIGHT'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600'
                  : 'border-border-subtle bg-surface-panel text-ink-secondary hover:bg-surface-canvas'
              }`}
            >
              <Scale className="h-4 w-4" aria-hidden="true" />
              <span>Timbang (Kg)</span>
            </button>

            <button
              type="button"
              role="radio"
              aria-checked={productType === 'UNIT'}
              onClick={() => setProductType('UNIT')}
              className={`flex items-center justify-center gap-2 rounded-xl border p-3 font-semibold transition-all min-h-[48px] ${
                productType === 'UNIT'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-600'
                  : 'border-border-subtle bg-surface-panel text-ink-secondary hover:bg-surface-canvas'
              }`}
            >
              <Package className="h-4 w-4" aria-hidden="true" />
              <span>Satuan (Pcs)</span>
            </button>
          </div>
        </div>

        {/* Baris Nama & Kategori */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="product-name" className="text-xs font-bold text-ink-primary">
              Nama Produk <span className="text-red-500">*</span>
            </Label>
            <Input
              id="product-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Apel Fuji RRC Super"
              className={fieldErrors.name ? 'border-red-500 focus:ring-red-500' : ''}
              required
            />
            {fieldErrors.name ? (
              <p className="text-xs font-medium text-red-600">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-category" className="text-xs font-bold text-ink-primary">
              Kategori Produk <span className="text-red-500">*</span>
            </Label>
            <select
              id="product-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-border-subtle bg-surface-panel px-3 py-2 text-sm text-ink-primary focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              required
            >
              <option value="" disabled>
                Pilih kategori...
              </option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {fieldErrors.categoryId ? (
              <p className="text-xs font-medium text-red-600">{fieldErrors.categoryId}</p>
            ) : null}
          </div>
        </div>

        {/* Baris Harga Jual & HPP */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="product-selling-price" className="text-xs font-bold text-ink-primary">
              Harga Jual per {productType === 'WEIGHT' ? 'Kg' : 'Pcs'} (Rp){' '}
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="product-selling-price"
              type="number"
              step={productType === 'WEIGHT' ? '100' : '500'}
              min="0"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder={productType === 'WEIGHT' ? 'Contoh: 35000' : 'Contoh: 15000'}
              className={fieldErrors.sellingPrice ? 'border-red-500 focus:ring-red-500' : ''}
              required
            />
            {fieldErrors.sellingPrice ? (
              <p className="text-xs font-medium text-red-600">{fieldErrors.sellingPrice}</p>
            ) : null}
          </div>

          {canViewHpp ? (
            <div className="space-y-1.5">
              <Label htmlFor="product-cost-price" className="text-xs font-bold text-ink-primary">
                HPP per {productType === 'WEIGHT' ? 'Kg' : 'Pcs'} (Rp){' '}
                <span className="text-xs font-normal text-ink-muted">(Opsional)</span>
              </Label>
              <Input
                id="product-cost-price"
                type="number"
                step="100"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="Contoh: 25000"
                className={fieldErrors.costPrice ? 'border-red-500 focus:ring-red-500' : ''}
              />
              {fieldErrors.costPrice ? (
                <p className="text-xs font-medium text-red-600">{fieldErrors.costPrice}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Baris Stok Minimum & URL Gambar */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="product-min-stock" className="text-xs font-bold text-ink-primary">
              Batas Stok Minimum ({productType === 'WEIGHT' ? 'Kg' : 'Pcs'}){' '}
              <span className="text-xs font-normal text-ink-muted">(Opsional)</span>
            </Label>
            <Input
              id="product-min-stock"
              type="number"
              step={productType === 'WEIGHT' ? '0.1' : '1'}
              min="0"
              value={minStockAlert}
              onChange={(e) => setMinStockAlert(e.target.value)}
              placeholder={productType === 'WEIGHT' ? 'Contoh: 10.5' : 'Contoh: 10'}
              className={fieldErrors.minStockAlert ? 'border-red-500 focus:ring-red-500' : ''}
            />
            {fieldErrors.minStockAlert ? (
              <p className="text-xs font-medium text-red-600">{fieldErrors.minStockAlert}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-image-url" className="text-xs font-bold text-ink-primary">
              URL Foto Produk <span className="text-xs font-normal text-ink-muted">(Opsional)</span>
            </Label>
            <Input
              id="product-image-url"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/foto-buah.jpg"
            />
          </div>
        </div>

        {/* Pengelolaan Barcode */}
        <div className="space-y-2 rounded-xl border border-border-subtle bg-surface-canvas p-4">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
            <Label htmlFor="product-new-barcode" className="text-xs font-bold text-ink-primary">
              Daftar Barcode (EAN-13 / Custom)
            </Label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleGenerateBarcode()}
              disabled={isGeneratingBarcode || barcodes.length >= 10}
              className="h-8 text-xs font-medium text-emerald-800"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {isGeneratingBarcode ? 'Membuat...' : 'Generate Barcode Otomatis'}
            </Button>
          </div>

          <div className="flex gap-2">
            <Input
              id="product-new-barcode"
              type="text"
              value={newBarcode}
              onChange={(e) => setNewBarcode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddBarcode();
                }
              }}
              placeholder="Ketik barcode lalu klik Tambah..."
              className={`h-9 font-mono text-xs ${
                fieldErrors.barcode ? 'border-red-500 focus:ring-red-500' : ''
              }`}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddBarcode}
              disabled={!newBarcode.trim() || barcodes.length >= 10}
              className="h-9 shrink-0 px-3 text-xs"
            >
              <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Tambah
            </Button>
          </div>

          {fieldErrors.barcode ? (
            <p className="text-xs font-medium text-red-600">{fieldErrors.barcode}</p>
          ) : null}

          {barcodes.length > 0 ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {barcodes.map((bc, idx) => (
                <div
                  key={bc}
                  className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-panel px-2.5 py-1 text-xs font-mono text-ink-primary shadow-xs"
                >
                  <BarcodeIcon className="h-3 w-3 text-ink-muted" aria-hidden="true" />
                  <span>{bc}</span>
                  {idx === 0 ? (
                    <span className="rounded bg-emerald-100 px-1 py-0.5 text-xs font-sans font-bold text-emerald-900">
                      Utama
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleRemoveBarcode(idx)}
                    aria-label={`Hapus barcode ${bc}`}
                    className="ml-1 rounded p-0.5 text-ink-muted hover:bg-neutral-100 hover:text-red-600"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-muted italic">
              Belum ada barcode. Anda dapat menambah barcode manual atau klik Generate Barcode.
            </p>
          )}
        </div>

        {/* Deskripsi Produk */}
        <div className="space-y-1.5">
          <Label htmlFor="product-desc" className="text-xs font-bold text-ink-primary">
            Deskripsi Produk <span className="text-xs font-normal text-ink-muted">(Opsional)</span>
          </Label>
          <textarea
            id="product-desc"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Informasi asal kebun, kualitas buah, atau catatan spesifik..."
            className="w-full rounded-xl border border-border-subtle bg-surface-panel px-3 py-2 text-sm text-ink-primary placeholder:text-ink-muted focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>

        {/* Alasan Perubahan Harga (Hanya saat edit dan ada perubahan) */}
        {isEditing ? (
          <div className="space-y-1.5">
            <Label htmlFor="product-price-reason" className="text-xs font-bold text-ink-primary">
              Alasan Perubahan Harga{' '}
              <span className="text-xs font-normal text-ink-muted">
                (Dicatat dalam audit riwayat harga)
              </span>
            </Label>
            <Input
              id="product-price-reason"
              type="text"
              value={priceChangeReason}
              onChange={(e) => setPriceChangeReason(e.target.value)}
              placeholder="Contoh: Kenaikan harga supplier buah impor"
            />
          </div>
        ) : null}

        {/* Checkbox Status Aktif */}
        <label className="flex items-center gap-2.5 cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-border-subtle text-emerald-600 focus:ring-emerald-600"
          />
          <span className="text-xs font-semibold text-ink-primary">
            Status Produk Aktif (Tampil di Kasir & Siap Dijual)
          </span>
        </label>

        {/* Footer Actions */}
        <div className="flex flex-col-reverse justify-end gap-3 pt-3 border-t border-border-subtle sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {isSubmitting ? 'Menyimpan...' : isEditing ? 'Simpan Perubahan' : 'Tambah Produk'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
