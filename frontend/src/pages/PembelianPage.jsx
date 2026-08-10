import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  MoreVertical,
  Search,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  listPembelianFaktur,
  listPembelianFakturItems,
} from '../api/pembelian';
import AppShell from '../components/layout/AppShell';
import PembelianUploadSheet from '../components/PembelianUploadSheet';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 20;

function formatRupiah(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('id-ID').format(num);
}

function formatTanggal(value) {
  if (!value) return '—';
  const raw = String(value);
  const d =
    raw.length <= 10 ? new Date(`${raw}T00:00:00+07:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

/** Gabung diskon_1/2/3: "10%", "10% + 5%", atau "-" */
function formatDiskon(d1, d2, d3) {
  const parts = [d1, d2, d3]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => `${n}%`);
  if (!parts.length) return '-';
  return parts.join(' + ');
}

function BayarBadge({ jenis }) {
  const raw = String(jenis || '').toUpperCase();
  if (raw === 'TUNAI') {
    return (
      <span className="inline-flex rounded-[4px] bg-state-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-success">
        TUNAI
      </span>
    );
  }
  if (raw === 'HUTANG') {
    return (
      <span className="inline-flex rounded-[4px] bg-state-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning">
        HUTANG
      </span>
    );
  }
  if (!raw) return null;
  return (
    <span className="inline-flex rounded-[4px] bg-bg-base px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">
      {raw}
    </span>
  );
}

function FakturCard({ faktur, expanded, onToggle }) {
  const [items, setItems] = useState(null);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [itemsError, setItemsError] = useState('');
  const [itemsHasMore, setItemsHasMore] = useState(false);
  const loadedForId = useRef(null);

  useEffect(() => {
    if (!expanded) return;
    if (loadedForId.current === faktur.id) return;

    let cancelled = false;
    async function load() {
      setItemsBusy(true);
      setItemsError('');
      try {
        const data = await listPembelianFakturItems(faktur.id, {
          limit: 100,
          offset: 0,
        });
        if (cancelled) return;
        setItems(data.items || []);
        setItemsHasMore(Boolean(data.has_more));
        loadedForId.current = faktur.id;
      } catch (err) {
        if (cancelled) return;
        setItemsError(err.message || 'Gagal memuat item');
        setItems(null);
      } finally {
        if (!cancelled) setItemsBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [expanded, faktur.id]);

  async function loadMoreItems() {
    if (!items || itemsBusy || !itemsHasMore) return;
    setItemsBusy(true);
    setItemsError('');
    try {
      const data = await listPembelianFakturItems(faktur.id, {
        limit: 100,
        offset: items.length,
      });
      setItems((prev) => [...(prev || []), ...(data.items || [])]);
      setItemsHasMore(Boolean(data.has_more));
    } catch (err) {
      setItemsError(err.message || 'Gagal memuat item');
    } finally {
      setItemsBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2.5 text-left transition hover:bg-bg-surface-hover"
      >
        {/* Baris atas: No Faktur + badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${
                expanded ? 'rotate-0' : '-rotate-90'
              }`}
            />
            <h3 className="truncate text-[13px] font-semibold leading-none text-text-primary">
              {faktur.no_faktur}
            </h3>
          </div>
          <BayarBadge jenis={faktur.jenis_bayar} />
        </div>

        {/* Baris tengah: Supplier, Tanggal */}
        <div className="mt-1.5 pl-5 text-[11px] leading-snug text-text-secondary">
          <p className="truncate">{faktur.nama_supplier || '—'}</p>
          <p className="mt-0.5 text-text-muted">
            {formatTanggal(faktur.tanggal_faktur)}
          </p>
        </div>

        {/* Baris bawah: Total + jumlah item */}
        <div className="mt-1.5 flex items-end justify-between gap-2 pl-5">
          <p className="text-[11px] text-text-muted">
            {formatNumber(faktur.jumlah_item ?? 0)} item
          </p>
          <p className="shrink-0 text-[13px] font-medium leading-none text-accent-yellow">
            {formatRupiah(faktur.total_transaksi)}
          </p>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border-subtle bg-bg-base px-3 py-2">
          {itemsBusy && !items ? (
            <div className="flex justify-center py-3">
              <SubmitSpinner className="h-4 w-4" />
            </div>
          ) : null}
          {itemsError ? (
            <p className="py-2 text-[12px] text-state-error">{itemsError}</p>
          ) : null}
          {items?.length === 0 ? (
            <p className="py-2 text-[12px] text-text-muted">Tidak ada item</p>
          ) : null}
          {items?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-text-secondary">
                  <tr>
                    <th className="pb-1.5 pr-2 font-medium">Nama Obat</th>
                    <th className="w-px whitespace-nowrap pb-1.5 pl-1.5 pr-1 font-medium">
                      Satuan
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 px-1 font-medium text-right">
                      Jumlah
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 px-1 font-medium text-right">
                      Harga
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 px-1 font-medium text-right">
                      Diskon
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 px-1 font-medium text-right">
                      HPP
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 pl-1 font-medium text-right">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className="border-t border-border-subtle/50 align-top"
                    >
                      <td className="py-1.5 pr-2 text-text-primary">
                        <div className="font-medium leading-snug">
                          {it.nama_obat || it.kode_obat}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-1.5 pl-1.5 pr-1 text-text-secondary">
                        {it.satuan || '—'}
                      </td>
                      <td className="whitespace-nowrap py-1.5 px-1 text-right text-text-secondary">
                        {formatNumber(it.jumlah)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 px-1 text-right text-text-secondary">
                        {formatNumber(it.harga)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 px-1 text-right text-text-secondary">
                        {formatDiskon(it.diskon_1, it.diskon_2, it.diskon_3)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 px-1 text-right text-text-secondary">
                        {it.hpp === null ||
                        it.hpp === undefined ||
                        it.hpp === ''
                          ? '—'
                          : formatRupiah(it.hpp)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pl-1 text-right font-semibold text-text-primary">
                        {(() => {
                          const hpp = Number(it.hpp);
                          const qty = Number(it.jumlah);
                          if (!Number.isFinite(hpp) || !Number.isFinite(qty)) {
                            return '—';
                          }
                          return formatRupiah(hpp * qty);
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {itemsHasMore ? (
            <button
              type="button"
              onClick={loadMoreItems}
              disabled={itemsBusy}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[12px] font-medium text-text-primary disabled:opacity-50"
            >
              {itemsBusy ? <SubmitSpinner className="h-3.5 w-3.5" /> : null}
              Muat lagi
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function PembelianPage() {
  const { hasAccess } = useAuth();
  const canTambah = hasAccess('pembelian', 'tambah');

  const [view, setView] = useState('riwayat'); // riwayat | belum_dibayar
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const menuRef = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }, []);

  useEffect(() => {
    if (query.trim() !== debouncedQ) setSearchLoading(true);
    const t = setTimeout(() => setDebouncedQ(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query, debouncedQ]);

  const loadPage = useCallback(
    async ({ offset = 0, append = false, q = debouncedQ } = {}) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await listPembelianFaktur({
          limit: PAGE_SIZE,
          offset,
          q,
        });
        const next = data.items || [];
        setItems((prev) => (append ? [...prev, ...next] : next));
        setHasMore(Boolean(data.has_more));
      } catch (err) {
        showToast(err.message || 'Gagal memuat pembelian');
        if (!append) {
          setItems([]);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setSearchLoading(false);
      }
    },
    [debouncedQ, showToast]
  );

  useEffect(() => {
    if (view !== 'riwayat') return;
    setExpandedId(null);
    loadPage({ offset: 0, append: false });
  }, [view, loadPage]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

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

  function handleUploadSuccess() {
    setExpandedId(null);
    setView('riwayat');
    loadPage({ offset: 0, append: false });
  }

  return (
    <AppShell
      title="Pembelian"
      navLoading={loading && view === 'riwayat'}
      actions={
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary transition hover:bg-bg-surface-hover hover:text-text-primary"
            aria-label="Menu pembelian"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[12rem] overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface shadow-lg shadow-black/40"
            >
              {canTambah ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setUploadOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-text-primary transition hover:bg-bg-surface-hover"
                >
                  <Upload className="h-3.5 w-3.5 text-accent-yellow" />
                  Upload Pembelian
                </button>
              ) : null}
              {view !== 'riwayat' ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setView('riwayat');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-text-primary transition hover:bg-bg-surface-hover"
                >
                  Riwayat Faktur
                </button>
              ) : null}
              {view !== 'belum_dibayar' ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setView('belum_dibayar');
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-text-primary transition hover:bg-bg-surface-hover"
                >
                  <Wallet className="h-3.5 w-3.5 text-accent-yellow" />
                  Belum Dibayar
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      }
    >
      {view === 'riwayat' ? (
        <>
          <div className="sticky top-12 z-20 -mx-3 mb-3 space-y-2 bg-bg-surface/80 px-3 pb-2 pt-1 backdrop-blur-md">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari faktur, supplier, atau nama obat…"
                className="w-full rounded-[4px] border border-border-subtle bg-bg-surface py-1.5 pl-10 pr-9 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
              />
              {searchLoading || (loading && Boolean(query.trim())) ? (
                <SubmitSpinner className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent-yellow" />
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
                Memuat…
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
                {debouncedQ
                  ? 'Tidak ada faktur yang cocok.'
                  : 'Belum ada data pembelian.'}
                {!debouncedQ && canTambah
                  ? ' Buka menu titik tiga → Upload Pembelian untuk mengunggah Excel Vmedis.'
                  : ''}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                {items.map((faktur) => (
                  <FakturCard
                    key={faktur.id}
                    faktur={faktur}
                    expanded={expandedId === faktur.id}
                    onToggle={() =>
                      setExpandedId((cur) =>
                        cur === faktur.id ? null : faktur.id
                      )
                    }
                  />
                ))}
                {hasMore ? (
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() =>
                      loadPage({ offset: items.length, append: true })
                    }
                    className="flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] font-medium text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <SubmitSpinner className="h-4 w-4" />
                    ) : null}
                    Muat lagi
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
          Modul pembayaran hutang belum tersedia
        </div>
      )}

      <PembelianUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        onToast={showToast}
      />

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
