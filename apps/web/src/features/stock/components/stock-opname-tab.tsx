import type { CategoryDto, ProductDto, StockOpnameDto } from '@istana-buah/shared';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileText,
  Layers,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { formatQuantity, formatTransactionDateTime } from '../../pos/utils/formatters';
import { createStockOpname, finalizeStockOpname, getStockOpnames } from '../api/stock-api';
import {
  calculateVariancePercent,
  formatSignedStockQty,
  OPNAME_STATUS_META,
} from '../utils/stock-meta';
import { StockProductPicker } from './stock-product-picker';

interface OpnameDraftRow {
  product: ProductDto;
  physicalQty: string;
  notes: string;
}

interface HighVarianceItem {
  name: string;
  productType: ProductDto['productType'];
  systemQty: number;
  physicalQty: number;
  variancePercent: number;
}

const OPNAME_VARIANCE_WARNING_PERCENT = 10;

export interface StockOpnameTabProps {
  products: ProductDto[];
  categories: CategoryDto[];
  onStockUpdated: () => void;
}

/**
 * Tab Stok Opname (M04-002 / US-STK-002):
 * - Hitung stok fisik vs stok sistem secara akurat.
 * - Menampilkan modal konfirmasi bila selisih > 10% sebelum finalisasi.
 * - Mendukung mode Draft & Finalisasi dari daftar riwayat opname.
 */
