import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MoreVertical, SlidersHorizontal } from 'lucide-react';
import {
  getDefektaCandidates,
  getDefektaFilter,
  getForecastHasil,
  getForecastPengaturan,
  jalankanForecast,
  listForecastRiwayat,
  resetDefektaPilihan,
  saveDefektaPilihan,
  setujuiSemuaDefekta,
} from '../api/forecast';
import { getSupplierMapAktif, syncObatSuppliers } from '../api/matching';
import {
  deleteObatYelo,
  getObatYelo,
  updateObatYelo,
  updateStatusVmedis,
} from '../api/obatYelo';
import { listLatestPricelist } from '../api/pricelist';
import { listRef } from '../api/refData';
import { listSuppliers } from '../api/suppliers';
import AppShell from '../components/layout/AppShell';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import DefektaFilterPills from '../components/DefektaFilterPills';
import DefektaSheet from '../components/DefektaSheet';
import {
  ForecastGrupCard,
  ForecastObatCard,
} from '../components/ForecastCards';
import ForecastActionsSheet from '../components/ForecastActionsSheet';
import ForecastMenuSheet from '../components/ForecastMenuSheet';
import FilterSortSearchSheet, {
  emptyFilterSection,
  normalizeFilterSection,
} from '../components/FilterSortSearchSheet';
import ObatYeloDetailSheet from '../components/ObatYeloDetailSheet';
import ObatYeloFormModal from '../components/ObatYeloFormModal';
import StickySearchBar from '../components/StickySearchBar';
import PricelistPickSheet from '../components/PricelistPickSheet';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import {
  computeQtyOrderDefekta,
  qtyOrderSatuanLabel,
  sortGolonganFilterOptions,
} from '../lib/obatYelo';

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

