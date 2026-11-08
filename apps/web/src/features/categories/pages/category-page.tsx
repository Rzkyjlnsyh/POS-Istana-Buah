import type { CategoryDto } from '@istana-buah/shared';
import { FolderPlus, Layers, Pencil, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useNetworkStatus } from '../../../hooks/use-network-status';
import { FrontendApiError } from '../../../lib/api/api-error';
import { getCategories } from '../api/category-api';
import { CategoryDeleteModal } from '../components/category-delete-modal';
import { CategoryFormModal } from '../components/category-form-modal';

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export function CategoryPage() {
  const isOnline = useNetworkStatus();

  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Modal dialog states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<CategoryDto | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryDto | null>(null);

  const loadCategories = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const items = await getCategories();
      setCategories(items);
    } catch (err: unknown) {
      if (err instanceof FrontendApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Gagal memuat daftar kategori produk. Silakan coba lagi.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  // Saring data berdasarkan kata kunci pencarian dan status filter
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesSearch =
        searchQuery.trim().length === 0 ||
        cat.name.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (cat.description &&
          cat.description.toLowerCase().includes(searchQuery.toLowerCase().trim()));

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && cat.isActive) ||
        (statusFilter === 'INACTIVE' && !cat.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [categories, searchQuery, statusFilter]);

  const handleOpenCreate = () => {
    setCategoryToEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (category: CategoryDto) => {
    setCategoryToEdit(category);
    setIsFormOpen(true);
  };

  const handleOpenDelete = (category: CategoryDto) => {
    setCategoryToDelete(category);
    setIsDeleteOpen(true);
  };

  const handleSaved = (savedCategory: CategoryDto) => {
    setCategories((prev) => {
      const exists = prev.some((c) => c.id === savedCategory.id);
      if (exists) {
        return prev.map((c) => (c.id === savedCategory.id ? savedCategory : c));
      }
      return [...prev, savedCategory].sort((a, b) => a.sortOrder - b.sortOrder);
    });

    const actionText = categoryToEdit ? 'diperbarui' : 'ditambahkan';
    setSuccessBanner(`Kategori "${savedCategory.name}" berhasil ${actionText}.`);
  };

  const handleDeleted = (deletedId: string) => {
    const deletedCat = categories.find((c) => c.id === deletedId);
    setCategories((prev) => prev.filter((c) => c.id !== deletedId));
    setSuccessBanner(`Kategori "${deletedCat?.name ?? ''}" berhasil dihapus.`);
  };

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
            Kategori Produk
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Kelola pengelompokan komoditas buah segar untuk penataan rak dan pencarian cepat di meja
            kasir.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadCategories()}
            disabled={isLoading}
            aria-label="Muat ulang daftar kategori"
            className="hidden sm:inline-flex"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'motion-safe:animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleOpenCreate}
            disabled={!isOnline}
            className="w-full sm:w-auto"
          >
            <FolderPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Tambah Kategori</span>
          </Button>
        </div>
      </div>

      {/* Notifikasi Status Berhasil */}
      {successBanner ? (
        <Alert variant="success" className="relative pr-10">
          <p>{successBanner}</p>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            aria-label="Tutup pesan sukses"
            className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-ink-secondary hover:bg-semantic-success-bg/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </Alert>
      ) : null}

      {/* Notifikasi Error */}
      {errorMessage ? (
        <Alert variant="danger" title="Terjadi Kesalahan">
          <p>{errorMessage}</p>
          <div className="mt-2">
            <Button
              type="button"
              variant="secondary"
              size="default"
              onClick={() => void loadCategories()}
            >
              Coba Lagi
            </Button>
          </div>
        </Alert>
      ) : null}

      {/* Filter & Bar Pencarian */}
      <div className="rounded-2xl border border-border-subtle bg-surface-panel p-4 shadow-panel sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Kolom Pencarian */}
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama atau deskripsi kategori..."
              className="pl-10 pr-9"
              aria-label="Cari kategori produk"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Hapus kata kunci pencarian"
                className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          {/* Tab Filter Status */}
          <div
            role="group"
            aria-label="Filter status kategori"
            className="inline-flex rounded-xl border border-border-strong bg-surface-subtle p-1"
          >
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              aria-pressed={statusFilter === 'ALL'}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                statusFilter === 'ALL'
                  ? 'bg-surface-panel text-ink-primary shadow-xs'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Semua ({categories.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('ACTIVE')}
              aria-pressed={statusFilter === 'ACTIVE'}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                statusFilter === 'ACTIVE'
                  ? 'bg-surface-panel text-ink-primary shadow-xs'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Aktif ({categories.filter((c) => c.isActive).length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('INACTIVE')}
              aria-pressed={statusFilter === 'INACTIVE'}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                statusFilter === 'INACTIVE'
                  ? 'bg-surface-panel text-ink-primary shadow-xs'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Nonaktif ({categories.filter((c) => !c.isActive).length})
            </button>
          </div>
        </div>
      </div>

      {/* Konten Utama Tabel / Kartu */}
      <div className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-panel shadow-panel">
        {isLoading ? (
          <div
            role="status"
            aria-busy="true"
            className="flex flex-col items-center justify-center p-12 text-center text-sm font-medium text-ink-secondary"
          >
            <RefreshCw
              className="h-8 w-8 motion-safe:animate-spin text-primary-700"
              aria-hidden="true"
            />
            <p className="mt-3">Memuat data kategori produk...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-subtle text-ink-muted">
              <Layers className="h-7 w-7" aria-hidden="true" />
            </div>
            <h2 className="mt-4 text-base font-bold text-ink-primary">
              {searchQuery ? 'Kategori Tidak Ditemukan' : 'Belum Ada Kategori Produk'}
            </h2>
            <p className="mt-1.5 max-w-sm text-sm text-ink-secondary">
              {searchQuery
                ? `Tidak ditemukan kategori yang sesuai dengan kata kunci "${searchQuery}".`
                : 'Buat kategori pertama untuk mulai mengelompokkan katalog buah di toko.'}
            </p>
            {!searchQuery ? (
              <div className="mt-5">
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleOpenCreate}
                  disabled={!isOnline}
                >
                  <FolderPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Tambah Kategori Sekarang</span>
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {/* Tampilan Desktop Table (>= 768px) */}
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border-subtle bg-surface-subtle/60 text-xs font-semibold text-ink-secondary">
                  <tr>
                    <th scope="col" className="w-16 px-4 py-3.5 text-center">
                      Urutan
                    </th>
                    <th scope="col" className="px-5 py-3.5">
                      Kategori & Deskripsi
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-center">
                      Produk Terkait
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-center">
                      Status Kasir
                    </th>
                    <th scope="col" className="px-5 py-3.5 text-right">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filteredCategories.map((category) => (
                    <tr key={category.id} className="transition-colors hover:bg-surface-subtle/40">
                      <td className="px-4 py-4 text-center font-mono text-xs font-semibold text-ink-muted">
                        #{category.sortOrder}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-ink-primary">{category.name}</div>
                        {category.description ? (
                          <p className="mt-0.5 text-xs text-ink-secondary line-clamp-1">
                            {category.description}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center rounded-full bg-surface-subtle px-2.5 py-1 text-xs font-medium text-ink-primary">
                          {category.productCount} Produk
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            category.isActive
                              ? 'bg-semantic-success-bg text-semantic-success-ink'
                              : 'bg-surface-subtle text-ink-muted'
                          }`}
                        >
                          {category.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(category)}
                            aria-label={`Edit kategori ${category.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenDelete(category)}
                            aria-label={`Hapus kategori ${category.name}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-semantic-danger-ink transition-colors hover:bg-semantic-danger-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-semantic-danger"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tampilan Mobile Card (< 768px) */}
            <div className="divide-y divide-border-subtle md:hidden">
              {filteredCategories.map((category) => (
                <div key={category.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-ink-muted">
                          #{category.sortOrder}
                        </span>
                        <h2 className="text-sm font-bold text-ink-primary truncate">
                          {category.name}
                        </h2>
                      </div>
                      {category.description ? (
                        <p className="mt-1 text-xs text-ink-secondary line-clamp-2">
                          {category.description}
                        </p>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        category.isActive
                          ? 'bg-semantic-success-bg text-semantic-success-ink'
                          : 'bg-surface-subtle text-ink-muted'
                      }`}
                    >
                      {category.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="font-medium text-ink-secondary">
                      {category.productCount} Produk Terkait
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(category)}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border-strong text-ink-primary hover:bg-surface-subtle"
                        aria-label={`Edit kategori ${category.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDelete(category)}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-semantic-danger-border text-semantic-danger-ink hover:bg-semantic-danger-bg"
                        aria-label={`Hapus kategori ${category.name}`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal Tambah / Edit Kategori */}
      <CategoryFormModal
        isOpen={isFormOpen}
        categoryToEdit={categoryToEdit}
        onClose={() => setIsFormOpen(false)}
        onSaved={handleSaved}
      />

      {/* Modal Konfirmasi Hapus Kategori */}
      <CategoryDeleteModal
        isOpen={isDeleteOpen}
        category={categoryToDelete}
        onClose={() => setIsDeleteOpen(false)}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
