import {
  Building2,
  LineChart,
  Package,
  Pill,
  Plus,
  TrendingUp,
  UserCircle,
  Warehouse,
} from 'lucide-react';

/**
 * Primary nav items (TopBar logo dropdown).
 * Add new modules here as the app grows.
 * Icons: lucide outline set with similar visual weight.
 */
export const PRIMARY_NAV_ITEMS = [
  {
    id: 'supplier',
    label: 'Supplier',
    to: '/data-supplier',
    menuKode: 'data-supplier',
    match: (pathname) =>
      pathname.startsWith('/data-supplier') ||
      pathname.startsWith('/matching') ||
      pathname.startsWith('/pricelist-pbf'),
    icon: Building2,
    type: 'link',
  },
  {
    id: 'obat-yelo',
    label: 'Obat Yelo',
    to: '/data-obat-yelo',
    menuKode: 'data-obat-yelo',
    match: (pathname) => pathname.startsWith('/data-obat-yelo'),
    icon: Pill,
    type: 'link',
  },
  {
    id: 'penjualan',
    label: 'Penjualan',
    to: '/penjualan',
    menuKode: 'penjualan',
    match: (pathname) => pathname.startsWith('/penjualan'),
    icon: TrendingUp,
    type: 'link',
  },
  {
    id: 'pembelian',
    label: 'Pembelian',
    to: '/pembelian',
    menuKode: 'pembelian',
    match: (pathname) => pathname.startsWith('/pembelian'),
    icon: Package,
    type: 'link',
  },
  {
    id: 'stok',
    label: 'Stok',
    to: '/stok',
    menuKode: 'stok',
    match: (pathname) => pathname.startsWith('/stok'),
    icon: Warehouse,
    type: 'link',
  },
  {
    id: 'forecasting',
    label: 'Forecast',
    to: '/forecasting',
    menuKode: 'forecasting',
    match: (pathname) => pathname.startsWith('/forecasting'),
    icon: LineChart,
    type: 'link',
  },
  {
    id: 'akun',
    label: 'Akun',
    menuKode: null,
    match: (pathname) =>
      pathname.startsWith('/akun') ||
      pathname.startsWith('/pengaturan') ||
      pathname.startsWith('/kelola-akses'),
    icon: UserCircle,
    type: 'akun-sheet',
  },
];

/**
 * Optional page-level action slot (shown at bottom of nav dropdown).
 * Declared here so TopBar knows WHEN to show "+", while the page
 * supplies the onClick handler via AppShell `pageAction`.
 *
 * Only one slot can match a given path.
 */
export const PAGE_ACTION_SLOTS = [
  {
    id: 'tambah-supplier',
    match: (pathname) => pathname.startsWith('/data-supplier'),
    label: 'Tambah',
    icon: Plus,
    ariaLabel: 'Tambah Supplier',
  },
  {
    id: 'tambah-obat-yelo',
    match: (pathname) => pathname.startsWith('/data-obat-yelo'),
    label: 'Tambah',
    icon: Plus,
    ariaLabel: 'Tambah Obat Baru',
  },
];

/** Max nav icons visible at once inside the expanded pill (content scrolls beyond this). */
export const NAV_PILL_VISIBLE_SLOTS = 5;

/**
 * @param {string} pathname
 * @param {{ onClick?: () => void } | null | undefined} pageAction
 * @returns {null | { id: string, label: string, icon: import('lucide-react').LucideIcon, ariaLabel: string, onClick: () => void }}
 */
export function resolvePageAction(pathname, pageAction) {
  if (!pageAction?.onClick) return null;
  const slot = PAGE_ACTION_SLOTS.find((s) => s.match(pathname));
  if (!slot) return null;
  return {
    id: slot.id,
    label: slot.label,
    icon: slot.icon,
    ariaLabel: slot.ariaLabel || slot.label,
    onClick: pageAction.onClick,
  };
}
