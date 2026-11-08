import type { ProductDto } from '@istana-buah/shared';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { FrontendApiError } from '../../../lib/api/api-error';
import { deleteProduct } from '../api/product-api';

export interface ProductDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductDto | null;
  onSuccess: () => void;
}

/**
 * Modal konfirmasi penghapusan produk (soft delete) (M02-005).
 */
export function ProductDeleteModal({
  isOpen,
  onClose,
  product,
  onSuccess,
}: ProductDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!product) {
    return null;
  }

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteProduct(product.id);
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof FrontendApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Gagal menghapus produk. Silakan coba beberapa saat lagi.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Hapus Produk"
      description="Konfirmasi penonaktifan produk dari katalog penjualan."
      size="default"
    >
      <div className="space-y-4">
        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        ) : null}

        <div className="rounded-xl border border-border-subtle bg-surface-canvas p-4 text-sm">
          <p className="text-ink-secondary">
            Apakah Anda yakin ingin menghapus produk{' '}
            <span className="font-bold text-ink-primary">{product.name}</span>?
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            Kategori: <span className="font-semibold">{product.category.name}</span> | Tipe:{' '}
            <span className="font-semibold">
              {product.productType === 'WEIGHT' ? 'Timbang (Kg)' : 'Satuan (Pcs)'}
            </span>
          </p>
          <p className="mt-2 text-xs leading-relaxed text-amber-700">
            Produk akan dinonaktifkan (soft delete). Riwayat transaksi sebelumnya tetap aman dan
            tersimpan dalam pembukuan.
          </p>
        </div>

        <div className="flex flex-col-reverse justify-end gap-3 pt-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full sm:w-auto"
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => void handleDelete()}
            disabled={isDeleting}
            className="w-full bg-red-600 hover:bg-red-700 sm:w-auto"
          >
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {isDeleting ? 'Menghapus...' : 'Ya, Hapus Produk'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