/** Date → YYYY-MM-DD (Asia/Jakarta). */
function formatYmdJakarta(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Default rentang history dari pengaturan + tanggal penjualan terakhir. */
function defaultHistoriRange(pengaturan) {
  const defaultDays = Number(pengaturan?.periode_histori_hari) || 90;
  const sampai =
    pengaturan?.tanggal_penjualan_terakhir || formatYmdJakarta();
  const dari = addDaysYmd(sampai, -(defaultDays - 1));
  return { dari, sampai };
}

function matchesDefektaPill(obat, defektaPill) {
  if (!defektaPill || defektaPill === 'semua') return true;
  const pilihan = obat?.pilihan_disetujui || [];
  if (defektaPill === 'belum') {
    return !pilihan.length;
  }
  if (defektaPill.startsWith('pbf:')) {
    const sid = defektaPill.slice(4);
    return pilihan.some((p) => p.supplier_id === sid);
  }
  return true;
}

export default function ForecastingPage() {
  const { profile, hasAccess } = useAuth();
  const isOwner = profile?.is_owner === true;
  const canTambah = hasAccess('forecasting', 'tambah');
  const canEditObat = hasAccess('data-obat-yelo', 'edit');
  const canHapusObat = hasAccess('data-obat-yelo', 'hapus');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const runIdParam = searchParams.get('run');

  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [hitungOpen, setHitungOpen] = useState(false);
  const [periodeForecast, setPeriodeForecast] = useState(14);
  const [historiDari, setHistoriDari] = useState('');
  const [historiSampai, setHistoriSampai] = useState('');
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
  const [draftSort, setDraftSort] = useState(EMPTY_SORT);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);

  const [pengaturan, setPengaturan] = useState(null);

  const [detailObat, setDetailObat] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [vmedisBusy, setVmedisBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editRefs, setEditRefs] = useState(EMPTY_REFS);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [editSuppliers, setEditSuppliers] = useState([]);
  const [initialEditSupplierIds, setInitialEditSupplierIds] = useState([]);
  const [pendingSupplier, setPendingSupplier] = useState(null);
  const [pricelistItems, setPricelistItems] = useState([]);
  const [pricelistLoading, setPricelistLoading] = useState(false);

  const [defektaObat, setDefektaObat] = useState(null);
  const [defektaLoading, setDefektaLoading] = useState(false);
  const [defektaSaving, setDefektaSaving] = useState(false);
  const [defektaCandidates, setDefektaCandidates] = useState([]);
  const [defektaSelectedId, setDefektaSelectedId] = useState(null);
  const [defektaRecommendedId, setDefektaRecommendedId] = useState(null);
  const [defektaDefaultQty, setDefektaDefaultQty] = useState(null);
  const [defektaQtySatuan, setDefektaQtySatuan] = useState(null);
  const [defektaPill, setDefektaPill] = useState('semua');
  const [defektaFilter, setDefektaFilter] = useState(null);
  const [defektaFilterLoading, setDefektaFilterLoading] = useState(false);
  const [setujuiSemuaBusy, setSetujuiSemuaBusy] = useState(false);

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
      return null;
    }
    setHasilLoading(true);
    setHasilError('');
    try {
      const data = await getForecastHasil(runId);
      setHasil(data);
      setExpanded({});
      return data;
    } catch (err) {
      setHasil(null);
      setHasilError(err.message || 'Gagal memuat hasil');
      return null;
    } finally {
      setHasilLoading(false);
    }
  }, []);

  const loadDefektaFilter = useCallback(async (runId) => {
    if (!runId) {
      setDefektaFilter(null);
      return null;
    }
    setDefektaFilterLoading(true);
    try {
      const data = await getDefektaFilter(runId);
      setDefektaFilter(data);
      return data;
    } catch (err) {
      showToast(err.message || 'Gagal memuat filter Defekta');
      return null;
    } finally {
      setDefektaFilterLoading(false);
    }
  }, [showToast]);

  const refreshDefektaData = useCallback(
    async (runId) => {
      if (!runId) return { hasil: null, filter: null };
      const [hasilData, filterData] = await Promise.all([
        loadHasil(runId),
        loadDefektaFilter(runId),
      ]);
      return { hasil: hasilData, filter: filterData };
    },
    [loadHasil, loadDefektaFilter]
  );

  const loadPengaturan = useCallback(async () => {
    try {
      const row = await getForecastPengaturan();
      setPengaturan(row);
      const range = defaultHistoriRange(row);
      setHistoriDari(range.dari);
      setHistoriSampai(range.sampai);
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
      setDefektaPill('semua');
      loadHasil(runIdParam);
      loadDefektaFilter(runIdParam);
    } else {
      setDefektaFilter(null);
    }
  }, [runIdParam, loadHasil, loadDefektaFilter]);

  // Kalau pill PBF aktif tapi PBF itu hilang dari ringkasan → kembali ke Semua
  useEffect(() => {
    if (!defektaPill.startsWith('pbf:')) return;
    const sid = defektaPill.slice(4);
    const stillThere = (defektaFilter?.pbf_terpilih || []).some(
      (p) => p.supplier_id === sid
    );
    if (!stillThere) setDefektaPill('semua');
  }, [defektaFilter, defektaPill]);

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

        // Layer Defekta pill (Semua / Belum Dipilih / per-PBF)
        obat = obat.filter((o) => matchesDefektaPill(o, defektaPill));
        if (obat.length === 0) return null;

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
  }, [hasil, search, filters, sort, supplierMap, defektaPill]);

  const isGrupOpen = (nama) => {
    if (Object.prototype.hasOwnProperty.call(expanded, nama)) {
      return Boolean(expanded[nama]);
    }
    return autoExpandNames.has(nama);
  };

  function openFilterSheet() {
    setDraftSort(sort);
    setDraftFilters({
      stok: normalizeFilterSection(filters.stok),
      golongan: normalizeFilterSection(filters.golongan),
      supplier: normalizeFilterSection(filters.supplier),
    });
    setFilterOpen(true);
  }

  function handleFilterApply() {
    setSort(draftSort);
    setFilters({
      stok: normalizeFilterSection(draftFilters.stok),
      golongan: normalizeFilterSection(draftFilters.golongan),
      supplier: normalizeFilterSection(draftFilters.supplier),
    });
    setFilterOpen(false);
  }

  function handleFilterReset() {
    setDraftSort(EMPTY_SORT);
    setDraftFilters({
      stok: emptyFilterSection([STOK_KURANG]),
      golongan: emptyFilterSection(),
      supplier: emptyFilterSection(),
    });
  }

  function openActionsMenu() {
    setActionsOpen(true);
  }

  async function openHitungSheet() {
    setActionsOpen(false);
    setHitungOpen(true);
    loadRiwayat();
    const row = pengaturan || (await loadPengaturan());
    if (row) {
      const range = defaultHistoriRange(row);
      setHistoriDari(range.dari);
      setHistoriSampai(range.sampai);
    }
  }

  function openPembuatanSp() {
    if (!runIdParam) {
      showToast('Pilih / buka 1 forecast run dulu sebelum Pembuatan SP');
      return;
    }
    setActionsOpen(false);
    navigate(`/pembuatan-sp/${runIdParam}`);
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
      showToast('Periode proyeksi harus bilangan bulat > 0');
      return;
    }
    const dari = String(historiDari || '').trim();
    const sampai = String(historiSampai || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dari) || !/^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
      showToast('Pilih periode history (dari–sampai)');
      return;
    }
    if (dari > sampai) {
      showToast('Tanggal awal history tidak boleh setelah tanggal akhir');
      return;
    }

    setRunning(true);
    try {
      const result = await jalankanForecast({
        periode_forecast_hari: nForecast,
        histori_dari: dari,
        histori_sampai: sampai,
        kategori_penjualan: kategori,
      });
      const runId = result.forecast_run_id;
      showToast(
        `Selesai: ${result.ringkasan?.perlu_beli ?? 0} obat perlu beli dari ${result.ringkasan?.total_obat ?? 0}`
      );
      setHitungOpen(false);
      await loadRiwayat();
      setSearchParams({ run: runId });
    } catch (err) {
      showToast(err.message || 'Gagal menjalankan forecast');
    } finally {
      setRunning(false);
    }
  }

  function openRun(runId) {
    setHitungOpen(false);
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

    const current = (supplierMap[obat.kode_obat] || []).map((s) => ({
      id: s.id,
      nama: s.nama,
      inisial: s.inisial,
      pricelist_kode_pbf: s.pricelist_kode_pbf || null,
      pricelist_nama_barang: s.pricelist_nama_barang || null,
      matching_id: s.matching_id || null,
    }));
    setEditSuppliers(current);
    setInitialEditSupplierIds(current.map((s) => s.id));

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

    if (isOwner) {
      listSuppliers()
        .then((list) => setAllSuppliers(list || []))
        .catch((err) => showToast(err.message || 'Gagal memuat supplier'));
    }
  }

  function closeEditForm() {
    if (editSubmitting) return;
    setEditOpen(false);
    setEditError('');
    setEditSuppliers([]);
    setInitialEditSupplierIds([]);
    setPendingSupplier(null);
    setPricelistItems([]);
  }

  async function handleSupplierAdd(supplier) {
    if (editSuppliers.some((s) => s.id === supplier.id)) return;
    setPendingSupplier(supplier);
    setPricelistLoading(true);
    setPricelistItems([]);
    try {
      const list = await listLatestPricelist(supplier.id);
      setPricelistItems(list || []);
    } catch (err) {
      showToast(err.message || 'Gagal memuat pricelist');
      setPendingSupplier(null);
    } finally {
      setPricelistLoading(false);
    }
  }

  function handlePricelistPicked(row) {
    if (!pendingSupplier) return;
    setEditSuppliers((prev) => [
      ...prev,
      {
        id: pendingSupplier.id,
        nama: pendingSupplier.nama,
        inisial: pendingSupplier.inisial,
        pricelist_kode_pbf: row.kode_pbf,
        pricelist_nama_barang: row.nama_barang || null,
        matching_id: null,
        _isNew: true,
      },
    ]);
    setPendingSupplier(null);
    setPricelistItems([]);
  }

  function handleSupplierRemove(supplierId) {
    setEditSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError('');
    try {
      const payload = formToPayload(editForm);
      const { kode_obat: kodeObat, ...rest } = payload;
      const saved = await updateObatYelo(kodeObat, rest);

      if (isOwner) {
        const currentIds = new Set(editSuppliers.map((s) => s.id));
        const initialIds = new Set(initialEditSupplierIds);
        const removeSet = new Set(
          [...initialIds].filter((id) => !currentIds.has(id))
        );
        for (const s of editSuppliers) {
          if (s._isNew && initialIds.has(s.id)) removeSet.add(s.id);
        }
        const remove_pbf_ids = [...removeSet];
        const add = editSuppliers
          .filter((s) => s._isNew && s.pricelist_kode_pbf)
          .map((s) => ({
            pricelist_pbf_id: s.id,
            pricelist_kode_pbf: s.pricelist_kode_pbf,
          }));

        if (add.length > 0 || remove_pbf_ids.length > 0) {
          const syncResult = await syncObatSuppliers(kodeObat, {
            add,
            remove_pbf_ids,
          });
          setSupplierMap((prev) => ({
            ...prev,
            [kodeObat]: syncResult.suppliers || [],
          }));
        }
      }

      setEditOpen(false);
      setEditSuppliers([]);
      setInitialEditSupplierIds([]);
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

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteSubmitting(true);
    try {
      await deleteObatYelo(deleting.kode_obat);
      showToast('Obat berhasil dihapus');
      setDeleting(null);
      setDetailObat(null);
      setSupplierMap((prev) => {
        const next = { ...prev };
        delete next[deleting.kode_obat];
        return next;
      });
      if (runIdParam) loadHasil(runIdParam);
    } catch (err) {
      showToast(err.message || 'Gagal menghapus obat');
    } finally {
      setDeleteSubmitting(false);
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
    setDefektaDefaultQty(
      obat?.kebutuhan_beli != null
        ? computeQtyOrderDefekta(obat.kebutuhan_beli, obat)
        : null
    );
    setDefektaQtySatuan(qtyOrderSatuanLabel(obat));
    try {
      const data = await getDefektaCandidates(runIdParam, obat.kode_obat);
      setDefektaCandidates(data.candidates || []);
      setDefektaRecommendedId(data.recommended_supplier_id || null);
      setDefektaSelectedId(
        data.selected_supplier_id || data.recommended_supplier_id || null
      );
      if (data.default_qty_order != null) {
        setDefektaDefaultQty(Number(data.default_qty_order));
      }
      if (data.qty_order_satuan) {
        setDefektaQtySatuan(data.qty_order_satuan);
      } else if (data.obat_meta) {
        setDefektaQtySatuan(
          qtyOrderSatuanLabel({
            konversi: data.obat_meta.konversi,
            satuan_1: data.obat_meta.satuan_1,
            satuan_2: data.obat_meta.satuan_2,
          })
        );
      }
    } catch (err) {
      showToast(err.message || 'Gagal memuat Defekta');
      setDefektaObat(null);
    } finally {
      setDefektaLoading(false);
    }
  }

  async function handleDefektaSave(supplierId, opts = {}) {
    if (!runIdParam || !defektaObat || !supplierId) return;
    const row = defektaCandidates.find((c) => c.supplier_id === supplierId);
    setDefektaSaving(true);
    try {
      let qtyRaw =
        opts.qty_order !== undefined
          ? Number(opts.qty_order)
          : computeQtyOrderDefekta(defektaObat.kebutuhan_beli, defektaObat);
      if (Number.isFinite(qtyRaw) && !Number.isInteger(qtyRaw)) {
        qtyRaw = Math.round(qtyRaw);
      }
      await saveDefektaPilihan(runIdParam, defektaObat.kode_obat, {
        supplier_id: supplierId,
        pricelist_kode_pbf: row?.pricelist_kode_pbf || null,
        qty_order: Number.isFinite(qtyRaw) ? qtyRaw : null,
      });
      setDefektaSelectedId(supplierId);
      showToast('Pilihan PBF disimpan');
      setDefektaObat(null);
      await refreshDefektaData(runIdParam);
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan Defekta');
    } finally {
      setDefektaSaving(false);
    }
  }

  async function handleDefektaBatalkan(supplierId) {
    if (!runIdParam || !defektaObat || !supplierId) return;
    setDefektaSaving(true);
    try {
      await resetDefektaPilihan(
        runIdParam,
        defektaObat.kode_obat,
        supplierId
      );
      showToast('Pilihan PBF dibatalkan');
      const { hasil: freshHasil } = await refreshDefektaData(runIdParam);
      const data = await getDefektaCandidates(
        runIdParam,
        defektaObat.kode_obat
      );
      setDefektaCandidates(data.candidates || []);
      setDefektaRecommendedId(data.recommended_supplier_id || null);
      setDefektaSelectedId(
        data.selected_supplier_id || data.recommended_supplier_id || null
      );
      if (data.default_qty_order != null) {
        setDefektaDefaultQty(Number(data.default_qty_order));
      }
      if (data.qty_order_satuan) {
        setDefektaQtySatuan(data.qty_order_satuan);
      }
      const refreshedObat =
        (freshHasil?.grup || [])
          .flatMap((g) => g.obat || [])
          .find((o) => o.kode_obat === defektaObat.kode_obat) || defektaObat;
      setDefektaObat(refreshedObat);
    } catch (err) {
      showToast(err.message || 'Gagal batalkan Defekta');
    } finally {
      setDefektaSaving(false);
    }
  }

  async function handleSetujuiSemua() {
    if (!runIdParam || setujuiSemuaBusy) return;
    setSetujuiSemuaBusy(true);
    try {
      const result = await setujuiSemuaDefekta(runIdParam);
      const nOk = Number(result?.jumlah_disetujui) || 0;
      const nSkip = Number(result?.jumlah_dilewati) || 0;
      if (nSkip > 0) {
        showToast(
          `${nOk} obat disetujui, ${nSkip} dilewati (tidak ada PBF cocok)`
        );
      } else {
        showToast(`${nOk} obat disetujui`);
      }
      await refreshDefektaData(runIdParam);
    } catch (err) {
      showToast(err.message || 'Gagal Setujui Semua');
    } finally {
      setSetujuiSemuaBusy(false);
    }
  }

  function suppliersForObat(kodeObat) {
    return supplierMap[kodeObat] || [];
  }

  function uniqueSuppliersForGrup(grup) {
    const seen = new Set();
    const list = [];
    for (const obat of grup.obat || []) {
      for (const s of supplierMap[obat.kode_obat] || []) {
        if (!s?.id || seen.has(s.id)) continue;
        seen.add(s.id);
        list.push(s);
      }
    }
    list.sort((a, b) =>
      String(a.inisial || a.nama || '').localeCompare(
        String(b.inisial || b.nama || ''),
        'id'
      )
    );
    return list;
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
            onClick={openActionsMenu}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary hover:bg-bg-surface-hover hover:text-accent-yellow"
            aria-label="Menu forecasting"
          >
            <MoreVertical className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      }
      pageAction={null}
      navLoading={
        hasilLoading ||
        running ||
        detailLoading ||
        setujuiSemuaBusy ||
        defektaFilterLoading
      }
    >
      {runIdParam ? (
        <StickySearchBar
          value={search}
          onChange={setSearch}
          placeholder="Cari grup, nama, atau kode obat..."
        >
          <DefektaFilterPills
            activeKey={defektaPill}
            totalBelumDipilih={defektaFilter?.total_belum_dipilih ?? 0}
            pbfTerpilih={defektaFilter?.pbf_terpilih || []}
            onChange={setDefektaPill}
            disabled={hasilLoading || setujuiSemuaBusy}
            embedded
          />
        </StickySearchBar>
      ) : null}

      <div className="space-y-2">
        {defektaPill === 'belum' && runIdParam && !hasilLoading && !hasilError ? (
          <button
            type="button"
            onClick={handleSetujuiSemua}
            disabled={setujuiSemuaBusy || (defektaFilter?.total_belum_dipilih ?? 0) === 0}
            className="flex w-full items-center justify-center gap-2 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
          >
            {setujuiSemuaBusy ? <SubmitSpinner /> : 'Setujui Semua'}
          </button>
        ) : null}

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
                        suppliers={suppliersForObat(obat.kode_obat)}
                        activeSupplierId={obat.active_supplier_id || null}
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
                  suppliers={uniqueSuppliersForGrup(grup)}
                  activeSupplierId={grup.recommended_grup_supplier_id || null}
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
                      suppliers={suppliersForObat(obat.kode_obat)}
                      activeSupplierId={obat.active_supplier_id || null}
                      {...cardHandlers}
                    />
                  ))}
                </ForecastGrupCard>
              );
            })}
          </div>
        )}
      </div>

      <ForecastActionsSheet
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onHitungForecasting={openHitungSheet}
        onPembuatanSp={openPembuatanSp}
        canPembuatanSp={Boolean(runIdParam)}
      />

      <ForecastMenuSheet
        open={hitungOpen}
        onClose={() => setHitungOpen(false)}
        riwayat={riwayat}
        riwayatLoading={riwayatLoading}
        activeRunId={runIdParam}
        onSelectRun={openRun}
        canHitung={canTambah}
        historiDari={historiDari}
        onHistoriDariChange={setHistoriDari}
        historiSampai={historiSampai}
        onHistoriSampaiChange={setHistoriSampai}
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
        showSearch={false}
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

      {detailObat && !editOpen && !deleting ? (
        <ObatYeloDetailSheet
          obat={detailObat}
          suppliers={supplierMap[detailObat.kode_obat] || []}
          onClose={() => setDetailObat(null)}
          onEdit={canEditObat ? openEditFromDetail : null}
          onDelete={
            canHapusObat
              ? (obat) => {
                  setDetailObat(null);
                  setDeleting(obat);
                }
              : null
          }
          onToggleVmedis={canEditObat ? handleToggleVmedis : null}
          vmedisBusy={vmedisBusy}
        />
      ) : null}

      {deleting ? (
        <ConfirmDeleteModal
          confirmName={deleting.nama_obat}
          title="Hapus Obat"
          entityLabel="obat"
          submitting={deleteSubmitting}
          onClose={() => {
            if (!deleteSubmitting) setDeleting(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      {editOpen ? (
        <ObatYeloFormModal
          mode="edit"
          values={editForm}
          onChange={(e) => {
            const { name, value } = e.target;
            setEditForm((prev) => ({ ...prev, [name]: value }));
          }}
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
          onClose={closeEditForm}
          onSubmit={handleEditSubmit}
          showSupplierField={isOwner}
          supplierOptions={allSuppliers}
          supplierValue={editSuppliers}
          onSupplierAdd={handleSupplierAdd}
          onSupplierRemove={handleSupplierRemove}
        />
      ) : null}

      {pendingSupplier ? (
        <PricelistPickSheet
          supplier={pendingSupplier}
          items={pricelistItems}
          loading={pricelistLoading}
          onClose={() => {
            if (!pricelistLoading) {
              setPendingSupplier(null);
              setPricelistItems([]);
            }
          }}
          onPick={handlePricelistPicked}
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
        defaultQtyOrder={defektaDefaultQty}
        qtyOrderSatuan={defektaQtySatuan}
        onSelectSupplier={setDefektaSelectedId}
        onSave={handleDefektaSave}
        onBatalkan={handleDefektaBatalkan}
        onClose={() => {
          if (!defektaSaving) setDefektaObat(null);
        }}
      />

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