export function StockOpnameTab({ products, categories, onStockUpdated }: StockOpnameTabProps) {
  const categoryLoadId = useId();
  const docNotesId = useId();

  const [selectedCategoryForBulk, setSelectedCategoryForBulk] = useState<string>('');
  const [rows, setRows] = useState<OpnameDraftRow[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [pendingHighVarianceAction, setPendingHighVarianceAction] = useState<
    | { type: 'CREATE'; flagged: HighVarianceItem[] }
    | { type: 'FINALIZE_DRAFT'; opname: StockOpnameDto; flagged: HighVarianceItem[] }
    | null
  >(null);

  // Riwayat dokumen opname
  const [opnames, setOpnames] = useState<StockOpnameDto[]>([]);
  const [isLoadingOpnames, setIsLoadingOpnames] = useState(true);
  const [viewingOpname, setViewingOpname] = useState<StockOpnameDto | null>(null);

  const loadOpnames = useCallback(async () => {
    setIsLoadingOpnames(true);
    try {
      const res = await getStockOpnames({ page: 1, limit: 10 });
      setOpnames(res.items);
    } catch {
      // Abaikan diam-diam agar form opname utama tetap dapat dipakai
    } finally {
      setIsLoadingOpnames(false);
    }
  }, []);

  useEffect(() => {
    void loadOpnames();
  }, [loadOpnames]);

  const selectedIds = useMemo(() => new Set(rows.map((r) => r.product.id)), [rows]);

  const appendProduct = (product: ProductDto) => {
    setErrorMessage(null);
    setRows((prev) => {
      if (prev.some((r) => r.product.id === product.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          product,
          physicalQty: String(Number(product.stockQty)),
          notes: '',
        },
      ];
    });
  };

  const handleLoadByCategory = () => {
    const active = products.filter(
      (p) => p.isActive && (!selectedCategoryForBulk || p.categoryId === selectedCategoryForBulk),
    );
    setRows((prev) => {
      const existing = new Set(prev.map((r) => r.product.id));
      const added = active
        .filter((p) => !existing.has(p.id))
        .map((p) => ({
          product: p,
          physicalQty: String(Number(p.stockQty)),
          notes: '',
        }));
      return [...prev, ...added];
    });
  };

  const updateRowField = (productId: string, field: 'physicalQty' | 'notes', val: string) => {
    setRows((prev) => prev.map((r) => (r.product.id === productId ? { ...r, [field]: val } : r)));
  };

  const removeRow = (productId: string) => {
    setRows((prev) => prev.filter((r) => r.product.id !== productId));
  };

  const buildPayloadAndValidate = () => {
    if (rows.length === 0) {
      setErrorMessage('Tambahkan minimal satu produk ke lembar opname.');
      return null;
    }

    const itemsPayload: Array<{ productId: string; physicalQty: number; notes: string | null }> =
      [];
    const flagged: HighVarianceItem[] = [];

    for (const row of rows) {
      const physical = Number(row.physicalQty);
      if (row.physicalQty.trim() === '' || !Number.isFinite(physical) || physical < 0) {
        setErrorMessage(`Kuantitas fisik "${row.product.name}" harus berupa angka >= 0.`);
        return null;
      }
      const systemQty = Number(row.product.stockQty);
      const variance = calculateVariancePercent(systemQty, physical);
      if (variance > OPNAME_VARIANCE_WARNING_PERCENT) {
        flagged.push({
          name: row.product.name,
          productType: row.product.productType,
          systemQty,
          physicalQty: physical,
          variancePercent: variance,
        });
      }

      itemsPayload.push({
        productId: row.product.id,
        physicalQty: physical,
        notes: row.notes.trim() || null,
      });
    }

    return { itemsPayload, flagged };
  };

  const submitOpname = async (finalize: boolean, bypassConfirm = false) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    const validated = buildPayloadAndValidate();
    if (!validated) return;

    if (finalize && !bypassConfirm && validated.flagged.length > 0) {
      setPendingHighVarianceAction({ type: 'CREATE', flagged: validated.flagged });
      return;
    }

    setIsSubmitting(true);
    try {
      const saved = await createStockOpname({
        items: validated.itemsPayload,
        notes: notes.trim() || null,
        finalize,
      });
      setRows([]);
      setNotes('');
      setPendingHighVarianceAction(null);
      setSuccessMessage(
        saved.status === 'COMPLETED'
          ? `Opname ${saved.referenceNo} berhasil difinalisasi (${saved.adjustedItemsCount} produk disesuaikan).`
          : `Draft opname ${saved.referenceNo} berhasil disimpan.`,
      );
      await loadOpnames();
      if (saved.status === 'COMPLETED') {
        onStockUpdated();
      }
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalizeDraftClick = async (opname: StockOpnameDto, bypassConfirm = false) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!bypassConfirm) {
      const flagged: HighVarianceItem[] = [];
      for (const item of opname.items) {
        const sys = Number(item.systemQty);
        const phy = Number(item.physicalQty);
        const variance = calculateVariancePercent(sys, phy);
        if (variance > OPNAME_VARIANCE_WARNING_PERCENT) {
          flagged.push({
            name: item.productName,
            productType: item.productType,
            systemQty: sys,
            physicalQty: phy,
            variancePercent: variance,
          });
        }
      }
      if (flagged.length > 0) {
        setPendingHighVarianceAction({ type: 'FINALIZE_DRAFT', opname, flagged });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const finalized = await finalizeStockOpname(opname.id);
      setPendingHighVarianceAction(null);
      setSuccessMessage(
        `Draft opname ${finalized.referenceNo} berhasil difinalisasi dan stok disesuaikan.`,
      );
      await loadOpnames();
      onStockUpdated();
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {errorMessage ? (
        <Alert variant="danger" title="Gagal memproses stok opname">
          {errorMessage}
        </Alert>
      ) : null}

      {successMessage ? (
        <Alert variant="success" title="Stok Opname Tersimpan">
          {successMessage}
        </Alert>
      ) : null}

      <div className="space-y-4 rounded-xl border border-border-subtle bg-surface-subtle/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label
              htmlFor={categoryLoadId}
              className="mb-1.5 block text-sm font-medium text-ink-primary"
            >
              Muat Cepat Per Kategori
            </label>
            <select
              id={categoryLoadId}
              value={selectedCategoryForBulk}
              onChange={(e) => setSelectedCategoryForBulk(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3.5 text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
            >
              <option value="">Semua Kategori Aktif</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={handleLoadByCategory}>
            <Layers className="h-4 w-4" aria-hidden="true" />
            <span>Muat Produk Kategori</span>
          </Button>
        </div>

        <StockProductPicker
          products={products}
          excludedProductIds={selectedIds}
          onSelectProduct={appendProduct}
          label="Tambah Produk Satuan ke Lembar Opname"
        />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface-subtle/40 px-4 py-8 text-center text-sm text-ink-muted">
          Belum ada produk di lembar opname. Pilih produk di atas atau muat per kategori untuk
          memulai pemeriksaan fisik.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-panel">
            <div className="hidden border-b border-border-subtle bg-surface-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-secondary md:grid md:grid-cols-12 md:gap-3">
              <span className="col-span-3">Produk</span>
              <span className="col-span-2 text-right">Stok Sistem</span>
              <span className="col-span-2">Stok Fisik</span>
              <span className="col-span-2 text-right">Selisih</span>
              <span className="col-span-2">Catatan Item</span>
              <span className="col-span-1 text-right">Hapus</span>
            </div>

            <div className="divide-y divide-border-subtle">
              {rows.map((row) => {
                const sysQty = Number(row.product.stockQty);
                const phyQty = Number(row.physicalQty);
                const isValidPhy =
                  row.physicalQty.trim() !== '' && Number.isFinite(phyQty) && phyQty >= 0;
                const diff = isValidPhy ? phyQty - sysQty : 0;
                const variance = isValidPhy ? calculateVariancePercent(sysQty, phyQty) : 0;
                const highDiff = variance > OPNAME_VARIANCE_WARNING_PERCENT;

                return (
                  <div
                    key={row.product.id}
                    className="grid grid-cols-1 gap-3 p-3.5 md:grid-cols-12 md:items-center md:px-4 md:py-3"
                  >
                    <div className="flex items-start justify-between gap-2 md:col-span-3">
                      <div>
                        <p className="font-semibold text-ink-primary md:font-medium">
                          {row.product.name}
                        </p>
                        <p className="text-xs text-ink-muted tabular-nums md:hidden">
                          Sistem: {formatQuantity(sysQty, row.product.productType)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="md:hidden"
                        aria-hidden="true"
                        tabIndex={-1}
                        onClick={() => removeRow(row.product.id)}
                      >
                        <Trash2 className="h-4 w-4 text-semantic-danger-ink" />
                      </Button>
                    </div>

                    <div className="hidden text-right text-sm tabular-nums text-ink-secondary md:col-span-2 md:block">
                      {formatQuantity(sysQty, row.product.productType)}
                    </div>

                    <div className="md:col-span-2">
                      <span className="mb-1 block text-xs font-medium text-ink-secondary md:sr-only">
                        Stok Fisik
                      </span>
                      <Input
                        type="number"
                        step={row.product.productType === 'WEIGHT' ? '0.001' : '1'}
                        min="0"
                        aria-label={`Stok fisik ${row.product.name}`}
                        value={row.physicalQty}
                        onChange={(e) =>
                          updateRowField(row.product.id, 'physicalQty', e.target.value)
                        }
                        className="text-right tabular-nums"
                      />
                    </div>

                    <div className="flex items-center justify-between tabular-nums md:col-span-2 md:flex-col md:items-end">
                      <span className="text-xs text-ink-muted md:hidden">Selisih</span>
                      <span
                        className={cn(
                          'text-sm font-semibold',
                          diff < 0
                            ? 'text-semantic-danger-ink'
                            : diff > 0
                              ? 'text-primary-800'
                              : 'text-ink-muted',
                        )}
                      >
                        {isValidPhy ? formatSignedStockQty(diff, row.product.productType) : '-'}
                      </span>
                      {highDiff ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-semantic-warning-ink">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          Selisih {Math.round(variance)}%
                        </span>
                      ) : null}
                    </div>

                    <div className="md:col-span-2">
                      <Input
                        value={row.notes}
                        aria-label={`Catatan opname ${row.product.name}`}
                        onChange={(e) => updateRowField(row.product.id, 'notes', e.target.value)}
                        placeholder="Alasan selisih..."
                        maxLength={255}
                      />
                    </div>

                    <div className="hidden text-right md:col-span-1 md:block">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Hapus ${row.product.name} dari opname`}
                        onClick={() => removeRow(row.product.id)}
                      >
                        <Trash2 className="h-4 w-4 text-semantic-danger-ink" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div className="flex-1">
              <label
                htmlFor={docNotesId}
                className="mb-1.5 block text-sm font-medium text-ink-primary"
              >
                Catatan Dokumen Opname
              </label>
              <Input
                id={docNotesId}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Contoh: Opname rutin mingguan rak buah..."
                maxLength={500}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={() => void submitOpname(false)}
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                <span>Simpan Draft</span>
              </Button>
              <Button type="button" disabled={isSubmitting} onClick={() => void submitOpname(true)}>
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                <span>{isSubmitting ? 'Menyimpan...' : 'Finalisasi Opname'}</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Riwayat Dokumen Opname */}
      <div className="space-y-3 border-t border-border-subtle pt-5">
        <h2 className="text-base font-semibold text-ink-primary">Riwayat Dokumen Stok Opname</h2>

        {isLoadingOpnames ? (
          <p className="text-sm text-ink-muted">Memuat riwayat opname...</p>
        ) : opnames.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada dokumen stok opname tersimpan.</p>
        ) : (
          <div className="space-y-2">
            {opnames.map((op) => {
              const statusMeta = OPNAME_STATUS_META[op.status];
              return (
                <div
                  key={op.id}
                  className="flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-panel p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink-primary tabular-nums">
                        {op.referenceNo}
                      </span>
                      <span
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                          statusMeta.badgeClass,
                        )}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted">
                      Petugas: {op.conductorName} &bull; {op.totalItems} item (
                      {op.adjustedItemsCount} penyesuaian) &bull;{' '}
                      {formatTransactionDateTime(op.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" onClick={() => setViewingOpname(op)}>
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      <span>Detail</span>
                    </Button>
                    {op.status === 'DRAFT' ? (
                      <Button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => void handleFinalizeDraftClick(op)}
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>Finalisasi</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Konfirmasi Selisih > 10% (US-STK-002) */}
      <Modal
        isOpen={pendingHighVarianceAction !== null}
        onClose={() => setPendingHighVarianceAction(null)}
        title="Konfirmasi Selisih Stok > 10%"
        description="Beberapa produk memiliki penyimpangan lebih dari 10% terhadap stok sistem."
      >
        <div className="space-y-4">
          <Alert variant="warning" title="Periksa ulang kuantitas fisik sebelum finalisasi">
            Penyesuaian ini akan langsung mengubah saldo stok barang dan tercatat di audit log.
          </Alert>

          <ul className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border-subtle bg-surface-subtle/40 p-3 text-sm tabular-nums">
            {pendingHighVarianceAction?.flagged.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink-primary">{item.name}</span>
                <span className="text-xs text-ink-secondary">
                  {formatQuantity(item.systemQty, item.productType)} &rarr;{' '}
                  <strong className="text-ink-primary">
                    {formatQuantity(item.physicalQty, item.productType)}
                  </strong>{' '}
                  ({Math.round(item.variancePercent)}%)
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPendingHighVarianceAction(null)}
            >
              Periksa Kembali
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                if (pendingHighVarianceAction?.type === 'CREATE') {
                  void submitOpname(true, true);
                } else if (pendingHighVarianceAction?.type === 'FINALIZE_DRAFT') {
                  void handleFinalizeDraftClick(pendingHighVarianceAction.opname, true);
                }
              }}
            >
              <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
              <span>Ya, Finalisasi Opname</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Detail Dokumen Opname */}
      <Modal
        isOpen={viewingOpname !== null}
        onClose={() => setViewingOpname(null)}
        title={viewingOpname ? `Detail Opname ${viewingOpname.referenceNo}` : 'Detail Opname'}
        size="lg"
      >
        {viewingOpname ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-border-subtle bg-surface-subtle/40 p-3 text-sm sm:grid-cols-2">
              <p>
                <span className="text-ink-muted">Petugas:</span>{' '}
                <strong className="text-ink-primary">{viewingOpname.conductorName}</strong>
              </p>
              <p>
                <span className="text-ink-muted">Status:</span>{' '}
                <strong className="text-ink-primary">
                  {OPNAME_STATUS_META[viewingOpname.status].label}
                </strong>
              </p>
              {viewingOpname.notes ? (
                <p className="sm:col-span-2 text-ink-secondary">Catatan: {viewingOpname.notes}</p>
              ) : null}
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-border-subtle">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border-subtle bg-surface-subtle text-xs font-semibold text-ink-secondary">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">
                      Produk
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Sistem
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Fisik
                    </th>
                    <th scope="col" className="px-3 py-2.5 text-right">
                      Selisih
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {viewingOpname.items.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 font-medium text-ink-primary">{it.productName}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-secondary">
                        {formatQuantity(Number(it.systemQty), it.productType)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-primary">
                        {formatQuantity(Number(it.physicalQty), it.productType)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {formatSignedStockQty(it.difference, it.productType)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
