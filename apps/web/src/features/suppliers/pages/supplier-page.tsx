import type {
  ProductDto,
  PurchaseOrderDto,
  PurchaseOrderStatus,
  SupplierDto,
} from '@istana-buah/shared';
import { ClipboardList, RefreshCw, Truck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { formatRupiah } from '../../pos/utils/formatters';
import { getProducts } from '../../products/api/product-api';
import { getPurchaseOrders, getSuppliers } from '../api/supplier-api';
import {
  PurchaseOrderDetailModal,
  PurchaseOrderPayModal,
  PurchaseOrderReceiveModal,
} from '../components/purchase-order-action-modals';
import { PurchaseOrderFormModal } from '../components/purchase-order-form-modal';
import { PurchaseOrderTab } from '../components/purchase-order-tab';
import { SupplierListTab, type SupplierStatusFilter } from '../components/supplier-list-tab';
import {
  SupplierDeleteModal,
  SupplierDetailModal,
  SupplierFormModal,
} from '../components/supplier-modals';

type SupplierTabKey = 'SUPPLIERS' | 'PURCHASE_ORDERS';

/**
 * Halaman Manajemen Supplier & Purchase Order (M05-003).
 */
export function SupplierPage() {
  const [activeTab, setActiveTab] = useState<SupplierTabKey>('SUPPLIERS');

  const [suppliers, setSuppliers] = useState<SupplierDto[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<SupplierDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderDto[]>([]);

  const [supSearch, setSupSearch] = useState('');
  const [supStatus, setSupStatus] = useState<SupplierStatusFilter>('ALL');
  const [isLoadingSuppliers, setIsLoadingSuppliers] = useState(true);

  const [poSearch, setPoSearch] = useState('');
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poStatus, setPoStatus] = useState<PurchaseOrderStatus | 'ALL'>('ALL');
  const [poUnpaidOnly, setPoUnpaidOnly] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDto | null>(null);
  const [deletingSupplier, setDeletingSupplier] = useState<SupplierDto | null>(null);
  const [viewingSupplierId, setViewingSupplierId] = useState<string | null>(null);

  const [isPoFormOpen, setIsPoFormOpen] = useState(false);
  const [payingOrder, setPayingOrder] = useState<PurchaseOrderDto | null>(null);
  const [receivingOrder, setReceivingOrder] = useState<PurchaseOrderDto | null>(null);
  const [viewingOrder, setViewingOrder] = useState<PurchaseOrderDto | null>(null);

  const loadSuppliers = useCallback(async () => {
    setIsLoadingSuppliers(true);
    try {
      const [filteredRes, allRes] = await Promise.all([
        getSuppliers({
          limit: 100,
          ...(supSearch.trim() ? { search: supSearch.trim() } : {}),
          ...(supStatus === 'ACTIVE'
            ? { isActive: true }
            : supStatus === 'INACTIVE'
              ? { isActive: false }
              : {}),
        }),
        getSuppliers({ limit: 100 }),
      ]);
      setSuppliers(filteredRes.items);
      setAllSuppliers(allRes.items);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoadingSuppliers(false);
    }
  }, [supSearch, supStatus]);

  const loadPurchaseOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      const res = await getPurchaseOrders({
        limit: 50,
        ...(poSearch.trim() ? { search: poSearch.trim() } : {}),
        ...(poSupplierId ? { supplierId: poSupplierId } : {}),
        ...(poStatus !== 'ALL' ? { status: poStatus } : {}),
        ...(poUnpaidOnly ? { unpaidOnly: true } : {}),
      });
      setOrders(res.items);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [poSearch, poSupplierId, poStatus, poUnpaidOnly]);

  const loadProducts = useCallback(async () => {
    try {
      const res = await getProducts({ limit: 100, isActive: true });
      setProducts(res.items);
    } catch {
      // Abaikan jika gagal memuat katalog tambahan
    }
  }, []);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    void loadPurchaseOrders();
  }, [loadPurchaseOrders]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const refreshAll = useCallback(() => {
    setErrorMessage(null);
    void Promise.all([loadSuppliers(), loadPurchaseOrders()]);
  }, [loadSuppliers, loadPurchaseOrders]);

  const summaryStats = useMemo(() => {
    const activeCount = allSuppliers.filter((s) => s.isActive).length;
    const totalDebt = allSuppliers.reduce((acc, s) => acc + Number(s.outstandingDebt), 0);
    return { activeCount, totalDebt };
  }, [allSuppliers]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">
            Supplier &amp; Purchase Order
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Kelola pemasok buah segar, buat pesanan pembelian (PO), pantau penerimaan barang, dan
            lunasi hutang.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={refreshAll}
          disabled={isLoadingSuppliers || isLoadingOrders}
        >
          <RefreshCw
            className={cn('h-4 w-4', (isLoadingSuppliers || isLoadingOrders) && 'animate-spin')}
            aria-hidden="true"
          />
          <span>Segarkan Data</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border-subtle bg-surface-panel px-4 py-3">
          <p className="text-xs font-medium text-ink-muted">Supplier Aktif</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-ink-primary">
            {summaryStats.activeCount} pemasok
          </p>
        </div>
        <div className="rounded-xl border border-border-subtle bg-surface-panel px-4 py-3">
          <p className="text-xs font-medium text-ink-muted">Total Sisa Hutang Dagang</p>
          <p
            className={cn(
              'mt-1 text-xl font-bold tabular-nums',
              summaryStats.totalDebt > 0 ? 'text-semantic-danger-ink' : 'text-primary-800',
            )}
          >
            {formatRupiah(summaryStats.totalDebt)}
          </p>
        </div>
      </div>

      {errorMessage ? (
        <Alert variant="danger" title="Terjadi kesalahan">
          {errorMessage}
        </Alert>
      ) : null}

      {successBanner ? (
        <Alert variant="success" title="Berhasil">
          {successBanner}
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-4 sm:p-5">
        <div
          role="tablist"
          aria-label="Navigasi modul supplier"
          className="mb-5 flex flex-wrap gap-2 border-b border-border-subtle pb-4"
        >
          <button
            type="button"
            role="tab"
            id="sup-tab-SUPPLIERS"
            aria-selected={activeTab === 'SUPPLIERS'}
            aria-controls="sup-panel-SUPPLIERS"
            onClick={() => setActiveTab('SUPPLIERS')}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700',
              activeTab === 'SUPPLIERS'
                ? 'border-primary-800 bg-primary-800 text-white'
                : 'border-border-subtle bg-surface-subtle text-ink-secondary hover:text-ink-primary',
            )}
          >
            <Truck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Daftar Supplier ({String(allSuppliers.length)})</span>
          </button>
          <button
            type="button"
            role="tab"
            id="sup-tab-PURCHASE_ORDERS"
            aria-selected={activeTab === 'PURCHASE_ORDERS'}
            aria-controls="sup-panel-PURCHASE_ORDERS"
            onClick={() => setActiveTab('PURCHASE_ORDERS')}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700',
              activeTab === 'PURCHASE_ORDERS'
                ? 'border-primary-800 bg-primary-800 text-white'
                : 'border-border-subtle bg-surface-subtle text-ink-secondary hover:text-ink-primary',
            )}
          >
            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Purchase Order ({String(orders.length)})</span>
          </button>
        </div>

        <div role="tabpanel" id={`sup-panel-${activeTab}`} aria-labelledby={`sup-tab-${activeTab}`}>
          {activeTab === 'SUPPLIERS' ? (
            <SupplierListTab
              suppliers={suppliers}
              isLoading={isLoadingSuppliers}
              searchTerm={supSearch}
              statusFilter={supStatus}
              onSearchChange={setSupSearch}
              onStatusFilterChange={setSupStatus}
              onCreate={() => {
                setEditingSupplier(null);
                setIsFormOpen(true);
              }}
              onViewDetail={(s) => setViewingSupplierId(s.id)}
              onEdit={(s) => {
                setEditingSupplier(s);
                setIsFormOpen(true);
              }}
              onDelete={(s) => setDeletingSupplier(s)}
            />
          ) : (
            <PurchaseOrderTab
              orders={orders}
              suppliers={allSuppliers}
              isLoading={isLoadingOrders}
              searchTerm={poSearch}
              selectedSupplierId={poSupplierId}
              selectedStatus={poStatus}
              unpaidOnly={poUnpaidOnly}
              onSearchChange={setPoSearch}
              onSupplierChange={setPoSupplierId}
              onStatusChange={setPoStatus}
              onUnpaidOnlyChange={setPoUnpaidOnly}
              onCreateOrder={() => setIsPoFormOpen(true)}
              onViewOrder={(po) => setViewingOrder(po)}
              onReceiveOrder={(po) => setReceivingOrder(po)}
              onPayOrder={(po) => setPayingOrder(po)}
            />
          )}
        </div>
      </section>

      <SupplierFormModal
        isOpen={isFormOpen}
        supplierToEdit={editingSupplier}
        onClose={() => setIsFormOpen(false)}
        onSaved={(saved) => {
          setSuccessBanner(
            editingSupplier
              ? `Supplier "${saved.name}" berhasil diperbarui.`
              : `Supplier "${saved.name}" berhasil ditambahkan.`,
          );
          refreshAll();
        }}
      />

      <SupplierDeleteModal
        isOpen={deletingSupplier !== null}
        supplier={deletingSupplier}
        onClose={() => setDeletingSupplier(null)}
        onDeleted={() => {
          setSuccessBanner('Supplier berhasil dihapus.');
          refreshAll();
        }}
      />

      <SupplierDetailModal
        isOpen={viewingSupplierId !== null}
        supplierId={viewingSupplierId}
        onClose={() => setViewingSupplierId(null)}
      />

      <PurchaseOrderFormModal
        isOpen={isPoFormOpen}
        suppliers={allSuppliers}
        products={products}
        onClose={() => setIsPoFormOpen(false)}
        onCreated={(po) => {
          setSuccessBanner(`Purchase Order ${po.referenceNo ?? ''} berhasil dibuat.`);
          refreshAll();
        }}
      />

      <PurchaseOrderPayModal
        isOpen={payingOrder !== null}
        purchaseOrder={payingOrder}
        onClose={() => setPayingOrder(null)}
        onUpdated={(po) => {
          setSuccessBanner(`Pembayaran PO ${po.referenceNo ?? ''} berhasil dicatat.`);
          refreshAll();
        }}
      />

      <PurchaseOrderReceiveModal
        isOpen={receivingOrder !== null}
        purchaseOrder={receivingOrder}
        onClose={() => setReceivingOrder(null)}
        onReceived={() => {
          setSuccessBanner('Penerimaan barang PO berhasil dicatat dan stok diperbarui.');
          refreshAll();
        }}
      />

      <PurchaseOrderDetailModal
        isOpen={viewingOrder !== null}
        purchaseOrder={viewingOrder}
        onClose={() => setViewingOrder(null)}
        onCancelled={(po) => {
          setSuccessBanner(`PO ${po.referenceNo ?? ''} berhasil dibatalkan.`);
          refreshAll();
        }}
      />
    </div>
  );
}
