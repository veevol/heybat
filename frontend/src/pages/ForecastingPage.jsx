import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MoreVertical, SlidersHorizontal } from 'lucide-react';
import {
  getDefektaCandidates,
  getForecastHasil,
  getForecastPengaturan,
  jalankanForecast,
  listForecastRiwayat,
  resetDefektaPilihan,
  saveDefektaPilihan,
} from '../api/forecast';
import { getSupplierMapAktif } from '../api/matching';
import {
  getObatYelo,
  updateObatYelo,
  updateStatusVmedis,
} from '../api/obatYelo';
import { listRef } from '../api/refData';
import AppShell from '../components/layout/AppShell';
import DefektaSheet from '../components/DefektaSheet';
import {
  ForecastGrupCard,
  ForecastObatCard,
} from '../components/ForecastCards';
import ForecastMenuSheet from '../components/ForecastMenuSheet';
import FilterSortSearchSheet, {
  emptyFilterSection,
  normalizeFilterSection,
} from '../components/FilterSortSearchSheet';
import ObatYeloDetailSheet from '../components/ObatYeloDetailSheet';
import ObatYeloFormModal from '../components/ObatYeloFormModal';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { sortGolonganFilterOptions } from '../lib/obatYelo';

const KATEGORI_OPTIONS = [
  { value: 'retail', label: 'Retail' },
  { value: 'mitra', label: 'Mitra' },
];

const STOK_CUKUP = 'Stok Cukup';
const STOK_KURANG = 'Stok Kurang';
const STOK_OPTIONS = [STOK_CUKUP, STOK_KURANG];

const EMPTY_SORT = { key: null, direction: 'asc' };
const EMPTY_FILTERS = {
  stok: emptyFilterSection([STOK_KURANG]),
  golongan: emptyFilterSection(),
  supplier: emptyFilterSection(),
};
const EMPTY_REFS = {
  kandungan: [],
  golongan: [],
  satuan: [],
  'grup-substitusi': [],
};
const EMPTY_FORM = {
  kode_obat: '',
  nama_obat: '',
  kandungan_id: '',
  golongan_id: '',
  satuan_1_id: '',
  satuan_2_id: '',
  grup_substitusi_id: '',
  konversi: '',
  min_jual: '',
};

function supplierInisialLabel(s) {
  return s?.inisial || s?.nama || '';
}

function numOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function obatToForm(obat) {
  return {
    kode_obat: obat.kode_obat || '',
    nama_obat: obat.nama_obat || '',
    kandungan_id: obat.kandungan_id || obat.kandungan?.id || '',
    golongan_id: obat.golongan_id || obat.golongan?.id || '',
    satuan_1_id: obat.satuan_1_id || obat.satuan_1?.id || '',
    satuan_2_id: obat.satuan_2_id || obat.satuan_2?.id || '',
    grup_substitusi_id:
      obat.grup_substitusi_id || obat.grup_substitusi?.id || '',
    konversi: obat.konversi ?? '',
    min_jual: obat.min_jual ?? '',
  };
}

function formToPayload(form) {
  return {
    kode_obat: form.kode_obat.trim(),
    nama_obat: form.nama_obat.trim(),
    kandungan_id: form.kandungan_id || null,
    golongan_id: form.golongan_id || null,
    satuan_1_id: form.satuan_1_id || null,
    satuan_2_id: form.satuan_2_id || null,
    grup_substitusi_id: form.grup_substitusi_id || null,
    konversi: numOrNull(form.konversi),
    min_jual: numOrNull(form.min_jual),
  };
}

function matchesStokFilter(kebutuhan, stokSelected) {
  if (!stokSelected || stokSelected.length === 0) return true;
  const kurang = (Number(kebutuhan) || 0) > 0;
  const cukup = !kurang;
  if (stokSelected.includes(STOK_KURANG) && kurang) return true;
  if (stokSelected.includes(STOK_CUKUP) && cukup) return true;
  return false;
}

