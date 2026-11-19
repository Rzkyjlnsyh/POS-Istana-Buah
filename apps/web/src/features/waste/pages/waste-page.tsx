import {
  WASTE_TYPES,
  type ProductDto,
  type WasteRecordDto,
  type WasteType,
} from '@istana-buah/shared';
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { webConfig } from '../../../config/app.config';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import {
  formatQuantity,
  formatRupiah,
  formatTransactionDateTime,
} from '../../pos/utils/formatters';
import { getProducts } from '../../products/api/product-api';
import { getWasteRecords } from '../api/waste-api';
import { WasteRecordModal } from '../components/waste-record-modal';
import { WasteSummaryTab } from '../components/waste-summary-tab';
import { WASTE_TYPE_META } from '../utils/waste-meta';

type WasteTabKey = 'RECORDS' | 'SUMMARY';

/**
 * Halaman Manajemen Penyusutan & Kerusakan Buah (M09-002).
 * Menggabungkan form pencatatan susut otomatis kurangi stok, riwayat penyusutan, dan ringkasan kerugian.
 */
export function WastePage() {
  const searchInputId = useId();
  const typeFilterId = useId();
  const pageSize = webConfig.historyPageSize;

  const [activeTab, setActiveTab] = useState<WasteTabKey>('RECORDS');
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [records, setRecords] = useState<WasteRecordDto[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [page, setPage] = useState(1);

  const [typeFilter, setTypeFilter] = useState<WasteType | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (searchTerm === debouncedSearch) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm, debouncedSearch]);

  const loadProductsCatalog = useCallback(async () => {
    try {
      const res = await getProducts({ limit: 100, isActive: true });
      setProducts(res.items);
    } catch {
      setProducts([]);
    }
  }, []);

  const loadWasteList = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await getWasteRecords({
        page,
        limit: pageSize,
        ...(typeFilter !== 'ALL' ? { wasteType: typeFilter } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      });
      setRecords(res.items);
      setTotalItems(res.meta.total);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, typeFilter, debouncedSearch]);

  useEffect(() => {
    void loadProductsCatalog();
  }, [loadProductsCatalog, refreshToken]);

  useEffect(() => {
    void loadWasteList();
  }, [loadWasteList, refreshToken]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">
            Catatan Penyusutan (Waste)
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Dokumentasikan buah rusak, busuk, atau susut timbangan beserta pengurangan stok otomatis
            dan estimasi kerugian HPP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => {
              setSuccessBanner(null);
              setIsRecordModalOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Catat Penyusutan</span>
          </Button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Navigasi modul penyusutan"
        className="inline-flex rounded-xl border border-border-subtle bg-surface-panel p-1"
      >
        <button
          type="button"
          role="tab"
          id="waste-tab-records"
          aria-selected={activeTab === 'RECORDS'}
          aria-controls="waste-panel-records"
          onClick={() => setActiveTab('RECORDS')}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors',
            activeTab === 'RECORDS'
              ? 'bg-primary-700 text-white'
              : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary',
          )}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span>Daftar Penyusutan</span>
        </button>

        <button
          type="button"
          role="tab"
          id="waste-tab-summary"
          aria-selected={activeTab === 'SUMMARY'}
          aria-controls="waste-panel-summary"
          onClick={() => setActiveTab('SUMMARY')}
          className={cn(
            'inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold transition-colors',
            activeTab === 'SUMMARY'
              ? 'bg-primary-700 text-white'
              : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary',
          )}
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          <span>Laporan Kerugian</span>
        </button>
      </div>

      {successBanner ? (
        <Alert variant="success" title="Berhasil">
          {successBanner}
        </Alert>
      ) : null}

      {activeTab === 'RECORDS' ? (
        <div
          role="tabpanel"
          id="waste-panel-records"
          aria-labelledby="waste-tab-records"
          className="space-y-5"
        >
          <section className="rounded-2xl border border-border-subtle bg-surface-panel p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="grid flex-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor={searchInputId}
                    className="mb-1 block text-xs font-semibold text-ink-secondary"
                  >
                    Cari Produk / Alasan / Petugas
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                      aria-hidden="true"
                    />
                    <Input
                      id={searchInputId}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Ketik kata kunci..."
                      className="pl-9"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={typeFilterId}
                    className="mb-1 block text-xs font-semibold text-ink-secondary"
                  >
                    Jenis Penyusutan
                  </label>
                  <select
                    id={typeFilterId}
                    value={typeFilter}
                    onChange={(e) => {
                      setTypeFilter(e.target.value as WasteType | 'ALL');
                      setPage(1);
                    }}
                    className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 py-2 text-sm text-ink-primary"
                  >
                    <option value="ALL">Semua Jenis</option>
                    {WASTE_TYPES.map((wt) => (
                      <option key={wt} value={wt}>
                        {WASTE_TYPE_META[wt].label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                type="button"
                variant="secondary"
                onClick={() => void loadWasteList()}
                disabled={isLoading}
              >
                <RefreshCw
                  className={cn('h-4 w-4', isLoading && 'animate-spin')}
                  aria-hidden="true"
                />
                <span>Segarkan</span>
              </Button>
            </div>
          </section>

          {errorMessage ? (
            <Alert variant="danger" title="Gagal memuat daftar penyusutan">
              {errorMessage}
            </Alert>
          ) : null}

          <section className="rounded-2xl border border-border-subtle bg-surface-panel p-5">
            {isLoading ? (
              <p className="py-10 text-center text-sm text-ink-muted">
                Memuat daftar penyusutan...
              </p>
            ) : records.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-muted">
                Belum ada catatan penyusutan yang sesuai filter.
              </p>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border-subtle text-xs font-semibold text-ink-secondary">
                        <th className="py-2.5 pr-4">Waktu</th>
                        <th className="py-2.5 pr-4">Produk</th>
                        <th className="py-2.5 pr-4">Jenis</th>
                        <th className="py-2.5 pr-4 text-right">Kuantitas</th>
                        <th className="py-2.5 pr-4 text-right">Kerugian (HPP)</th>
                        <th className="py-2.5 pr-4">Alasan</th>
                        <th className="py-2.5">Petugas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle">
                      {records.map((rec) => {
                        const meta = WASTE_TYPE_META[rec.wasteType];
                        return (
                          <tr key={rec.id} className="hover:bg-surface-subtle/60">
                            <td className="py-3 pr-4 text-xs text-ink-secondary tabular-nums">
                              {formatTransactionDateTime(rec.recordedAt)}
                            </td>
                            <td className="py-3 pr-4">
                              <p className="font-semibold text-ink-primary">{rec.productName}</p>
                              <p className="text-xs text-ink-muted">{rec.categoryName}</p>
                            </td>
                            <td className="py-3 pr-4">
                              <span
                                className={cn(
                                  'inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                                  meta.badgeClass,
                                )}
                              >
                                {meta.label}
                              </span>
                            </td>
                            <td className="py-3 pr-4 text-right font-semibold text-ink-primary tabular-nums">
                              {formatQuantity(Number(rec.quantity), rec.productType)}
                            </td>
                            <td className="py-3 pr-4 text-right font-bold text-semantic-danger-ink tabular-nums">
                              {formatRupiah(Number(rec.estimatedCost))}
                            </td>
                            <td className="py-3 pr-4 text-ink-secondary">
                              <p className="max-w-xs truncate">{rec.reason ?? '-'}</p>
                              {rec.photoUrl ? (
                                <a
                                  href={rec.photoUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
                                >
                                  <span>Lihat Bukti</span>
                                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                </a>
                              ) : null}
                            </td>
                            <td className="py-3 text-xs text-ink-secondary">{rec.recorderName}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y divide-border-subtle md:hidden">
                  {records.map((rec) => {
                    const meta = WASTE_TYPE_META[rec.wasteType];
                    return (
                      <div key={rec.id} className="space-y-1.5 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-ink-primary">{rec.productName}</p>
                            <p className="text-xs text-ink-muted tabular-nums">
                              {formatTransactionDateTime(rec.recordedAt)} · {rec.recorderName}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'inline-flex shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                              meta.badgeClass,
                            )}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-xs text-ink-secondary">{rec.reason ?? '-'}</p>
                        <div className="flex items-center justify-between text-xs tabular-nums">
                          <span className="font-semibold text-ink-primary">
                            {formatQuantity(Number(rec.quantity), rec.productType)}
                          </span>
                          <span className="font-bold text-semantic-danger-ink">
                            Rugi {formatRupiah(Number(rec.estimatedCost))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between border-t border-border-subtle pt-4">
                <p className="text-xs text-ink-muted tabular-nums">
                  Halaman {page} dari {totalPages} ({totalItems} catatan)
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="Halaman sebelumnya"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label="Halaman berikutnya"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <div role="tabpanel" id="waste-panel-summary" aria-labelledby="waste-tab-summary">
          <WasteSummaryTab refreshToken={refreshToken} />
        </div>
      )}

      <WasteRecordModal
        isOpen={isRecordModalOpen}
        products={products}
        onClose={() => setIsRecordModalOpen(false)}
        onSuccess={(created) => {
          setIsRecordModalOpen(false);
          setSuccessBanner(
            `Penyusutan ${created.productName} (${formatQuantity(Number(created.quantity), created.productType)}) dicatat dengan estimasi kerugian ${formatRupiah(Number(created.estimatedCost))}.`,
          );
          setRefreshToken((prev) => prev + 1);
        }}
      />
    </div>
  );
}
