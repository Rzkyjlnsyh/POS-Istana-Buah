import type { CategoryDto } from '@istana-buah/shared';
import { useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Modal } from '../../../components/ui/modal';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { FrontendApiError } from '../../../lib/api/api-error';
import { deleteCategory } from '../api/category-api';

export interface CategoryDeleteModalProps {
  isOpen: boolean;
  category: CategoryDto | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function CategoryDeleteModal({
  isOpen,
  category,
  onClose,
  onDeleted,
}: CategoryDeleteModalProps) {
  const isOnline = useNetworkStatus();
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!category) {
    return null;
  }

  const hasLinkedProducts = category.productCount > 0;

  const handleDelete = async () => {
    if (!isOnline) {
      setErrorMessage(
        'Perangkat sedang luring. Penghapusan kategori memerlukan koneksi jaringan ke server.',
      );
      return;
    }

    setIsDeleting(true);
    setErrorMessage(null);

    try {
      await deleteCategory(category.id);
      onDeleted(category.id);
      onClose();
    } catch (err: unknown) {
      if (err instanceof FrontendApiError) {
        if (err.code === 'CATEGORY_IN_USE') {
          setErrorMessage(
            `Kategori tidak dapat dihapus karena masih digunakan oleh ${String(
              category.productCount,
            )} produk aktif. Pindahkan produk ke kategori lain terlebih dahulu.`,
          );
        } else {
          setErrorMessage(err.message);
        }
      } else {
        setErrorMessage('Gagal menghapus kategori. Silakan coba kembali.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Konfirmasi Hapus Kategori"
      description="Tindakan ini akan menonaktifkan kategori produk dari sistem kasir."
      size="sm"
    >
      <div className="space-y-4">
        {errorMessage ? (
          <Alert variant="danger" title="Penghapusan Ditolak">
            {errorMessage}
          </Alert>
        ) : null}

        {hasLinkedProducts ? (
          <Alert variant="warning" title="Kategori Memiliki Produk Terkait">
            Kategori ini masih memuat{' '}
            <span className="font-bold text-ink-primary">{category.productCount} produk aktif</span>
            . Sesuai aturan bisnis, kategori yang masih memiliki produk tidak dapat dihapus langsung
            untuk menjaga konsistensi transaksi kasir.
          </Alert>
        ) : (
          <p className="text-sm leading-relaxed text-ink-secondary">
            Apakah Anda yakin ingin menghapus kategori{' '}
            <span className="font-bold text-ink-primary">"{category.name}"</span>? Kategori ini
            tidak akan lagi muncul pada katalog produk maupun opsi pencarian meja kasir.
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isDeleting}>
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            isLoading={isDeleting}
            loadingText="Menghapus..."
            disabled={!isOnline || hasLinkedProducts}
            onClick={() => void handleDelete()}
          >
            Hapus Kategori
          </Button>
        </div>
      </div>
    </Modal>
  );
}
