import type { UserRole } from '@istana-buah/shared';
import {
  BarChart3,
  ClipboardList,
  Clock,
  FolderTree,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  ShoppingCart,
  Trash2,
  Truck,
  Users,
} from 'lucide-react';

export type NavGroup = 'operations' | 'catalog' | 'warehouse' | 'management' | 'account';

export interface NavItemConfig {
  path: string;
  label: string;
  icon: LucideIcon;
  allowedRoles: readonly UserRole[];
  group: NavGroup;
}

export const ROLE_LABELS_ID: Record<UserRole, string> = {
  OWNER: 'Pemilik',
  MANAGER: 'Manajer',
  CASHIER: 'Kasir',
};

export const APP_NAV_ITEMS: readonly NavItemConfig[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    allowedRoles: ['OWNER', 'MANAGER'],
    group: 'operations',
  },
  {
    path: '/pos',
    label: 'Kasir (POS)',
    icon: ShoppingCart,
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'],
    group: 'operations',
  },
  {
    path: '/shifts',
    label: 'Shift Kasir',
    icon: Clock,
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'],
    group: 'operations',
  },
  {
    path: '/products',
    label: 'Produk',
    icon: Package,
    allowedRoles: ['OWNER', 'MANAGER'],
    group: 'catalog',
  },
  {
    path: '/categories',
    label: 'Kategori',
    icon: FolderTree,
    allowedRoles: ['OWNER', 'MANAGER'],
    group: 'catalog',
  },
  {
    path: '/stock',
    label: 'Stok Gudang',
    icon: ClipboardList,
    allowedRoles: ['OWNER', 'MANAGER'],
    group: 'warehouse',
  },
  {
    path: '/suppliers',
    label: 'Supplier & PO',
    icon: Truck,
    allowedRoles: ['OWNER', 'MANAGER'],
    group: 'warehouse',
  },
  {
    path: '/waste',
    label: 'Penyusutan',
    icon: Trash2,
    allowedRoles: ['OWNER', 'MANAGER'],
    group: 'warehouse',
  },
  {
    path: '/reports',
    label: 'Laporan',
    icon: BarChart3,
    allowedRoles: ['OWNER', 'MANAGER'],
    group: 'management',
  },
  {
    path: '/employees',
    label: 'Pegawai',
    icon: Users,
    allowedRoles: ['OWNER'],
    group: 'management',
  },
  {
    path: '/settings',
    label: 'Pengaturan',
    icon: Settings,
    allowedRoles: ['OWNER'],
    group: 'management',
  },
  {
    path: '/account/password',
    label: 'Ubah Password',
    icon: KeyRound,
    allowedRoles: ['OWNER', 'MANAGER', 'CASHIER'],
    group: 'account',
  },
];

export function getVisibleNavItemsForRole(role: UserRole): NavItemConfig[] {
  return APP_NAV_ITEMS.filter((item) => item.allowedRoles.includes(role));
}

export function isPathAllowedForRole(pathname: string, role: UserRole): boolean {
  const cleanPath = pathname.split('?')[0] ?? pathname;
  const matched = APP_NAV_ITEMS.find(
    (item) => cleanPath === item.path || cleanPath.startsWith(`${item.path}/`),
  );
  if (!matched) {
    return true;
  }
  return matched.allowedRoles.includes(role);
}
