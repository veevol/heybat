import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MoreVertical, RefreshCw } from 'lucide-react';
import SubmitSpinner from './SubmitSpinner';

/**
 * Pill switch Supplier ↔ Pricelist (Matching board).
 * On Pricelist: titik tiga di kanan pill → menu Refresh Kandidat.
 */
export default function SupplierPricelistTabs({
  active,
  onRefreshKandidat = null,
  refreshDisabled = false,
  refreshing = false,
}) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  let pricelistSearch = location.pathname.startsWith('/matching')
    ? location.search
    : '';
  if (!pricelistSearch) {
    try {
      const last = sessionStorage.getItem('heybat_pricelist_pbf_id');
      if (last) pricelistSearch = `?pbf_id=${encodeURIComponent(last)}`;
    } catch {
      /* ignore */
    }
  }
  const pricelistTo = {
    pathname: '/matching',
    search: pricelistSearch,
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDoc(e) {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  // Derive from URL so warna selalu ikut halaman yang tampil
  const tabActive = location.pathname.startsWith('/matching')
    ? 'pricelist'
    : location.pathname.startsWith('/data-supplier')
      ? 'supplier'
      : active;

  const pill = (isOn) =>
    isOn
      ? 'rounded-[4px] bg-accent-yellow px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-bg-base'
      : 'rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-text-secondary hover:bg-bg-surface-hover';

  return (
    <div className="flex items-center gap-2">
      <Link to="/data-supplier" className={pill(tabActive === 'supplier')}>
        Supplier
      </Link>
      <Link to={pricelistTo} className={pill(tabActive === 'pricelist')}>
        Pricelist
      </Link>

      {tabActive === 'pricelist' && onRefreshKandidat ? (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary transition hover:bg-bg-surface-hover hover:text-text-primary"
            aria-label="Menu pricelist"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[11rem] overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface shadow-lg shadow-black/40"
            >
              <button
                type="button"
                role="menuitem"
                disabled={refreshDisabled || refreshing}
                onClick={() => {
                  setMenuOpen(false);
                  onRefreshKandidat();
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-text-primary transition hover:bg-bg-surface-hover disabled:opacity-50"
              >
                {refreshing ? (
                  <SubmitSpinner className="h-3.5 w-3.5" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 text-accent-yellow" />
                )}
                Refresh Kandidat
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
