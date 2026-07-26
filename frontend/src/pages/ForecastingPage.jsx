import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  History,
  LineChart,
  Plus,
  Settings2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  getForecastHasil,
  getForecastPengaturan,
  jalankanForecast,
  listForecastRiwayat,
  updateForecastPengaturan,
} from '../api/forecast';
import { getSupplierMapAktif } from '../api/matching';
import AppShell from '../components/layout/AppShell';
import {
  ForecastGrupCard,
  ForecastObatCard,
} from '../components/ForecastCards';
import FilterSortSearchSheet, {
  emptyFilterSection,
  normalizeFilterSection,
} from '../components/FilterSortSearchSheet';
import SheetModal from '../components/SheetModal';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { sortGolonganFilterOptions } from '../lib/obatYelo';

const KATEGORI_OPTIONS = [
  { value: 'retail', label: 'Retail' },
  { value: 'mitra', label: 'Mitra' },
];

const VALID_TABS = ['hasil', 'riwayat', 'pengaturan'];
const EMPTY_SORT = { key: null, direction: 'asc' };
const EMPTY_FILTERS = {
  golongan: emptyFilterSection(),
  supplier: emptyFilterSection(),
};

function formatTanggal(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function kategoriLabel(list) {
  if (!Array.isArray(list) || list.length === 0) return '—';
  return list
    .map((k) => KATEGORI_OPTIONS.find((o) => o.value === k)?.label || k)
    .join(', ');
}

function supplierInisialLabel(s) {
  return s?.inisial || s?.nama || '';
}

export default function ForecastingPage() {
  const { profile, hasAccess } = useAuth();
  const isOwner = profile?.is_owner === true;
  const canTambah = hasAccess('forecasting', 'tambah');
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab');
  const runIdParam = searchParams.get('run');
  const tab = VALID_TABS.includes(tabParam)
    ? tabParam === 'pengaturan' && !isOwner
      ? 'hasil'
      : tabParam
    : 'hasil';

  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [periodeForecast, setPeriodeForecast] = useState(14);
  const [kategori, setKategori] = useState(['retail', 'mitra']);
  const [running, setRunning] = useState(false);

  const [riwayat, setRiwayat] = useState([]);
  const [riwayatLoading, setRiwayatLoading] = useState(false);

  const [hasil, setHasil] = useState(null);
  const [hasilLoading, setHasilLoading] = useState(false);
  const [hasilError, setHasilError] = useState('');
  const [showCukupStok, setShowCukupStok] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [supplierMap, setSupplierMap] = useState({});

  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(EMPTY_SORT);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftSort, setDraftSort] = useState(EMPTY_SORT);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);

  const [pengaturan, setPengaturan] = useState(null);
  const [periodeHistoriDraft, setPeriodeHistoriDraft] = useState(90);
  const [pengaturanSaving, setPengaturanSaving] = useState(false);

  const setTab = (next) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      if (next !== 'hasil') p.delete('run');
      return p;
    });
  };

  const loadRiwayat = useCallback(async () => {
    setRiwayatLoading(true);
    try {
      const rows = await listForecastRiwayat();
      setRiwayat(Array.isArray(rows) ? rows : []);
      return Array.isArray(rows) ? rows : [];
    } catch (err) {
      showToast(err.message || 'Gagal memuat riwayat');
      return [];
    } finally {
      setRiwayatLoading(false);
    }
  }, [showToast]);

  const loadHasil = useCallback(async (runId) => {
    if (!runId) {
      setHasil(null);
      return;
    }
    setHasilLoading(true);
    setHasilError('');
    try {
      const data = await getForecastHasil(runId);
      setHasil(data);
      setExpanded({});
    } catch (err) {
      setHasil(null);
      setHasilError(err.message || 'Gagal memuat hasil');
    } finally {
      setHasilLoading(false);
    }
  }, []);

  const loadPengaturan = useCallback(async () => {
    try {
      const row = await getForecastPengaturan();
      setPengaturan(row);
      setPeriodeHistoriDraft(row?.periode_histori_hari ?? 90);
    } catch (err) {
      showToast(err.message || 'Gagal memuat pengaturan');
    }
  }, [showToast]);

  useEffect(() => {
    getSupplierMapAktif()
      .then((map) => setSupplierMap(map || {}))
      .catch(() => setSupplierMap({}));
  }, []);

  useEffect(() => {
    loadRiwayat().then((rows) => {
      if (!runIdParam && rows[0]?.id) {
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            if (!p.get('tab')) p.set('tab', 'hasil');
            p.set('run', rows[0].id);
            return p;
          },
          { replace: true }
        );
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'hasil' && runIdParam) {
      loadHasil(runIdParam);
    }
  }, [tab, runIdParam, loadHasil]);

  useEffect(() => {
    if (tab === 'riwayat') loadRiwayat();
  }, [tab, loadRiwayat]);

  useEffect(() => {
    if (tab === 'pengaturan' && isOwner) loadPengaturan();
  }, [tab, isOwner, loadPengaturan]);

  const filterOptions = useMemo(() => {
    const golonganNames = [];
    const supplierSet = new Set();
    for (const grup of hasil?.grup || []) {
      for (const obat of grup.obat || []) {
        if (obat.golongan?.nama) golonganNames.push(obat.golongan.nama);
        for (const s of supplierMap[obat.kode_obat] || []) {
          const label = supplierInisialLabel(s);
          if (label) supplierSet.add(label);
        }
      }
    }
    return {
      golongan: sortGolonganFilterOptions(golonganNames),
      supplier: [...supplierSet].sort((a, b) => a.localeCompare(b, 'id')),
    };
  }, [hasil, supplierMap]);

  const { visibleGrup, autoExpandNames } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fGol = normalizeFilterSection(filters.golongan);
    const fSup = normalizeFilterSection(filters.supplier);
    const autoExpand = new Set();

    let list = (hasil?.grup || [])
      .map((grup) => {
        const grupNameMatch = q
          ? String(grup.nama || '')
              .toLowerCase()
              .includes(q)
          : false;

        let obat = [...(grup.obat || [])];

        if (fGol.selected.length > 0 || fGol.includeEmpty) {
          obat = obat.filter((o) => {
            const nama = o.golongan?.nama;
            const empty = !nama;
            if (fGol.includeEmpty && empty) return true;
            if (nama && fGol.selected.includes(nama)) return true;
            return false;
          });
        }

        if (fSup.selected.length > 0 || fSup.includeEmpty) {
          obat = obat.filter((o) => {
            const pills = (supplierMap[o.kode_obat] || [])
              .map(supplierInisialLabel)
              .filter(Boolean);
            const empty = pills.length === 0;
            if (fSup.includeEmpty && empty) return true;
            if (fSup.selected.some((s) => pills.includes(s))) return true;
            return false;
          });
        }

        if (q && !grupNameMatch) {
          obat = obat.filter((o) => {
            const blob = `${o.nama_obat || ''} ${o.kode_obat || ''}`.toLowerCase();
            return blob.includes(q);
          });
          if (obat.length > 0) {
            autoExpand.add(grup.nama);
          }
        }

        if (grup.tanpa_substitusi) {
          // Obat "Tanpa Substitusi" berdiri sendiri (setara level grup) —
          // filter checkbox tetap per-obat seperti biasa.
          if (!showCukupStok) {
            obat = obat.filter((o) => (Number(o.kebutuhan_beli) || 0) > 0);
          }
          if (obat.length === 0) return null;
        } else {
          // Grup substitusi: keputusan tampil/sembunyi checkbox di level
          // GRUP (pakai total kebutuhan asli grup, sebelum obat dibuang
          // oleh checkbox) — kalau grup tampil, semua obatnya tampil apa
          // adanya, tidak ada yang dibuang individual.
          if (obat.length === 0) return null;
          const totalKebutuhanAsli = obat.reduce(
            (n, o) => n + (Number(o.kebutuhan_beli) || 0),
            0
          );
          if (!showCukupStok && totalKebutuhanAsli <= 0) return null;
        }

        const totalKebutuhan = obat.reduce(
          (n, o) => n + (Number(o.kebutuhan_beli) || 0),
          0
        );
        const totalStok = obat.reduce(
          (n, o) => n + (Number(o.stok_sekarang) || 0),
          0
        );
        const totalProyeksi = obat.reduce(
          (n, o) => n + (Number(o.perkiraan_terjual) || 0),
          0
        );

        return {
          ...grup,
          obat,
          total_kebutuhan_beli_tab: Number(totalKebutuhan.toFixed(4)),
          total_stok_sekarang: Number(totalStok.toFixed(4)),
          total_perkiraan_terjual: Number(totalProyeksi.toFixed(4)),
        };
      })
      .filter(Boolean);

    if (sort.key === 'nama') {
      list = [...list].sort((a, b) => {
        const cmp = String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
        return sort.direction === 'asc' ? cmp : -cmp;
      });
    } else if (sort.key === 'kebutuhan') {
      list = [...list].sort((a, b) => {
        const cmp =
          (Number(a.total_kebutuhan_beli_tab) || 0) -
          (Number(b.total_kebutuhan_beli_tab) || 0);
        return sort.direction === 'asc' ? cmp : -cmp;
      });
    }

    return { visibleGrup: list, autoExpandNames: autoExpand };
  }, [hasil, search, filters, sort, showCukupStok, supplierMap]);

  const isGrupOpen = (nama) => {
    if (Object.prototype.hasOwnProperty.call(expanded, nama)) {
      return Boolean(expanded[nama]);
    }
    return autoExpandNames.has(nama);
  };

  function openFilterSheet() {
    setDraftSearch(search);
    setDraftSort(sort);
    setDraftFilters({
      golongan: normalizeFilterSection(filters.golongan),
      supplier: normalizeFilterSection(filters.supplier),
    });
    setFilterOpen(true);
  }

  function handleFilterApply() {
    setSearch(draftSearch);
    setSort(draftSort);
    setFilters({
      golongan: normalizeFilterSection(draftFilters.golongan),
      supplier: normalizeFilterSection(draftFilters.supplier),
    });
    setFilterOpen(false);
  }

  function handleFilterReset() {
    setDraftSearch('');
    setDraftSort(EMPTY_SORT);
    setDraftFilters({
      golongan: emptyFilterSection(),
      supplier: emptyFilterSection(),
    });
  }

  async function handleJalankan(e) {
    e.preventDefault();
    if (kategori.length === 0) {
      showToast('Pilih minimal 1 kategori penjualan');
      return;
    }
    const n = Number(periodeForecast);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      showToast('Periode forecast harus bilangan bulat > 0');
      return;
    }

    setRunning(true);
    try {
      const result = await jalankanForecast({
        periode_forecast_hari: n,
        kategori_penjualan: kategori,
      });
      const runId = result.forecast_run_id;
      showToast(
        `Selesai: ${result.ringkasan?.perlu_beli ?? 0} obat perlu beli dari ${result.ringkasan?.total_obat ?? 0}`
      );
      setSheetOpen(false);
      await loadRiwayat();
      setSearchParams({ tab: 'hasil', run: runId });
    } catch (err) {
      showToast(err.message || 'Gagal menjalankan forecast');
    } finally {
      setRunning(false);
    }
  }

  async function handleSavePengaturan(e) {
    e.preventDefault();
    const n = Number(periodeHistoriDraft);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      showToast('Periode histori harus bilangan bulat > 0');
      return;
    }
    setPengaturanSaving(true);
    try {
      const row = await updateForecastPengaturan(n);
      setPengaturan(row);
      showToast('Pengaturan disimpan');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan');
    } finally {
      setPengaturanSaving(false);
    }
  }

  function openRun(runId) {
    setSearchParams({ tab: 'hasil', run: runId });
  }

  function toggleKategori(value) {
    setKategori((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  const tabBtn = (id, label, icon) => {
    const Icon = icon;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        className={`inline-flex items-center gap-1.5 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium ${
          tab === id
            ? 'bg-accent-yellow/15 text-accent-yellow'
            : 'text-text-secondary hover:bg-bg-surface-hover'
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </button>
    );
  };

  return (
    <AppShell
      title="Forecasting"
      actions={
        tab === 'hasil' ? (
          <button
            type="button"
            onClick={openFilterSheet}
            disabled={hasilLoading || !hasil}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary hover:bg-bg-surface-hover hover:text-accent-yellow disabled:opacity-50"
            aria-label="Filter hasil"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null
      }
      pageAction={canTambah ? { onClick: () => setSheetOpen(true) } : null}
      navLoading={hasilLoading || running}
    >
      <div className="mb-3 flex flex-wrap gap-1">
        {tabBtn('hasil', 'Hasil', LineChart)}
        {tabBtn('riwayat', 'Riwayat', History)}
        {isOwner ? tabBtn('pengaturan', 'Pengaturan', Settings2) : null}
      </div>

      {tab === 'hasil' ? (
        <div className="space-y-2">
          {canTambah ? (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Hitung Forecast Baru
            </button>
          ) : null}

          {hasil?.run ? (
            <p className="text-[11px] leading-snug text-text-muted">
              Run {formatTanggal(hasil.run.dijalankan_saat)} · Forecast{' '}
              {hasil.run.periode_forecast_hari} hari · Histori{' '}
              {hasil.run.periode_histori_hari} hari ·{' '}
              {kategoriLabel(hasil.run.kategori_penjualan)}
              {hasil.run.dijalankan_oleh
                ? ` · oleh ${hasil.run.dijalankan_oleh}`
                : ''}
            </p>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-text-secondary">
            <input
              type="checkbox"
              checked={showCukupStok}
              onChange={(e) => setShowCukupStok(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent-yellow"
            />
            Tampilkan yang sudah cukup stok
          </label>

          {hasilLoading ? (
            <div className="flex justify-center py-10">
              <SubmitSpinner className="h-6 w-6" />
            </div>
          ) : hasilError ? (
            <p className="rounded-[4px] bg-state-error/10 px-3 py-2 text-[13px] text-state-error">
              {hasilError}
            </p>
          ) : !runIdParam ? (
            <p className="py-8 text-center text-[13px] text-text-muted">
              Belum ada forecast. Jalankan hitungan baru untuk mulai.
            </p>
          ) : visibleGrup.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-muted">
              Tidak ada grup yang cocok
              {!showCukupStok ? ' (aktifkan toggle / longgarkan filter)' : ''}.
            </p>
          ) : (
            <div className="space-y-1.5">
              {visibleGrup.map((grup) => {
                if (grup.tanpa_substitusi) {
                  return (
                    <div key={grup.nama} className="space-y-1.5">
                      {(grup.obat || []).map((obat) => (
                        <ForecastObatCard
                          key={obat.id || obat.kode_obat}
                          obat={obat}
                        />
                      ))}
                    </div>
                  );
                }

                const isOpen = isGrupOpen(grup.nama);
                return (
                  <ForecastGrupCard
                    key={grup.nama}
                    grup={grup}
                    expanded={isOpen}
                    onToggle={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [grup.nama]: !isOpen,
                      }))
                    }
                  >
                    {(grup.obat || []).map((obat) => (
                      <ForecastObatCard
                        key={obat.id || obat.kode_obat}
                        obat={obat}
                      />
                    ))}
                  </ForecastGrupCard>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'riwayat' ? (
        <div className="space-y-1.5">
          {riwayatLoading ? (
            <div className="flex justify-center py-10">
              <SubmitSpinner className="h-6 w-6" />
            </div>
          ) : riwayat.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-text-muted">
              Belum ada riwayat forecast.
            </p>
          ) : (
            riwayat.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => openRun(run.id)}
                className={`w-full rounded-[4px] px-2.5 py-2 text-left hover:bg-bg-surface-hover ${
                  runIdParam === run.id
                    ? 'bg-accent-yellow/10'
                    : 'bg-bg-surface'
                }`}
              >
                <p className="text-[13px] font-medium text-text-primary">
                  {formatTanggal(run.dijalankan_saat)}
                </p>
                <p className="text-[11px] text-text-muted">
                  Forecast {run.periode_forecast_hari} hari · Histori{' '}
                  {run.periode_histori_hari} hari ·{' '}
                  {kategoriLabel(run.kategori_penjualan)}
                </p>
                {run.dijalankan_oleh ? (
                  <p className="text-[10px] text-text-muted">
                    oleh {run.dijalankan_oleh}
                  </p>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}

      {tab === 'pengaturan' && isOwner ? (
        <form
          onSubmit={handleSavePengaturan}
          className="space-y-3 rounded-[4px] bg-bg-surface px-2.5 py-3"
        >
          <div>
            <label className="block text-[11px] text-text-muted">
              Periode histori (hari)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={periodeHistoriDraft}
              onChange={(e) => setPeriodeHistoriDraft(e.target.value)}
              className="mt-1 w-full rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow"
            />
            <p className="mt-1 text-[10px] leading-snug text-text-muted">
              Dipakai untuk menghitung rata-rata penjualan harian saat forecast
              dijalankan. Saat ini:{' '}
              {pengaturan?.periode_histori_hari ?? '—'} hari.
            </p>
          </div>
          <button
            type="submit"
            disabled={pengaturanSaving}
            className="inline-flex items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-70"
          >
            {pengaturanSaving ? <SubmitSpinner /> : 'Simpan'}
          </button>
        </form>
      ) : null}

      {sheetOpen ? (
        <SheetModal
          title={
            <h2 className="text-[15px] font-semibold text-text-primary">
              Hitung Forecast Baru
            </h2>
          }
          onClose={() => {
            if (!running) setSheetOpen(false);
          }}
          busy={running}
          borderless
          footer={
            <button
              type="submit"
              form="forecast-jalankan-form"
              disabled={running}
              className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-70"
            >
              {running ? (
                <span className="inline-flex items-center gap-2">
                  <SubmitSpinner /> Menghitung…
                </span>
              ) : (
                'Jalankan'
              )}
            </button>
          }
        >
          <form
            id="forecast-jalankan-form"
            onSubmit={handleJalankan}
            className="space-y-3"
          >
            <div>
              <label className="block text-[11px] text-text-muted">
                Periode forecast (hari ke depan)
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={periodeForecast}
                onChange={(e) => setPeriodeForecast(e.target.value)}
                disabled={running}
                className="mt-1 w-full rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] text-text-muted">
                Kategori penjualan
              </p>
              <div className="space-y-1">
                {KATEGORI_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1 py-1.5 hover:bg-bg-base"
                  >
                    <input
                      type="checkbox"
                      checked={kategori.includes(opt.value)}
                      onChange={() => toggleKategori(opt.value)}
                      disabled={running}
                      className="h-3.5 w-3.5 accent-accent-yellow"
                    />
                    <span className="text-[13px] text-text-primary">
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-text-muted">
                Penjualan titipan dihitung sebagai bagian dari Retail.
              </p>
            </div>
            <p className="text-[11px] leading-snug text-text-muted">
              Proses menghitung semua obat Yelo. Bisa memakan waktu beberapa
              detik.
            </p>
          </form>
        </SheetModal>
      ) : null}

      <FilterSortSearchSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter Hasil Forecast"
        searchValue={draftSearch}
        onSearchChange={setDraftSearch}
        searchPlaceholder="Cari grup, nama, atau kode obat..."
        sortOptions={[
          { key: 'nama', label: 'Nama Grup' },
          { key: 'kebutuhan', label: 'Total Kebutuhan' },
        ]}
        sortState={draftSort}
        onSortChange={setDraftSort}
        filterGroups={[
          {
            key: 'golongan',
            label: 'Golongan',
            options: filterOptions.golongan,
            preserveOrder: true,
            showEmptyOption: true,
          },
          {
            key: 'supplier',
            label: 'Supplier',
            options: filterOptions.supplier,
            showEmptyOption: true,
          },
        ]}
        filterState={draftFilters}
        onFilterChange={setDraftFilters}
        onApply={handleFilterApply}
        onReset={handleFilterReset}
      />

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
