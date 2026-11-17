import {
  PURCHASE_ORDER_STATUSES,
  type PurchaseOrderDto,
  type PurchaseOrderStatus,
  type SupplierDto,
} from '@istana-buah/shared';
import { Banknote, Eye, PackageCheck, Plus, Search } from 'lucide-react';
import { useId } from 'react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { cn } from '../../../lib/cn';
import { formatRupiah, formatTransactionDateTime } from '../../pos/utils/formatters';
import { PO_STATUS_META } from '../utils/supplier-meta';

export interface PurchaseOrderTabProps {
  orders: PurchaseOrderDto[];
  suppliers: SupplierDto[];
  isLoading: boolean;
  searchTerm: string;
  selectedSupplierId: string;
  selectedStatus: PurchaseOrderStatus | 'ALL';
  unpaidOnly: boolean;
  onSearchChange: (val: string) => void;
  onSupplierChange: (val: string) => void;
  onStatusChange: (val: PurchaseOrderStatus | 'ALL') => void;
  onUnpaidOnlyChange: (val: boolean) => void;
  onCreateOrder: () => void;
  onViewOrder: (po: PurchaseOrderDto) => void;
  onReceiveOrder: (po: PurchaseOrderDto) => void;
  onPayOrder: (po: PurchaseOrderDto) => void;
}

/**
 * Tab Purchase Order & Hutang Supplier (M05-003).
 */
export function PurchaseOrderTab({
  orders,
  suppliers,
  isLoading,
  searchTerm,
  selectedSupplierId,
  selectedStatus,
  unpaidOnly,
  onSearchChange,
  onSupplierChange,
  onStatusChange,
  onUnpaidOnlyChange,
  onCreateOrder,
  onViewOrder,
  onReceiveOrder,
  onPayOrder,
}: PurchaseOrderTabProps) {
  const searchId = useId();
  const supId = useId();
  const statusId = useId();
  const unpaidId = useId();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor={searchId} className="mb-1 block text-xs font-medium text-ink-secondary">
              Cari Nomor PO
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
                placeholder="PO- atau supplier..."
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <label htmlFor={supId} className="mb-1 block text-xs font-medium text-ink-secondary">
              Supplier
            </label>
            <select
              id={supId}
              value={selectedSupplierId}
              onChange={(e) => onSupplierChange(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
            >
              <option value="">Semua Supplier</option>
              {suppliers.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={statusId} className="mb-1 block text-xs font-medium text-ink-secondary">
              Status PO
            </label>
            <select
              id={statusId}
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value as PurchaseOrderStatus | 'ALL')}
              className="min-h-11 w-full rounded-xl border border-border-strong bg-surface-panel px-3 text-sm text-ink-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700"
            >
              <option value="ALL">Semua Status</option>
              {PURCHASE_ORDER_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {PO_STATUS_META[st].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label
              htmlFor={unpaidId}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border-subtle bg-surface-subtle/50 px-3 text-sm text-ink-primary"
            >
              <input
                id={unpaidId}
                type="checkbox"
                checked={unpaidOnly}
                onChange={(e) => onUnpaidOnlyChange(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong text-primary-700"
              />
              <span>Belum Lunas Saja</span>
            </label>
          </div>
        </div>

        <Button type="button" onClick={onCreateOrder}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>Buat Purchase Order</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border-subtle bg-surface-subtle/40 px-4 py-10 text-center text-sm text-ink-muted">
          Memuat daftar Purchase Order...
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-surface-subtle/40 px-4 py-10 text-center text-sm text-ink-muted">
          Tidak ada Purchase Order yang cocok dengan filter.
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border-subtle md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="border-b border-border-subtle bg-surface-subtle text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Nomor PO
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Supplier
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Total
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Terbayar
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Sisa Hutang
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle bg-surface-panel">
                {orders.map((po) => {
                  const meta = PO_STATUS_META[po.status];
                  const debt = Number(po.remainingDebt);
                  const canReceive = po.status === 'PENDING' || po.status === 'PARTIAL';
                  const canPay = po.status !== 'CANCELLED' && debt > 0;

                  return (
                    <tr key={po.id} className="hover:bg-surface-subtle/40">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-ink-primary tabular-nums">
                          {po.referenceNo ?? po.id}
                        </p>
                        <p className="text-xs text-ink-muted tabular-nums">
                          {formatTransactionDateTime(po.createdAt)}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink-primary">{po.supplierName}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                            meta.badgeClass,
                          )}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-primary">
                        {formatRupiah(Number(po.totalAmount))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-secondary">
                        {formatRupiah(Number(po.paidAmount))}
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
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Detail PO ${po.referenceNo ?? po.id}`}
                            onClick={() => onViewOrder(po)}
                          >
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          {canReceive ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => onReceiveOrder(po)}
                            >
                              <PackageCheck className="h-4 w-4" aria-hidden="true" />
                              <span>Terima Barang</span>
                            </Button>
                          ) : null}
                          {canPay ? (
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => onPayOrder(po)}
                            >
                              <Banknote className="h-4 w-4" aria-hidden="true" />
                              <span>Bayar</span>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 md:hidden">
            {orders.map((po) => {
              const meta = PO_STATUS_META[po.status];
              const debt = Number(po.remainingDebt);
              const canReceive = po.status === 'PENDING' || po.status === 'PARTIAL';
              const canPay = po.status !== 'CANCELLED' && debt > 0;

              return (
                <div
                  key={po.id}
                  className="rounded-xl border border-border-subtle bg-surface-panel p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink-primary tabular-nums">
                        {po.referenceNo ?? po.id}
                      </p>
                      <p className="text-xs text-ink-muted">{po.supplierName}</p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-xs font-medium',
                        meta.badgeClass,
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-xs tabular-nums">
                    <span>Total: {formatRupiah(Number(po.totalAmount))}</span>
                    <span className="font-semibold text-semantic-danger-ink">
                      Sisa: {formatRupiah(debt)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => onViewOrder(po)}>
                      Detail
                    </Button>
                    {canReceive ? (
                      <Button type="button" variant="secondary" onClick={() => onReceiveOrder(po)}>
                        Terima Barang
                      </Button>
                    ) : null}
                    {canPay ? (
                      <Button type="button" onClick={() => onPayOrder(po)}>
                        Bayar
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
