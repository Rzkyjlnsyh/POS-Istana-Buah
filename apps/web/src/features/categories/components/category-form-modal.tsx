import type { CategoryDto } from '@istana-buah/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Modal } from '../../../components/ui/modal';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { FrontendApiError } from '../../../lib/api/api-error';
import { createCategory, updateCategory } from '../api/category-api';

export interface CategoryFormModalProps {
  isOpen: boolean;
  categoryToEdit?: CategoryDto | null;
  onClose: () => void;
  onSaved: (category: CategoryDto) => void;
}

export function CategoryFormModal({
  isOpen,
  categoryToEdit,
  onClose,
  onSaved,
}: CategoryFormModalProps) {
  const isOnline = useNetworkStatus();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);

  const [errors, setErrors] = useState<{
    name?: string;
    sortOrder?: string;
    general?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (categoryToEdit) {
        setName(categoryToEdit.name);
        setDescription(categoryToEdit.description ?? '');
        setSortOrder(categoryToEdit.sortOrder);
        setIsActive(categoryToEdit.isActive);
      } else {
        setName('');
        setDescription('');
        setSortOrder(0);
        setIsActive(true);
      }
      setErrors({});
      setIsSubmitting(false);
    }
  }, [isOpen, categoryToEdit]);

  const validate = (): boolean => {
    const nextErrors: typeof errors = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      nextErrors.name = 'Nama kategori wajib diisi';
    } else if (trimmedName.length < 2) {
      nextErrors.name = 'Nama kategori minimal 2 karakter';
    } else if (trimmedName.length > 100) {
      nextErrors.name = 'Nama kategori maksimal 100 karakter';
    }

    if (Number.isNaN(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
      nextErrors.sortOrder = 'Urutan harus berupa angka bulat antara 0 hingga 9999';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    if (!isOnline) {
      setErrors({
        general:
          'Perangkat sedang luring (offline). Penyimpanan kategori memerlukan koneksi jaringan.',
      });
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const payload = {
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        sortOrder: Number(sortOrder),
        isActive,
      };

      let result: CategoryDto;
      if (categoryToEdit) {
        result = await updateCategory(categoryToEdit.id, payload);
      } else {
        result = await createCategory(payload);
      }

      onSaved(result);
      onClose();
    } catch (err: unknown) {
      if (err instanceof FrontendApiError) {
        if (err.code === 'DUPLICATE_CATEGORY') {
          setErrors({ name: 'Nama kategori sudah digunakan. Silakan gunakan nama lain.' });
        } else {
          setErrors({ general: err.message });
        }
      } else {
        setErrors({ general: 'Terjadi kesalahan sistem saat menyimpan kategori.' });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditing = Boolean(categoryToEdit);
  const modalTitle = isEditing ? 'Edit Kategori' : 'Tambah Kategori Baru';
  const modalDescription = isEditing
    ? `Perbarui rincian kategori ${categoryToEdit?.name ?? ''}.`
    : 'Daftarkan kelompok buah baru agar kasir dapat menyaring katalog produk dengan cepat.';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} description={modalDescription}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {errors.general ? (
          <Alert variant="danger" title="Gagal Menyimpan Kategori">
            {errors.general}
          </Alert>
        ) : null}

        {!isOnline ? (
          <Alert variant="warning" title="Mode Luring Aktif">
            Koneksi internet terputus. Perubahan data kategori ditangguhkan sampai terhubung
            kembali.
          </Alert>
        ) : null}

        {/* Input Nama Kategori */}
        <div>
          <Label htmlFor="category-name-input">
            Nama Kategori <span className="text-semantic-danger-ink">*</span>
          </Label>
          <div className="mt-1.5">
            <Input
              id="category-name-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) {
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }
              }}
              placeholder="Contoh: Buah Tropis, Jeruk, Apel..."
              hasError={Boolean(errors.name)}
              aria-describedby={errors.name ? 'category-name-error' : undefined}
              maxLength={100}
              required
            />
          </div>
          {errors.name ? (
            <p
              id="category-name-error"
              className="mt-1.5 text-xs font-medium text-semantic-danger-ink"
            >
              {errors.name}
            </p>
          ) : null}
        </div>

        {/* Input Deskripsi */}
        <div>
          <Label htmlFor="category-description-input">Deskripsi (Opsional)</Label>
          <div className="mt-1.5">
            <textarea
              id="category-description-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Catatan tambahan mengenai komoditas dalam kategori ini..."
              rows={3}
              maxLength={500}
              className="flex w-full rounded-xl border border-border-strong bg-surface-panel px-3.5 py-2.5 text-base text-ink-primary transition-colors placeholder:text-ink-muted focus-visible:border-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
            />
          </div>
        </div>

        {/* Grid: Sort Order & Status Aktif */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="category-sort-order-input">Urutan Prioritas</Label>
            <div className="mt-1.5">
              <Input
                id="category-sort-order-input"
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(Number.parseInt(e.target.value, 10) || 0);
                  if (errors.sortOrder) {
                    setErrors((prev) => ({ ...prev, sortOrder: undefined }));
                  }
                }}
                hasError={Boolean(errors.sortOrder)}
                aria-describedby={errors.sortOrder ? 'category-sort-error' : undefined}
              />
            </div>
            {errors.sortOrder ? (
              <p
                id="category-sort-error"
                className="mt-1.5 text-xs font-medium text-semantic-danger-ink"
              >
                {errors.sortOrder}
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-muted">
                Urutan tampil di tab kasir (0 = teratas)
              </p>
            )}
          </div>

          <div className="flex flex-col justify-center pt-2 sm:pt-4">
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-5 w-5 rounded-md border-border-strong text-primary-700 focus:ring-primary-700"
              />
              <div>
                <span className="text-sm font-semibold text-ink-primary">Kategori Aktif</span>
                <p className="text-xs text-ink-muted">Tampilkan kategori ini pada menu kasir</p>
              </div>
            </label>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col-reverse justify-end gap-3 sm:flex-row">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSubmitting}
            loadingText="Menyimpan..."
            disabled={!isOnline}
          >
            {isEditing ? 'Simpan Perubahan' : 'Tambah Kategori'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
