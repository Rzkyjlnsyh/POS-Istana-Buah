import type { SupplierDto } from '@istana-buah/shared';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { cn } from '../../../lib/cn';
import { formatRupiah } from '../../pos/utils/formatters';

export type SupplierStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

export interface SupplierListTabProps {
  suppliers: SupplierDto[];
  isLoading: boolean;
  searchTerm: string;
  statusFilter: SupplierStatusFilter;
  onSearchChange: (val: string) => void;
  onStatusFilterChange: (val: SupplierStatusFilter) => void;
  onCreate: () => void;
  onViewDetail: (sup: SupplierDto) => void;
  onEdit: (sup: SupplierDto) => void;
  onDelete: (sup: SupplierDto) => void;
}

/**
 * Tab Daftar Supplier (M05-003): menampilkan daftar pemasok, total pembelian & sisa hutang.
 */
export function SupplierListTab({
  suppliers,
  isLoading,
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
  onCreate,
  onViewDetail,
  onEdit,
  onDelete,
}: SupplierListTabProps) {
  const searchId = useId();
  const statusId = useId();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor={searchId} className="mb-1.5 block text-sm font-medium text-ink-primary">
              Cari Supplier
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                aria-hidden="true"
              />
              <Input
                id={searchId}
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Nama supplier, kontak, atau telepon..."
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <label htmlFor={statusId} className="mb-1.5 block text-sm font-medium text-ink-primary">
              Status Supplier
            </label>
            <select
              id={statusId}
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as SupplierStatusFilter)}
              className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3.5 text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
            >
              <option value="ALL">Semua</option>
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nonaktif</option>
            </select>
          </div>
        </div>

        <Button type="button" onClick={onCreate}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Tambah Supplier</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-subtle/40 px-4 py-10 text-center text-sm text-ink-muted">
          Memuat daftar supplier...
        </div>
      ) : suppliers.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-subtle/40 px-4 py-10 text-center text-sm text-ink-muted">
          Belum ada data supplier yang sesuai filter.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border-subtle md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border-subtle bg-surface-subtle text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Supplier
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Kontak (PIC)
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    PO
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Total Beli
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Sisa Hutang
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface-panel">
                {suppliers.map((sup) => {
                  const debt = Number(sup.outstandingDebt);
                  return (
                    <tr key={sup.id} className="hover:bg-surface-subtle/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink-primary">{sup.name}</p>
                        {sup.address ? (
                          <p className="line-clamp-1 text-xs text-ink-muted">{sup.address}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">
                        <p>{sup.contactPerson || '-'}</p>
                        {sup.phoneNumber ? (
                          <p className="text-xs text-ink-muted tabular-nums">{sup.phoneNumber}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                        {sup.purchaseOrderCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                        {formatRupiah(Number(sup.totalPurchaseAmount))}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-semibold tabular-nums',
                          debt > 0 ? 'text-semantic-danger-ink' : 'text-ink-muted',
                        )}
                      >
                        {formatRupiah(debt)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                            sup.isActive
                              ? 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink'
                              : 'border-border-subtle bg-surface-subtle text-ink-muted',
                          )}
                        >
                          {sup.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Detail ${sup.name}`}
                            onClick={() => onViewDetail(sup)}
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Ubah ${sup.name}`}
                            onClick={() => onEdit(sup)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Hapus ${sup.name}`}
                            onClick={() => onDelete(sup)}
                          >
                            <Trash2
                              className="h-4 w-4 text-semantic-danger-ink"
                              aria-hidden="true"
                            />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {suppliers.map((sup) => (
              <div
                key={sup.id}
                className="rounded-xl border border-border-subtle bg-surface-panel p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-primary">{sup.name}</p>
                    <p className="text-xs text-ink-muted">
                      {sup.contactPerson || '-'} {sup.phoneNumber ? `• ${sup.phoneNumber}` : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full border px-2 py-0.5 text-xs font-medium',
                      sup.isActive
                        ? 'border-semantic-success-border bg-semantic-success-bg text-semantic-success-ink'
                        : 'border-border-subtle bg-surface-subtle text-ink-muted',
                    )}
                  >
                    {sup.isActive ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-xs tabular-nums">
                  <span className="text-ink-secondary">
                    {sup.purchaseOrderCount} PO &bull;{' '}
                    {formatRupiah(Number(sup.totalPurchaseAmount))}
                  </span>
                  <span className="font-semibold text-semantic-danger-ink">
                    Hutang: {formatRupiah(Number(sup.outstandingDebt))}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => onViewDetail(sup)}
                  >
                    Detail
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onClick={() => onEdit(sup)}
                  >
                    Ubah
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    aria-label={`Hapus ${sup.name}`}
                    onClick={() => onDelete(sup)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
