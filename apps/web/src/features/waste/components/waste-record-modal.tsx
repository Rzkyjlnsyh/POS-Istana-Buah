import {
  WASTE_TYPES,
  type ProductDto,
  type WasteRecordDto,
  type WasteType,
} from '@istana-buah/shared';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { normalizeApiError } from '../../../lib/api/api-error';
import { formatQuantity, formatRupiah } from '../../pos/utils/formatters';
import { StockProductPicker } from '../../stock/components/stock-product-picker';
import { createWasteRecord } from '../api/waste-api';
import { WASTE_TYPE_META } from '../utils/waste-meta';

interface WasteRecordModalProps {
  isOpen: boolean;
  products: ProductDto[];
  onClose: () => void;
  onSuccess: (created: WasteRecordDto) => void;
}

/**
 * Modal pencatatan penyusutan & buah rusak dengan proyeksi sisa stok serta estimasi rugi HPP (FR-WST-01..06).
 */
export function WasteRecordModal({ isOpen, products, onClose, onSuccess }: WasteRecordModalProps) {
  const typeSelectId = useId();
  const qtyInputId = useId();
  const reasonInputId = useId();
  const photoInputId = useId();

  const [selectedProduct, setSelectedProduct] = useState<ProductDto | null>(null);
  const [wasteType, setWasteType] = useState<WasteType>('ROTTEN');
  const [quantityStr, setQuantityStr] = useState('');
  const [reason, setReason] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedProduct(null);
    setWasteType('ROTTEN');
    setQuantityStr('');
    setReason('');
    setPhotoUrl('');
    setErrorMessage(null);
  }, [isOpen]);

  const parsedQty = Number(quantityStr);
  const productStock = selectedProduct ? Number(selectedProduct.stockQty) : 0;
  const unitCost = useMemo(() => {
    if (!selectedProduct) return 0;
    return Number(
      selectedProduct.productType === 'WEIGHT'
        ? (selectedProduct.costPerKg ?? 0)
        : (selectedProduct.costPerUnit ?? 0),
    );
  }, [selectedProduct]);

  const estimatedLoss = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty * unitCost : 0;
  const projectedRemaining =
    Number.isFinite(parsedQty) && parsedQty > 0
      ? Math.max(0, productStock - parsedQty)
      : productStock;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!selectedProduct) {
      setErrorMessage('Pilih produk buah yang mengalami penyusutan terlebih dahulu.');
      return;
    }

    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setErrorMessage('Jumlah penyusutan harus lebih besar dari 0.');
      return;
    }

    if (selectedProduct.productType === 'UNIT' && !Number.isInteger(parsedQty)) {
      setErrorMessage(
        `Jumlah penyusutan produk satuan "${selectedProduct.name}" harus bilangan bulat (pcs).`,
      );
      return;
    }

    if (parsedQty > productStock) {
      setErrorMessage(
        `Stok "${selectedProduct.name}" hanya tersisa ${formatQuantity(productStock, selectedProduct.productType)}.`,
      );
      return;
    }

    if (reason.trim().length < 3) {
      setErrorMessage('Alasan penyusutan wajib diisi minimal 3 karakter.');
      return;
    }

    const trimmedPhoto = photoUrl.trim();
    if (trimmedPhoto && !/^(https?:\/\/|\/)/i.test(trimmedPhoto)) {
      setErrorMessage('URL foto bukti harus diawali https://, http://, atau path /uploads/.');
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await createWasteRecord({
        productId: selectedProduct.id,
        wasteType,
        quantity: parsedQty,
        reason: reason.trim(),
        ...(trimmedPhoto ? { photoUrl: trimmedPhoto } : {}),
      });
      onSuccess(created);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Catat Penyusutan & Kerusakan Buah"
      description="Stok gudang akan dikurangi otomatis dan dicatat ke mutasi WASTE_OUT."
      size="lg"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        {errorMessage ? (
          <Alert variant="danger" title="Gagal mencatat penyusutan">
            {errorMessage}
          </Alert>
        ) : null}

        {!selectedProduct ? (
          <StockProductPicker
            products={products}
            onSelectProduct={(prod) => setSelectedProduct(prod)}
            label="Pilih Produk Buah"
            placeholder="Ketik nama buah atau scan barcode..."
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle px-4 py-3">
            <div>
              <p className="text-sm font-bold text-ink-primary">{selectedProduct.name}</p>
              <p className="text-xs text-ink-secondary tabular-nums">
                Stok tersedia: {formatQuantity(productStock, selectedProduct.productType)} · HPP{' '}
                {formatRupiah(unitCost)}/{selectedProduct.productType === 'WEIGHT' ? 'kg' : 'pcs'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSelectedProduct(null);
                setQuantityStr('');
              }}
            >
              Ganti Produk
            </Button>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={typeSelectId}
              className="mb-1.5 block text-sm font-medium text-ink-primary"
            >
              Jenis Penyusutan
            </label>
            <select
              id={typeSelectId}
              value={wasteType}
              onChange={(e) => setWasteType(e.target.value as WasteType)}
              className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary"
            >
              {WASTE_TYPES.map((wt) => (
                <option key={wt} value={wt}>
                  {WASTE_TYPE_META[wt].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={qtyInputId}
              className="mb-1.5 block text-sm font-medium text-ink-primary"
            >
              Jumlah Susut ({selectedProduct?.productType === 'UNIT' ? 'pcs' : 'kg'})
            </label>
            <Input
              id={qtyInputId}
              type="number"
              step={selectedProduct?.productType === 'UNIT' ? '1' : '0.001'}
              value={quantityStr}
              onChange={(e) => setQuantityStr(e.target.value)}
              placeholder={selectedProduct?.productType === 'UNIT' ? 'cth: 3' : 'cth: 1.250'}
              className="tabular-nums"
            />
          </div>
        </div>

        {selectedProduct ? (
          <div className="grid gap-3 rounded-xl border border-border-subtle bg-surface-subtle p-3.5 text-xs sm:grid-cols-2">
            <div>
              <p className="text-ink-muted">Proyeksi Sisa Stok</p>
              <p className="mt-0.5 text-sm font-bold text-ink-primary tabular-nums">
                {formatQuantity(projectedRemaining, selectedProduct.productType)}
              </p>
            </div>
            <div>
              <p className="text-ink-muted">Estimasi Kerugian Modal (HPP)</p>
              <p className="mt-0.5 text-sm font-bold text-semantic-danger-ink tabular-nums">
                {formatRupiah(estimatedLoss)}
              </p>
            </div>
          </div>
        ) : null}

        <div>
          <label
            htmlFor={reasonInputId}
            className="mb-1.5 block text-sm font-medium text-ink-primary"
          >
            Alasan / Kronologi
          </label>
          <textarea
            id={reasonInputId}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Jelaskan kondisi buah atau penyebab penyusutan..."
            className="w-full rounded-xl border border-border-strong bg-surface-panel px-3.5 py-2.5 text-sm text-ink-primary placeholder:text-ink-muted focus:border-primary-700 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor={photoInputId}
            className="mb-1.5 block text-sm font-medium text-ink-primary"
          >
            URL Foto Bukti (Opsional)
          </label>
          <Input
            id={photoInputId}
            type="url"
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://... atau /uploads/bukti.jpg"
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Menyimpan...' : 'Simpan Catatan Susut'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
