import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import {
  getKatalogObat,
  listMenungguVerifikasi,
  updateMatching,
  verifikasiMatching,
} from '../api/matching';
import AppShell from '../components/layout/AppShell';
import FilterSortSearchSheet from '../components/FilterSortSearchSheet';
import SearchableObatSelect from '../components/SearchableObatSelect';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import {
  formatHarga,
  formatOlehDipilih,
  formatSatuanKonversi,
} from '../lib/matchingUi';
import {
  getVerifikasiCache,
  setVerifikasiCache,
  updateVerifikasiCacheItems,
} from '../lib/verifikasiCache';

/**
 * Halaman verifikasi matching — akses dilindungi RequireMenuAksi di App.jsx
 * (izin matching:verifikasi) + middleware backend.
 */

const PAGE_CHUNK = 50;

const EMPTY_SORT = { key: null, direction: 'asc' };
const EMPTY_FILTERS = { pbf: [], satuan: [] };

function Skeleton() {
  return (
    <div className="grid grid-cols-1 gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[4px] border border-border-subtle bg-bg-surface p-2.5"
        >
          <div className="h-3.5 w-2/3 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-2 h-3 w-1/2 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-3 h-12 w-full rounded-[4px] bg-bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

function pbfLabel(row) {
  return row.supplier?.nama || row.supplier?.inisial || 'PBF';
}

function satuanLabel(row) {
  return String(row.pricelist_satuan || '').trim();
}

function rowSearchBlob(row) {
  return [
    row.pricelist_nama_barang,
    row.pricelist_kode_pbf,
    row.obat?.nama_obat,
    row.kode_obat_yelo,
    row.supplier?.nama,
    row.supplier?.inisial,
    row.pricelist_satuan,
    row.dipilih_oleh,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function MatchingVerifikasiPage() {
  const [items, setItems] = useState([]);
  const [katalog, setKatalog] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_CHUNK);

  // Applied (menggerakkan list)
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(EMPTY_SORT);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  // Draft di dalam sheet
  const [draftSearch, setDraftSearch] = useState('');
  const [draftSort, setDraftSort] = useState(EMPTY_SORT);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const katalogMap = useMemo(() => {
    const map = new Map();
    for (const o of katalog) map.set(o.kode_obat, o);
    return map;
  }, [katalog]);

  const applyLoaded = useCallback((data, obat) => {
    setItems(data || []);
    setKatalog(obat || []);
    setEdits({});
    setVerifikasiCache({ items: data || [], katalog: obat || [] });
  }, []);

  const refresh = useCallback(
    async ({ force = false } = {}) => {
      if (!force) {
        const cached = getVerifikasiCache();
        if (cached) {
          setItems(cached.items || []);
          setKatalog(cached.katalog || []);
          setLoading(false);
          return;
        }
      }
      setLoading(true);
      try {
        const [data, obat] = await Promise.all([
          listMenungguVerifikasi(),
          getKatalogObat(),
        ]);
        applyLoaded(data, obat);
      } catch (err) {
        showToast(err.message || 'Gagal memuat antrean');
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [applyLoaded, showToast]
  );

  useEffect(() => {
    refresh();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh]);

  const filterOptions = useMemo(() => {
    const pbfSet = new Set();
    const satuanSet = new Set();
    for (const row of items) {
      pbfSet.add(pbfLabel(row));
      const sat = satuanLabel(row);
      if (sat) satuanSet.add(sat);
    }
    return {
      pbf: [...pbfSet].sort((a, b) => a.localeCompare(b, 'id')),
      satuan: [...satuanSet].sort((a, b) => a.localeCompare(b, 'id')),
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pbfSelected = filters.pbf || [];
    const satuanSelected = filters.satuan || [];

    let list = items.filter((row) => {
      if (pbfSelected.length > 0 && !pbfSelected.includes(pbfLabel(row))) {
        return false;
      }
      if (satuanSelected.length > 0) {
        const sat = satuanLabel(row);
        if (!sat || !satuanSelected.includes(sat)) return false;
      }
      if (q && !rowSearchBlob(row).includes(q)) return false;
      return true;
    });

    if (sort.key === 'nama') {
      list = [...list].sort((a, b) => {
        const an = String(
          a.pricelist_nama_barang || a.pricelist_kode_pbf || ''
        ).toLowerCase();
        const bn = String(
          b.pricelist_nama_barang || b.pricelist_kode_pbf || ''
        ).toLowerCase();
        const cmp = an.localeCompare(bn, 'id');
        return sort.direction === 'asc' ? cmp : -cmp;
      });
    } else if (sort.key === 'tanggal') {
      list = [...list].sort((a, b) => {
        const at = new Date(a.tanggal_dipilih || a.created_at || 0).getTime();
        const bt = new Date(b.tanggal_dipilih || b.created_at || 0).getTime();
        const cmp = at - bt;
        return sort.direction === 'asc' ? cmp : -cmp;
      });
    }

    return list;
  }, [items, search, sort, filters]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  const breakdownByPbf = useMemo(() => {
    const counts = new Map();
    for (const row of filteredItems) {
      const label = row.supplier?.inisial || row.supplier?.nama || 'PBF';
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id'));
  }, [filteredItems]);

  const openSheet = () => {
    setDraftSearch(search);
    setDraftSort(sort);
    setDraftFilters({
      pbf: [...(filters.pbf || [])],
      satuan: [...(filters.satuan || [])],
    });
    setSheetOpen(true);
  };

  const handleApply = () => {
    setSearch(draftSearch);
    setSort(draftSort);
    setFilters({
      pbf: [...(draftFilters.pbf || [])],
      satuan: [...(draftFilters.satuan || [])],
    });
    setVisibleCount(PAGE_CHUNK);
    setSheetOpen(false);
  };

  const handleReset = () => {
    setDraftSearch('');
    setDraftSort(EMPTY_SORT);
    setDraftFilters({ pbf: [], satuan: [] });
  };

  const selectedKodeFor = (row) =>
    edits[row.id] ?? row.kode_obat_yelo ?? '';

  const syncItems = (updater) => {
    setItems((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      updateVerifikasiCacheItems(next);
      return next;
    });
  };

  const handleChangeObat = async (row, kodeObat) => {
    setEdits((prev) => ({ ...prev, [row.id]: kodeObat }));
    if (!kodeObat || kodeObat === row.kode_obat_yelo) return;
    try {
      const updated = await updateMatching(row.id, {
        kode_obat_yelo: kodeObat,
      });
      syncItems((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, ...updated } : item))
      );
    } catch (err) {
      showToast(err.message || 'Gagal mengubah obat');
      setEdits((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
  };

  const handleKeputusan = async (id, keputusan) => {
    setBusyId(id);
    try {
      await verifikasiMatching(id, keputusan);
      syncItems((prev) => prev.filter((row) => row.id !== id));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast(keputusan === 'setuju' ? 'Disetujui' : 'Ditolak');
    } catch (err) {
      showToast(err.message || 'Gagal memverifikasi');
    } finally {
      setBusyId('');
    }
  };

  return (
    <AppShell
      title="Verifikasi Matching"
      navLoading={loading}
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/matching"
            className="text-[11px] text-accent-yellow hover:underline"
          >
            ← Matching
          </Link>
          <button
            type="button"
            onClick={openSheet}
            disabled={loading}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary hover:bg-bg-surface-hover hover:text-accent-yellow disabled:opacity-50"
            aria-label="Filter verifikasi"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      }
    >
      {!loading && items.length > 0 && (
        <div className="mb-3 space-y-1">
          <p className="text-[11px] leading-snug text-text-secondary">
            Menampilkan {visibleItems.length} dari {filteredItems.length}
            {filteredItems.length !== items.length
              ? ` (total ${items.length})`
              : ''}
          </p>
          {breakdownByPbf.length > 0 ? (
            <p className="text-[11px] leading-snug text-text-muted">
              {breakdownByPbf
                .map(([label, n]) => `${label}: ${n}`)
                .join(' · ')}
            </p>
          ) : null}
        </div>
      )}

      {loading ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <p className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-4 text-[13px] text-text-muted">
          Tidak ada matching menunggu verifikasi.
        </p>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center">
          <p className="text-[13px] text-text-secondary">
            Tidak ada hasil untuk filter / pencarian ini.
          </p>
          <button
            type="button"
            onClick={openSheet}
            className="mt-2 text-[11px] font-medium text-accent-yellow hover:underline"
          >
            Ubah filter
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2">
            {visibleItems.map((row) => {
              const busy = busyId === row.id;
              const selectedKode = selectedKodeFor(row);
              const obatMeta =
                katalogMap.get(selectedKode) ||
                (row.obat?.kode_obat === selectedKode ? row.obat : null) ||
                row.obat;
              const yeloBadge = formatSatuanKonversi(obatMeta);
              const hargaLabel = formatHarga(row.pricelist_harga_dasar);

              return (
                <article
                  key={row.id}
                  className="rounded-[4px] border border-border-subtle bg-bg-surface p-2.5 shadow-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      {row.supplier?.inisial ? (
                        <span className="shrink-0 rounded-[4px] bg-bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {row.supplier.inisial}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[10px] text-text-muted">
                          PBF
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-right text-[11px] leading-snug text-text-secondary">
                        {formatOlehDipilih(
                          row.dipilih_oleh,
                          row.tanggal_dipilih
                        )}
                      </span>
                      <span className="shrink-0 rounded-[4px] bg-state-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning">
                        menunggu
                      </span>
                    </div>
                    <h2 className="mt-1.5 text-[14px] font-bold leading-snug text-text-primary">
                      {row.pricelist_nama_barang ||
                        row.pricelist_kode_pbf ||
                        '—'}
                    </h2>
                    {(row.pricelist_satuan || hargaLabel) && (
                      <p className="mt-0.5 text-[12px] leading-snug text-text-secondary">
                        {[row.pricelist_satuan, hargaLabel]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {row.pricelist_catatan_kondisi ? (
                      <p className="mt-1 text-[11px] leading-snug text-text-muted">
                        {row.pricelist_catatan_kondisi}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-2 rounded-[4px] bg-accent-yellow px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold leading-snug text-bg-base">
                        {obatMeta?.nama_obat || selectedKode || '—'}
                      </span>
                      {yeloBadge ? (
                        <span className="shrink-0 rounded-[4px] bg-bg-base/15 px-1.5 py-0.5 text-[10px] font-semibold text-bg-base">
                          {yeloBadge}
                        </span>
                      ) : null}
                    </div>
                    {obatMeta?.grup_substitusi?.nama ? (
                      <p className="mt-1 text-[11px] leading-snug text-bg-base/75">
                        Substitusi: {obatMeta.grup_substitusi.nama}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 sm:max-w-[55%] sm:flex-1">
                      <SearchableObatSelect
                        options={katalog}
                        value={selectedKode}
                        onChange={(kode) => handleChangeObat(row, kode)}
                        placeholder="Ganti obat Yelo…"
                      />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleKeputusan(row.id, 'setuju')}
                        className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
                      >
                        {busy && <SubmitSpinner className="h-3.5 w-3.5" />}
                        Setuju
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleKeputusan(row.id, 'tolak')}
                        className="rounded-[4px] border border-state-error/60 px-3 py-1.5 text-[13px] font-semibold text-state-error hover:bg-bg-surface-hover disabled:opacity-50"
                      >
                        Tolak
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {visibleCount < filteredItems.length ? (
            <button
              type="button"
              onClick={() =>
                setVisibleCount((n) =>
                  Math.min(n + PAGE_CHUNK, filteredItems.length)
                )
              }
              className="mt-3 inline-flex w-full items-center justify-center rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-secondary hover:bg-bg-surface-hover"
            >
              Lihat Lainnya ({visibleItems.length}/{filteredItems.length})
            </button>
          ) : null}
        </>
      )}

      <FilterSortSearchSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter Verifikasi"
        searchValue={draftSearch}
        onSearchChange={setDraftSearch}
        searchPlaceholder="Cari nama, kode, PBF…"
        sortOptions={[
          { key: 'nama', label: 'Nama' },
          { key: 'tanggal', label: 'Tanggal' },
        ]}
        sortState={draftSort}
        onSortChange={setDraftSort}
        filterGroups={[
          { key: 'pbf', label: 'PBF', options: filterOptions.pbf },
          { key: 'satuan', label: 'Satuan', options: filterOptions.satuan },
        ]}
        filterState={draftFilters}
        onFilterChange={setDraftFilters}
        onApply={handleApply}
        onReset={handleReset}
      />

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </AppShell>
  );
}
