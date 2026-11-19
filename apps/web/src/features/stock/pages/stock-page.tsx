import type { CategoryDto, LowStockAlertItemDto, ProductDto } from '@istana-buah/shared';
import { AlertTriangle, ClipboardCheck, History, PackagePlus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { normalizeApiError } from '../../../lib/api/api-error';
import { cn } from '../../../lib/cn';
import { getCategories } from '../../categories/api/category-api';
import { getProductById, getProducts } from '../../products/api/product-api';
import { getLowStockAlerts } from '../api/stock-api';
import { StockLowAlertTab } from '../components/stock-low-alert-tab';
import { StockMovementsTab } from '../components/stock-movements-tab';
import { StockOpnameTab } from '../components/stock-opname-tab';
import { StockReceiveTab } from '../components/stock-receive-tab';

type StockTabKey = 'ALERTS' | 'RECEIVE' | 'OPNAME' | 'MOVEMENTS';

/**
 * Halaman Manajemen Stok Gudang (M04-002):
 * Menggabungkan alert stok menipis, penerimaan barang, stok opname, dan audit riwayat mutasi stok.
 */
export function StockPage() {
  const [activeTab, setActiveTab] = useState<StockTabKey>('ALERTS');

  const [products, setProducts] = useState<ProductDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [alerts, setAlerts] = useState<LowStockAlertItemDto[]>([]);
  const [alertTotal, setAlertTotal] = useState(0);

  const [alertSearch, setAlertSearch] = useState('');
  const [alertCategoryId, setAlertCategoryId] = useState('');
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [preselectedReceiveProduct, setPreselectedReceiveProduct] = useState<ProductDto | null>(
    null,
  );
  const [refreshToken, setRefreshToken] = useState(0);

  const loadReferenceCatalog = useCallback(async () => {
    try {
      const [prodRes, catRes] = await Promise.all([
        getProducts({ limit: 100, isActive: true }),
        getCategories(),
      ]);
      setProducts(prodRes.items);
      setCategories(catRes);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    }
  }, []);

  const loadLowAlerts = useCallback(async () => {
    setIsLoadingAlerts(true);
    try {
      const res = await getLowStockAlerts({
        page: 1,
        limit: 100,
        ...(alertCategoryId ? { categoryId: alertCategoryId } : {}),
        ...(alertSearch.trim() ? { search: alertSearch.trim() } : {}),
      });
      setAlerts(res.items);
      setAlertTotal(res.meta.total);
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    } finally {
      setIsLoadingAlerts(false);
    }
  }, [alertCategoryId, alertSearch]);

  useEffect(() => {
    void loadReferenceCatalog();
  }, [loadReferenceCatalog, refreshToken]);

  useEffect(() => {
    void loadLowAlerts();
  }, [loadLowAlerts, refreshToken]);

  const handleStockUpdated = useCallback(() => {
    setRefreshToken((prev) => prev + 1);
  }, []);

  const handleQuickReceive = async (alertItem: LowStockAlertItemDto) => {
    const matched = products.find((p) => p.id === alertItem.id);
    if (matched) {
      setPreselectedReceiveProduct(matched);
      setActiveTab('RECEIVE');
      return;
    }

    try {
      const loaded = await getProductById(alertItem.id);
      setPreselectedReceiveProduct(loaded);
      setActiveTab('RECEIVE');
    } catch (err: unknown) {
      setErrorMessage(normalizeApiError(err).message);
    }
  };

  const tabs = [
    {
      key: 'ALERTS' as const,
      label: `Stok Menipis (${String(alertTotal)})`,
      icon: AlertTriangle,
    },
    {
      key: 'RECEIVE' as const,
      label: 'Penerimaan Barang',
      icon: PackagePlus,
    },
    {
      key: 'OPNAME' as const,
      label: 'Stok Opname',
      icon: ClipboardCheck,
    },
    {
      key: 'MOVEMENTS' as const,
      label: 'Riwayat Mutasi',
      icon: History,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">
            Manajemen Stok Gudang
          </h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Pantau stok menipis, catat penerimaan buah segar, lakukan stok opname, dan telusuri
            mutasi.
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={handleStockUpdated}
          disabled={isLoadingAlerts}
        >
          <RefreshCw
            className={cn('h-4 w-4', isLoadingAlerts && 'animate-spin')}
            aria-hidden="true"
          />
          <span>Segarkan Data</span>
        </Button>
      </div>

      {alertTotal > 0 ? (
        <Alert variant="warning" title={`${String(alertTotal)} produk stok menipis`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Beberapa produk telah mencapai batas peringatan minimum. Segera lakukan pemesanan atau
              penerimaan stok.
            </span>
            {activeTab !== 'ALERTS' ? (
              <Button type="button" variant="secondary" onClick={() => setActiveTab('ALERTS')}>
                Lihat Daftar Menipis
              </Button>
            ) : null}
          </div>
        </Alert>
      ) : null}

      {errorMessage ? (
        <Alert variant="danger" title="Terjadi kesalahan memuat data">
          {errorMessage}
        </Alert>
      ) : null}

      <section className="rounded-2xl border border-border-subtle bg-surface-panel p-4 sm:p-5">
        <div
          role="tablist"
          aria-label="Navigasi manajemen stok"
          className="mb-5 flex flex-wrap gap-2 border-b border-border-subtle pb-4"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                id={`stock-tab-${tab.key}`}
                aria-selected={selected}
                aria-controls={`stock-panel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-700',
                  selected
                    ? 'border-primary-800 bg-primary-800 text-white'
                    : 'border-border-subtle bg-surface-subtle text-ink-secondary hover:bg-surface-subtle/80 hover:text-ink-primary',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`stock-panel-${activeTab}`}
          aria-labelledby={`stock-tab-${activeTab}`}
        >
          {activeTab === 'ALERTS' ? (
            <StockLowAlertTab
              alerts={alerts}
              categories={categories}
              isLoading={isLoadingAlerts}
              searchTerm={alertSearch}
              selectedCategoryId={alertCategoryId}
              onSearchChange={setAlertSearch}
              onCategoryChange={setAlertCategoryId}
              onQuickReceive={(item) => void handleQuickReceive(item)}
            />
          ) : null}

          {activeTab === 'RECEIVE' ? (
            <StockReceiveTab
              products={products}
              preselectedProduct={preselectedReceiveProduct}
              onPreselectedConsumed={() => setPreselectedReceiveProduct(null)}
              onStockUpdated={handleStockUpdated}
            />
          ) : null}

          {activeTab === 'OPNAME' ? (
            <StockOpnameTab
              products={products}
              categories={categories}
              onStockUpdated={handleStockUpdated}
            />
          ) : null}

          {activeTab === 'MOVEMENTS' ? (
            <StockMovementsTab products={products} refreshToken={refreshToken} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