export default function ForecastingPage() {
  const { hasAccess } = useAuth();
  const canTambah = hasAccess('forecasting', 'tambah');
  const canEditObat = hasAccess('data-obat-yelo', 'edit');
  const [searchParams, setSearchParams] = useSearchParams();

  const runIdParam = searchParams.get('run');

  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const [menuOpen, setMenuOpen] = useState(false);
  const [periodeForecast, setPeriodeForecast] = useState(14);
  const [periodeHistoriHitung, setPeriodeHistoriHitung] = useState(90);
  const [kategori, setKategori] = useState(['retail', 'mitra']);
  const [running, setRunning] = useState(false);

  const [riwayat, setRiwayat] = useState([]);
  const [riwayatLoading, setRiwayatLoading] = useState(false);

  const [hasil, setHasil] = useState(null);
  const [hasilLoading, setHasilLoading] = useState(false);
  const [hasilError, setHasilError] = useState('');
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

  const [detailObat, setDetailObat] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [vmedisBusy, setVmedisBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editRefs, setEditRefs] = useState(EMPTY_REFS);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  const [defektaObat, setDefektaObat] = useState(null);
  const [defektaLoading, setDefektaLoading] = useState(false);
  const [defektaSaving, setDefektaSaving] = useState(false);
  const [defektaCandidates, setDefektaCandidates] = useState([]);
  const [defektaSelectedId, setDefektaSelectedId] = useState(null);
  const [defektaRecommendedId, setDefektaRecommendedId] = useState(null);

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
      setPeriodeHistoriHitung(row?.periode_histori_hari ?? 90);
      return row;
    } catch (err) {
      showToast(err.message || 'Gagal memuat pengaturan');
      return null;
    }
  }, [showToast]);

  useEffect(() => {
    getSupplierMapAktif()
      .then((map) => setSupplierMap(map || {}))
      .catch(() => setSupplierMap({}));
    loadPengaturan();
  }, [loadPengaturan]);

  useEffect(() => {
    loadRiwayat().then((rows) => {
      if (!runIdParam && rows[0]?.id) {
        setSearchParams(
          (prev) => {
            const p = new URLSearchParams(prev);
            p.set('run', rows[0].id);
            return p;
          },
          { replace: true }
        );
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (runIdParam) {
      loadHasil(runIdParam);
    }
  }, [runIdParam, loadHasil]);

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
    const fStok = normalizeFilterSection(filters.stok);
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
          obat = obat.filter((o) =>
            matchesStokFilter(o.kebutuhan_beli, fStok.selected)
          );
          if (obat.length === 0) return null;
        } else {
          if (obat.length === 0) return null;
          const totalKebutuhanAsli = obat.reduce(
            (n, o) => n + (Number(o.kebutuhan_beli) || 0),
            0
          );
          if (!matchesStokFilter(totalKebutuhanAsli, fStok.selected)) {
            return null;
          }
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
  }, [hasil, search, filters, sort, supplierMap]);

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
      stok: normalizeFilterSection(filters.stok),
      golongan: normalizeFilterSection(filters.golongan),
      supplier: normalizeFilterSection(filters.supplier),
    });
    setFilterOpen(true);
  }

  function handleFilterApply() {
    setSearch(draftSearch);
    setSort(draftSort);
    setFilters({
      stok: normalizeFilterSection(draftFilters.stok),
      golongan: normalizeFilterSection(draftFilters.golongan),
      supplier: normalizeFilterSection(draftFilters.supplier),
    });
    setFilterOpen(false);
  }

  function handleFilterReset() {
    setDraftSearch('');
    setDraftSort(EMPTY_SORT);
    setDraftFilters({
      stok: emptyFilterSection([STOK_KURANG]),
      golongan: emptyFilterSection(),
      supplier: emptyFilterSection(),
    });
  }

  async function openMenu() {
    setMenuOpen(true);
    loadRiwayat();
    if (!pengaturan) await loadPengaturan();
    else setPeriodeHistoriHitung(pengaturan.periode_histori_hari ?? 90);
  }

  async function handleJalankan(e) {
    e.preventDefault();
    if (kategori.length === 0) {
      showToast('Pilih minimal 1 kategori penjualan');
      return;
    }
    const nForecast = Number(periodeForecast);
    if (
      !Number.isFinite(nForecast) ||
      nForecast <= 0 ||
      !Number.isInteger(nForecast)
    ) {
      showToast('Periode forecast harus bilangan bulat > 0');
      return;
    }
    const nHistori = Number(periodeHistoriHitung);
    if (
      !Number.isFinite(nHistori) ||
      nHistori <= 0 ||
      !Number.isInteger(nHistori)
    ) {
      showToast('Periode histori harus bilangan bulat > 0');
      return;
    }

    setRunning(true);
    try {
      const result = await jalankanForecast({
        periode_forecast_hari: nForecast,
        periode_histori_hari: nHistori,
        kategori_penjualan: kategori,
      });
      const runId = result.forecast_run_id;
      showToast(
        `Selesai: ${result.ringkasan?.perlu_beli ?? 0} obat perlu beli dari ${result.ringkasan?.total_obat ?? 0}`
      );
      setMenuOpen(false);
      await loadRiwayat();
      setSearchParams({ run: runId });
    } catch (err) {
      showToast(err.message || 'Gagal menjalankan forecast');
    } finally {
      setRunning(false);
    }
  }

  function openRun(runId) {
    setMenuOpen(false);
    setSearchParams({ run: runId });
  }

  function toggleKategori(value) {
    setKategori((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  async function openDetail(obatForecast) {
    setDetailLoading(true);
    try {
      const full = await getObatYelo(obatForecast.kode_obat);
      setDetailObat(full);
    } catch (err) {
      showToast(err.message || 'Gagal memuat detail obat');
    } finally {
      setDetailLoading(false);
    }
  }

  async function openEditFromDetail(obat) {
    setDetailObat(null);
    setEditForm(obatToForm(obat));
    setEditError('');
    setEditOpen(true);
    try {
      const [kandungan, golongan, satuan, grup] = await Promise.all([
        listRef('kandungan'),
        listRef('golongan'),
        listRef('satuan'),
        listRef('grup-substitusi'),
      ]);
      setEditRefs({
        kandungan: kandungan || [],
        golongan: golongan || [],
        satuan: satuan || [],
        'grup-substitusi': grup || [],
      });
    } catch (err) {
      showToast(err.message || 'Gagal memuat referensi');
    }
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError('');
    try {
      const payload = formToPayload(editForm);
      const saved = await updateObatYelo(payload.kode_obat, payload);
      setEditOpen(false);
      setDetailObat(saved);
      showToast('Obat disimpan');
      if (runIdParam) loadHasil(runIdParam);
    } catch (err) {
      setEditError(err.message || 'Gagal menyimpan');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleToggleVmedis(obat, checked) {
    setVmedisBusy(true);
    try {
      const saved = await updateStatusVmedis(obat.kode_obat, checked);
      setDetailObat(saved);
      showToast(checked ? 'Ditandai Vmedis' : 'Tanda Vmedis dihapus');
    } catch (err) {
      showToast(err.message || 'Gagal update Vmedis');
    } finally {
      setVmedisBusy(false);
    }
  }

  async function openDefekta(obat) {
    if (!runIdParam) {
      showToast('Belum ada forecast run aktif');
      return;
    }
    setDefektaObat(obat);
    setDefektaLoading(true);
    setDefektaCandidates([]);
    setDefektaSelectedId(null);
    setDefektaRecommendedId(null);
    try {
      const data = await getDefektaCandidates(runIdParam, obat.kode_obat);
      setDefektaCandidates(data.candidates || []);
      setDefektaRecommendedId(data.recommended_supplier_id || null);
      setDefektaSelectedId(
        data.selected_supplier_id || data.recommended_supplier_id || null
      );
    } catch (err) {
      showToast(err.message || 'Gagal memuat Defekta');
      setDefektaObat(null);
    } finally {
      setDefektaLoading(false);
    }
  }

  async function handleDefektaSave(supplierId) {
    if (!runIdParam || !defektaObat || !supplierId) return;
    const row = defektaCandidates.find((c) => c.supplier_id === supplierId);
    setDefektaSaving(true);
    try {
      await saveDefektaPilihan(runIdParam, defektaObat.kode_obat, {
        supplier_id: supplierId,
        pricelist_kode_pbf: row?.pricelist_kode_pbf || null,
      });
      setDefektaSelectedId(supplierId);
      showToast('Pilihan PBF disimpan');
      setDefektaObat(null);
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan Defekta');
    } finally {
      setDefektaSaving(false);
    }
  }

  async function handleDefektaReset() {
    if (!runIdParam || !defektaObat) return;
    setDefektaSaving(true);
    try {
      await resetDefektaPilihan(runIdParam, defektaObat.kode_obat);
      setDefektaSelectedId(defektaRecommendedId);
      showToast('Kembali ke rekomendasi bobot tertinggi');
    } catch (err) {
      showToast(err.message || 'Gagal reset Defekta');
    } finally {
      setDefektaSaving(false);
    }
  }

  const cardHandlers = {
    onOpenDetail: openDetail,
    onOpenDefekta: openDefekta,
  };

  return (
    <AppShell
      title="Forecasting"
      actions={
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={openFilterSheet}
            disabled={hasilLoading || !hasil}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary hover:bg-bg-surface-hover hover:text-accent-yellow disabled:opacity-50"
            aria-label="Filter hasil"
          >
            <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={openMenu}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary hover:bg-bg-surface-hover hover:text-accent-yellow"
            aria-label="Menu forecasting"
          >
            <MoreVertical className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      }
      pageAction={null}
      navLoading={hasilLoading || running || detailLoading}
    >
      <div className="space-y-2">
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
            Belum ada forecast. Buka menu titik tiga untuk menghitung.
          </p>
        ) : visibleGrup.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-text-muted">
            Tidak ada grup yang cocok (longgarkan filter Stok / lainnya).
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
                        {...cardHandlers}
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
                      {...cardHandlers}
                    />
                  ))}
                </ForecastGrupCard>
              );
            })}
          </div>
        )}
      </div>

      <ForecastMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        riwayat={riwayat}
        riwayatLoading={riwayatLoading}
        activeRunId={runIdParam}
        onSelectRun={openRun}
        canHitung={canTambah}
        periodeHistori={periodeHistoriHitung}
        onPeriodeHistoriChange={setPeriodeHistoriHitung}
        periodeForecast={periodeForecast}
        onPeriodeForecastChange={setPeriodeForecast}
        kategori={kategori}
        onToggleKategori={toggleKategori}
        onHitung={handleJalankan}
        running={running}
      />

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
            key: 'stok',
            label: 'Stok',
            options: STOK_OPTIONS,
            preserveOrder: true,
          },
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

      {detailObat && !editOpen ? (
        <ObatYeloDetailSheet
          obat={detailObat}
          suppliers={supplierMap[detailObat.kode_obat] || []}
          onClose={() => setDetailObat(null)}
          onEdit={canEditObat ? openEditFromDetail : null}
          onDelete={null}
          onToggleVmedis={canEditObat ? handleToggleVmedis : null}
          vmedisBusy={vmedisBusy}
        />
      ) : null}

      {editOpen ? (
        <ObatYeloFormModal
          mode="edit"
          values={editForm}
          onChange={setEditForm}
          onField={(key, value) =>
            setEditForm((prev) => ({ ...prev, [key]: value }))
          }
          refs={editRefs}
          onRefCreated={(jenis, created) => {
            setEditRefs((prev) => ({
              ...prev,
              [jenis]: [...(prev[jenis] || []), created],
            }));
            const idKey =
              jenis === 'grup-substitusi'
                ? 'grup_substitusi_id'
                : `${jenis.replace(/-/g, '_')}_id`;
            if (jenis === 'satuan') return;
            setEditForm((prev) => ({ ...prev, [idKey]: created.id }));
          }}
          submitting={editSubmitting}
          error={editError}
          onClose={() => {
            if (!editSubmitting) setEditOpen(false);
          }}
          onSubmit={handleEditSubmit}
          showSupplierField={false}
        />
      ) : null}

      <DefektaSheet
        open={Boolean(defektaObat)}
        obat={defektaObat}
        candidates={defektaCandidates}
        loading={defektaLoading}
        saving={defektaSaving}
        selectedSupplierId={defektaSelectedId}
        recommendedSupplierId={defektaRecommendedId}
        onSelectSupplier={setDefektaSelectedId}
        onSave={handleDefektaSave}
        onReset={handleDefektaReset}
        onClose={() => {
          if (!defektaSaving) setDefektaObat(null);
        }}
      />

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
