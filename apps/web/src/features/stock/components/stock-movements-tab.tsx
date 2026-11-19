import {
  STOCK_MOVEMENT_TYPES,
  type ProductDto,
  type StockMovementDto,
  type StockMovementType,
} from '@istana-buah/shared';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { webConfig } from '../../../config/app.config';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import {
  formatQuantity,
  formatTransactionDateTime,
  getStoreDateString,
  shiftYmdDate,
  toStoreDayBounds,
} from '../../pos/utils/formatters';
import { getStockMovements } from '../api/stock-api';
import { formatSignedStockQty, STOCK_MOVEMENT_META } from '../utils/stock-meta';

type MovementDatePreset = 'TODAY' | 'LAST_7_DAYS' | 'ALL' | 'CUSTOM';

export interface StockMovementsTabProps {
  products: ProductDto[];
  refreshToken: number;
}

/**
 * Tab Riwayat Mutasi Stok (M04-002): log audit seluruh keluar-masuk barang berpaginasi.
 */
export function StockMovementsTab({ products, refreshToken }: StockMovementsTabProps) {
  const searchId = useId();
  const productFilterId = useId();
  const typeFilterId = useId();
  const startId = useId();
  const endId = useId();

  const todayYmd = useMemo(() => getStoreDateString(), []);

  const [preset, setPreset] = useState<MovementDatePreset>('LAST_7_DAYS');
  const [startYmd, setStartYmd] = useState<string>(() => shiftYmdDate(todayYmd, -6));
  const [endYmd, setEndYmd] = useState<string>(todayYmd);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<StockMovementType | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [movements, setMovements] = useState<StockMovementDto[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const pageSize = webConfig.historyPageSize;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const handlePreset = (nextPreset: Exclude<MovementDatePreset, 'CUSTOM'>) => {
    const currentYmd = getStoreDateString();
    setPreset(nextPreset);
    setPage(1);
    if (nextPreset === 'TODAY') {
      setStartYmd(currentYmd);
      setEndYmd(currentYmd);
    } else if (nextPreset === 'LAST_7_DAYS') {
      setStartYmd(shiftYmdDate(currentYmd, -6));
      setEndYmd(currentYmd);
    } else {
      setStartYmd('');
      setEndYmd('');
    }
  };

  const loadMovements = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const bounds =
        startYmd && endYmd
          ? toStoreDayBounds(startYmd, endYmd)
          : {
              startDate: startYmd ? toStoreDayBounds(startYmd, startYmd).startDate : undefined,
              endDate: endYmd ? toStoreDayBounds(endYmd, endYmd).endDate : undefined,
            };

      const res = await getStockMovements({
        page,
        limit: pageSize,
        ...(selectedProductId ? { productId: selectedProductId } : {}),
        ...(selectedType !== 'ALL' ? { type: selectedType } : {}),
        ...(bounds.startDate ? { startDate: bounds.startDate } : {}),
        ...(bounds.endDate ? { endDate: bounds.endDate } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      });
      setMovements(res.items);
      setTotalItems(res.meta.total);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoading(false);
    }
  }, [page, pageSize, selectedProductId, selectedType, startYmd, endYmd, debouncedSearch]);

  useEffect(() => {
    if (refreshToken >= 0) {
      void loadMovements();
    }
  }, [loadMovements, refreshToken]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter cepat tanggal mutasi">
          {(
            [
              { id: 'TODAY', label: 'Hari Ini' },
              { id: 'LAST_7_DAYS', label: '7 Hari' },
              { id: 'ALL', label: 'Semua' },
            ] as const
          ).map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={preset === item.id ? 'primary' : 'secondary'}
              aria-pressed={preset === item.id}
              onClick={() => handlePreset(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={() => void loadMovements()}
          disabled={isLoading}
        >
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
          <span>Muat Ulang</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label htmlFor={searchId} className="mb-1 block text-xs font-medium text-ink-secondary">
            Cari Produk / Catatan
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <Input
              id={searchId}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Nama produk atau catatan mutasi..."
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor={productFilterId}
            className="mb-1 block text-xs font-medium text-ink-secondary"
          >
            Produk
          </label>
          <select
            id={productFilterId}
            value={selectedProductId}
            onChange={(e) => {
              setSelectedProductId(e.target.value);
              setPage(1);
            }}
            className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
          >
            <option value="">Semua Produk</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor={typeFilterId}
            className="mb-1 block text-xs font-medium text-ink-secondary"
          >
            Tipe Mutasi
          </label>
          <select
            id={typeFilterId}
            value={selectedType}
            onChange={(e) => {
              setSelectedType(e.target.value as StockMovementType | 'ALL');
              setPage(1);
            }}
            className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
          >
            <option value="ALL">Semua Tipe</option>
            {STOCK_MOVEMENT_TYPES.map((mt) => (
              <option key={mt} value={mt}>
                {STOCK_MOVEMENT_META[mt].label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={startId} className="mb-1 block text-xs font-medium text-ink-secondary">
              Dari
            </label>
            <Input
              id={startId}
              type="date"
              value={startYmd}
              onChange={(e) => {
                setPreset('CUSTOM');
                setStartYmd(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div>
            <label htmlFor={endId} className="mb-1 block text-xs font-medium text-ink-secondary">
              Sampai
            </label>
            <Input
              id={endId}
              type="date"
              value={endYmd}
              onChange={(e) => {
                setPreset('CUSTOM');
                setEndYmd(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {errorMessage ? (
        <Alert variant="danger" title="Gagal memuat mutasi stok">
          {errorMessage}
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-subtle/50 px-4 py-10 text-center text-sm text-ink-muted">
          Memuat riwayat mutasi stok...
        </div>
      ) : movements.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-subtle/40 px-4 py-10 text-center text-sm text-ink-muted">
          Tidak ada riwayat mutasi stok sesuai filter yang dipilih.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border-subtle md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border-subtle bg-surface-subtle text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Waktu
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Produk
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Tipe
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Perubahan
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Saldo Akhir
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Catatan &amp; Petugas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface-panel">
                {movements.map((mov) => {
                  const meta = STOCK_MOVEMENT_META[mov.movementType];
                  const signedText = formatSignedStockQty(
                    mov.quantity,
                    mov.productType,
                    mov.movementType,
                  );
                  const isNegative = signedText.startsWith('-');
                  return (
                    <tr key={mov.id} className="hover:bg-surface-subtle/40">
                      <td className="whitespace-nowrap px-4 py-3 text-xs tabular-nums text-ink-muted">
                        {formatTransactionDateTime(mov.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-primary">{mov.productName}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium',
                            meta.badgeClass,
                          )}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-semibold tabular-nums',
                          isNegative ? 'text-semantic-danger-ink' : 'text-primary-800',
                        )}
                      >
                        {signedText}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                        <span className="text-xs text-ink-muted">
                          {formatQuantity(Number(mov.balanceBefore), mov.productType)} &rarr;{' '}
                        </span>
                        <span className="font-semibold text-ink-primary">
                          {formatQuantity(Number(mov.balanceAfter), mov.productType)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-secondary">
                        <p className="line-clamp-2">{mov.notes || '-'}</p>
                        {mov.createdByName ? (
                          <p className="mt-0.5 text-ink-muted">Oleh: {mov.createdByName}</p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {movements.map((mov) => {
              const meta = STOCK_MOVEMENT_META[mov.movementType];
              const signedText = formatSignedStockQty(
                mov.quantity,
                mov.productType,
                mov.movementType,
              );
              return (
                <div
                  key={mov.id}
                  className="rounded-xl border border-border-subtle bg-surface-panel p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink-primary">{mov.productName}</p>
                      <p className="text-xs text-ink-muted tabular-nums">
                        {formatTransactionDateTime(mov.createdAt)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                        meta.badgeClass,
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs tabular-nums">
                    <span className="font-semibold text-ink-primary">{signedText}</span>
                    <span className="text-ink-secondary">
                      Saldo: {formatQuantity(Number(mov.balanceBefore), mov.productType)} &rarr;{' '}
                      <strong>{formatQuantity(Number(mov.balanceAfter), mov.productType)}</strong>
                    </span>
                  </div>
                  {mov.notes ? <p className="mt-1.5 text-xs text-ink-muted">{mov.notes}</p> : null}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-ink-secondary">
            <span className="tabular-nums">
              Halaman {page} dari {totalPages} ({totalItems} mutasi)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Halaman mutasi sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Halaman mutasi berikutnya"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
