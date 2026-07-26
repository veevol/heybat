import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  createObatYelo,
  deleteObatYelo,
  getNextKodeApp,
  listObatYelo,
  updateObatYelo,
  updateStatusVmedis,
} from '../api/obatYelo';
import { getSupplierMapAktif, syncObatSuppliers } from '../api/matching';
import { listLatestPricelist } from '../api/pricelist';
import { listSuppliers } from '../api/suppliers';
import { listRef } from '../api/refData';
import AppShell from '../components/layout/AppShell';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import FilterSortSearchSheet, {
  emptyFilterSection,
  normalizeFilterSection,
} from '../components/FilterSortSearchSheet';
import ObatYeloCard from '../components/ObatYeloCard';
import ObatYeloDetailSheet from '../components/ObatYeloDetailSheet';
import ObatYeloFormModal from '../components/ObatYeloFormModal';
import ObatYeloSkeleton from '../components/ObatYeloSkeleton';
import PricelistPickSheet from '../components/PricelistPickSheet';
import TambahObatDariMatchingModal from '../components/TambahObatDariMatchingModal';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import {
  compareKodeObat,
  isBelumDiVmedis,
  isSudahDiVmedis,
  sortGolonganFilterOptions,
} from '../lib/obatYelo';
import {
  getObatYeloCache,
  setObatYeloCache,
  updateObatYeloCacheItems,
  updateObatYeloCacheSupplierMap,
} from '../lib/obatYeloCache';

const PAGE_CHUNK = 50;

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

const EMPTY_REFS = {
  kandungan: [],
  golongan: [],
  satuan: [],
  'grup-substitusi': [],
};

const EMPTY_SORT = { key: null, direction: 'asc' };
const EMPTY_FILTERS = {
  stok: emptyFilterSection(['Ready']),
  supplier: emptyFilterSection(),
  golongan: emptyFilterSection(),
  substitusi: emptyFilterSection(),
  satuan: emptyFilterSection(),
  konversi: emptyFilterSection(),
  status_vmedis: emptyFilterSection(),
};

function isFieldEmpty(value) {
  return value === null || value === undefined || value === '';
}

/** Match checklist filter: selected values OR includeEmpty for null/blank. */
function matchesChecklistFilter(section, fieldValue) {
  const { selected, includeEmpty } = normalizeFilterSection(section);
  if (selected.length === 0 && !includeEmpty) return true;
  const empty = isFieldEmpty(fieldValue);
  if (includeEmpty && empty) return true;
  if (!empty && selected.includes(fieldValue)) return true;
  return false;
}

function hasStokData(obat) {
  const s = obat?.stok_ringkasan;
  return s != null && s.stok_total !== null && s.stok_total !== undefined;
}

function toPayload(form) {
  const numOrNull = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
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

function obatToForm(obat) {
  return {
    kode_obat: obat.kode_obat || '',
    nama_obat: obat.nama_obat || '',
    kandungan_id: obat.kandungan_id || '',
    golongan_id: obat.golongan_id || '',
    satuan_1_id: obat.satuan_1_id || '',
    satuan_2_id: obat.satuan_2_id || '',
    grup_substitusi_id: obat.grup_substitusi_id || '',
    konversi: obat.konversi ?? '',
    min_jual: obat.min_jual ?? '',
  };
}

function supplierInisialLabel(s) {
  return s?.inisial || s?.nama || '';
}

export default function DataObatYeloPage() {
  const { profile, hasAccess } = useAuth();
  const isOwner = profile?.is_owner === true;
  const canTambah = hasAccess('data-obat-yelo', 'tambah');
  const canEdit = hasAccess('data-obat-yelo', 'edit');
  const canHapus = hasAccess('data-obat-yelo', 'hapus');
  const [items, setItems] = useState([]);
  const [supplierMap, setSupplierMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refs, setRefs] = useState(EMPTY_REFS);
  const [selected, setSelected] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_CHUNK);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(EMPTY_SORT);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftSearch, setDraftSearch] = useState('');
  const [draftSort, setDraftSort] = useState(EMPTY_SORT);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState(EMPTY_FORM);
  const [quickRefs, setQuickRefs] = useState(EMPTY_REFS);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [quickKodeLoading, setQuickKodeLoading] = useState(false);
  const [vmedisBusy, setVmedisBusy] = useState(false);

  const [allSuppliers, setAllSuppliers] = useState([]);
  const [editSuppliers, setEditSuppliers] = useState([]);
  const [initialEditSupplierIds, setInitialEditSupplierIds] = useState([]);
  const [pendingSupplier, setPendingSupplier] = useState(null);
  const [pricelistItems, setPricelistItems] = useState([]);
  const [pricelistLoading, setPricelistLoading] = useState(false);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }, []);

  const loadRefs = useCallback(async () => {
    try {
      const [kandungan, golongan, satuan, grup] = await Promise.all([
        listRef('kandungan'),
        listRef('golongan'),
        listRef('satuan'),
        listRef('grup-substitusi'),
      ]);
      const next = {
        kandungan: kandungan || [],
        golongan: golongan || [],
        satuan: satuan || [],
        'grup-substitusi': grup || [],
      };
      setRefs(next);
      return next;
    } catch (err) {
      showToast(err.message || 'Gagal memuat data referensi');
      return EMPTY_REFS;
    }
  }, [showToast]);

  const applyLoaded = useCallback((obatList, map) => {
    setItems(obatList || []);
    setSupplierMap(map || {});
    setObatYeloCache({ items: obatList || [], supplierMap: map || {} });
  }, []);

  const refreshAll = useCallback(
    async ({ force = false } = {}) => {
      if (!force) {
        const cached = getObatYeloCache();
        if (cached) {
          setItems(cached.items || []);
          setSupplierMap(cached.supplierMap || {});
          setLoading(false);
          setLoadError('');
          return;
        }
      }
      setLoading(true);
      setLoadError('');
      try {
        const [obatResult, map] = await Promise.all([
          listObatYelo({ all: true }),
          getSupplierMapAktif(),
        ]);
        applyLoaded(obatResult?.data || [], map || {});
      } catch (err) {
        setLoadError(err.message || 'Gagal memuat data obat');
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [applyLoaded]
  );

  useEffect(() => {
    loadRefs();
    refreshAll();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadRefs, refreshAll]);

  const syncItems = useCallback((updater) => {
    setItems((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      updateObatYeloCacheItems(next);
      return next;
    });
  }, []);

  const filterOptions = useMemo(() => {
    const supplierSet = new Set();
    for (const list of Object.values(supplierMap || {})) {
      for (const s of list || []) {
        const label = supplierInisialLabel(s);
        if (label) supplierSet.add(label);
      }
    }

    const golonganNames = [];
    const substitusiSet = new Set();
    const satuanSet = new Set();
    const konversiSet = new Set();

    for (const obat of items) {
      if (obat.golongan?.nama) golonganNames.push(obat.golongan.nama);
      if (obat.grup_substitusi?.nama) substitusiSet.add(obat.grup_substitusi.nama);
      if (obat.satuan_1?.nama) satuanSet.add(obat.satuan_1.nama);
      if (obat.satuan_2?.nama) satuanSet.add(obat.satuan_2.nama);
      if (obat.konversi !== null && obat.konversi !== undefined && obat.konversi !== '') {
        konversiSet.add(String(obat.konversi));
      }
    }

    const konversi = [...konversiSet].sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.localeCompare(b, 'id');
    });

    return {
      supplier: [...supplierSet].sort((a, b) => a.localeCompare(b, 'id')),
      golongan: sortGolonganFilterOptions(golonganNames),
      substitusi: [...substitusiSet].sort((a, b) => a.localeCompare(b, 'id')),
      satuan: [...satuanSet].sort((a, b) => a.localeCompare(b, 'id')),
      konversi,
      status_vmedis: ['Sudah di Vmedis', 'Belum di Vmedis'],
    };
  }, [items, supplierMap]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items.filter((obat) => {
      if (q) {
        const blob = [
          obat.nama_obat,
          obat.kode_obat,
          obat.kandungan?.nama,
          obat.grup_substitusi?.nama,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }

      const fStok = normalizeFilterSection(filters.stok);
      if (fStok.selected.length > 0) {
        const ready = hasStokData(obat);
        const okReady = fStok.selected.includes('Ready') && ready;
        const okKosong = fStok.selected.includes('Kosong') && !ready;
        if (!okReady && !okKosong) return false;
      }

      const fSupplier = normalizeFilterSection(filters.supplier);
      if (fSupplier.selected.length > 0 || fSupplier.includeEmpty) {
        const pills = (supplierMap[obat.kode_obat] || [])
          .map(supplierInisialLabel)
          .filter(Boolean);
        const empty = pills.length === 0;
        const okEmpty = fSupplier.includeEmpty && empty;
        const okSelected =
          fSupplier.selected.length > 0 &&
          fSupplier.selected.some((s) => pills.includes(s));
        if (!okEmpty && !okSelected) return false;
      }

      if (!matchesChecklistFilter(filters.golongan, obat.golongan?.nama)) {
        return false;
      }

      if (
        !matchesChecklistFilter(
          filters.substitusi,
          obat.grup_substitusi?.nama
        )
      ) {
        return false;
      }

      const fSat = normalizeFilterSection(filters.satuan);
      if (fSat.selected.length > 0 || fSat.includeEmpty) {
        const sats = [obat.satuan_1?.nama, obat.satuan_2?.nama].filter(Boolean);
        const empty = sats.length === 0;
        const okEmpty = fSat.includeEmpty && empty;
        const okSelected =
          fSat.selected.length > 0 && fSat.selected.some((s) => sats.includes(s));
        if (!okEmpty && !okSelected) return false;
      }

      const konvRaw = obat.konversi;
      const konvValue =
        konvRaw === null || konvRaw === undefined || konvRaw === ''
          ? null
          : String(konvRaw);
      if (!matchesChecklistFilter(filters.konversi, konvValue)) {
        return false;
      }

      const fStatus = normalizeFilterSection(filters.status_vmedis);
      if (fStatus.selected.length > 0) {
        const okSudah =
          fStatus.selected.includes('Sudah di Vmedis') && isSudahDiVmedis(obat);
        const okBelum =
          fStatus.selected.includes('Belum di Vmedis') && isBelumDiVmedis(obat);
        if (!okSudah && !okBelum) return false;
      }

      return true;
    });

    if (sort.key === 'nama') {
      list = [...list].sort((a, b) => {
        const cmp = String(a.nama_obat || '').localeCompare(
          String(b.nama_obat || ''),
          'id'
        );
        return sort.direction === 'asc' ? cmp : -cmp;
      });
    } else if (sort.key === 'kode') {
      list = [...list].sort((a, b) =>
        compareKodeObat(a.kode_obat, b.kode_obat, sort.direction)
      );
    }

    return list;
  }, [items, search, sort, filters, supplierMap]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount]
  );

  const openSheet = () => {
    setDraftSearch(search);
    setDraftSort(sort);
    setDraftFilters({
      stok: normalizeFilterSection(filters.stok),
      supplier: normalizeFilterSection(filters.supplier),
      golongan: normalizeFilterSection(filters.golongan),
      substitusi: normalizeFilterSection(filters.substitusi),
      satuan: normalizeFilterSection(filters.satuan),
      konversi: normalizeFilterSection(filters.konversi),
      status_vmedis: normalizeFilterSection(filters.status_vmedis),
    });
    setSheetOpen(true);
  };

  const handleApply = () => {
    setSearch(draftSearch);
    setSort(draftSort);
    setFilters({
      stok: normalizeFilterSection(draftFilters.stok),
      supplier: normalizeFilterSection(draftFilters.supplier),
      golongan: normalizeFilterSection(draftFilters.golongan),
      substitusi: normalizeFilterSection(draftFilters.substitusi),
      satuan: normalizeFilterSection(draftFilters.satuan),
      konversi: normalizeFilterSection(draftFilters.konversi),
      status_vmedis: normalizeFilterSection(draftFilters.status_vmedis),
    });
    setVisibleCount(PAGE_CHUNK);
    setSheetOpen(false);
  };

  const handleReset = () => {
    setDraftSearch('');
    setDraftSort(EMPTY_SORT);
    setDraftFilters({
      stok: emptyFilterSection(['Ready']),
      supplier: emptyFilterSection(),
      golongan: emptyFilterSection(),
      substitusi: emptyFilterSection(),
      satuan: emptyFilterSection(),
      konversi: emptyFilterSection(),
      status_vmedis: emptyFilterSection(),
    });
  };

  function openEdit(obat) {
    setModalMode('edit');
    setEditing(obat);
    setSelected(null);
    setForm(obatToForm(obat));
    setFormError('');
    loadRefs();

    const current = (supplierMap[obat.kode_obat] || []).map((s) => ({
      id: s.id,
      nama: s.nama,
      inisial: s.inisial,
      pricelist_kode_pbf: s.pricelist_kode_pbf || null,
      matching_id: s.matching_id || null,
    }));
    setEditSuppliers(current);
    setInitialEditSupplierIds(current.map((s) => s.id));

    if (isOwner) {
      listSuppliers()
        .then((list) => setAllSuppliers(list || []))
        .catch((err) => showToast(err.message || 'Gagal memuat supplier'));
    }
  }

  function closeForm() {
    if (submitting) return;
    setModalMode(null);
    setEditing(null);
    setFormError('');
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

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleField(name, value) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleRefCreated(jenis, created) {
    setRefs((prev) => {
      const key = jenis;
      const list = prev[key] || [];
      if (list.some((item) => item.id === created.id)) return prev;
      return {
        ...prev,
        [key]: [...list, created].sort((a, b) =>
          a.nama.localeCompare(b.nama, 'id')
        ),
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      const payload = toPayload(form);
      let saved;
      if (modalMode === 'edit' && editing) {
        const { kode_obat: _kode, ...rest } = payload;
        saved = await updateObatYelo(editing.kode_obat, rest);

        if (isOwner) {
          const currentIds = new Set(editSuppliers.map((s) => s.id));
          const initialIds = new Set(initialEditSupplierIds);
          const removeSet = new Set(
            [...initialIds].filter((id) => !currentIds.has(id))
          );
          // Re-add supplier yang sebelumnya aktif → tolak dulu matching lama, lalu insert baru
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
            const syncResult = await syncObatSuppliers(editing.kode_obat, {
              add,
              remove_pbf_ids,
            });
            const nextMap = {
              ...supplierMap,
              [editing.kode_obat]: syncResult.suppliers || [],
            };
            setSupplierMap(nextMap);
            updateObatYeloCacheSupplierMap(nextMap);
          }
        }

        showToast('Obat berhasil diperbarui');
        syncItems((prev) =>
          prev.map((item) =>
            item.kode_obat === saved.kode_obat ? { ...item, ...saved } : item
          )
        );
        setSelected(saved);
      }
      setModalMode(null);
      setEditing(null);
      setEditSuppliers([]);
      setInitialEditSupplierIds([]);
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan obat');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteSubmitting(true);
    try {
      await deleteObatYelo(deleting.kode_obat);
      showToast('Obat berhasil dihapus');
      syncItems((prev) =>
        prev.filter((item) => item.kode_obat !== deleting.kode_obat)
      );
      setDeleting(null);
      setSelected(null);
    } catch (err) {
      showToast(err.message || 'Gagal menghapus obat');
    } finally {
      setDeleteSubmitting(false);
    }
  }

  async function openQuickCreate() {
    setQuickOpen(true);
    setQuickError('');
    setQuickForm({ ...EMPTY_FORM });
    setQuickKodeLoading(true);
    try {
      const [nextKode, refData] = await Promise.all([
        getNextKodeApp(),
        loadRefs(),
      ]);
      setQuickForm((prev) => ({
        ...prev,
        kode_obat: nextKode?.kode_obat || '',
      }));
      setQuickRefs(refData || EMPTY_REFS);
    } catch (err) {
      setQuickError(err.message || 'Gagal menyiapkan form');
    } finally {
      setQuickKodeLoading(false);
    }
  }

  function closeQuickCreate() {
    if (quickSubmitting) return;
    setQuickOpen(false);
    setQuickForm(EMPTY_FORM);
    setQuickError('');
  }

  async function handleQuickSubmit(event) {
    event.preventDefault();
    setQuickSubmitting(true);
    setQuickError('');
    try {
      const payload = {
        ...toPayload(quickForm),
        asal_input: 'app',
      };
      const saved = await createObatYelo(payload);
      showToast('Obat berhasil ditambahkan');
      syncItems((prev) => {
        if (prev.some((o) => o.kode_obat === saved.kode_obat)) {
          return prev.map((o) =>
            o.kode_obat === saved.kode_obat ? { ...o, ...saved } : o
          );
        }
        return [saved, ...prev];
      });
      setQuickOpen(false);
      setQuickForm(EMPTY_FORM);
      setSelected(saved);
    } catch (err) {
      setQuickError(err.message || 'Gagal menyimpan obat');
    } finally {
      setQuickSubmitting(false);
    }
  }

  async function handleToggleVmedis(obat, checked) {
    setVmedisBusy(true);
    try {
      const updated = await updateStatusVmedis(obat.kode_obat, checked);
      syncItems((prev) =>
        prev.map((item) =>
          item.kode_obat === updated.kode_obat ? { ...item, ...updated } : item
        )
      );
      setSelected((prev) =>
        prev?.kode_obat === updated.kode_obat ? { ...prev, ...updated } : prev
      );
      showToast(
        checked ? 'Ditandai sudah di Vmedis' : 'Ditandai belum di Vmedis'
      );
    } catch (err) {
      showToast(err.message || 'Gagal update status Vmedis');
    } finally {
      setVmedisBusy(false);
    }
  }

  const selectedSuppliers = selected
    ? supplierMap[selected.kode_obat] || []
    : [];

  return (
    <AppShell
      title="Data Obat Yelo"
      actions={
        <button
          type="button"
          onClick={openSheet}
          disabled={loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary hover:bg-bg-surface-hover hover:text-accent-yellow disabled:opacity-50"
          aria-label="Filter obat"
        >
          <SlidersHorizontal className="h-4 w-4" strokeWidth={2} />
        </button>
      }
      pageAction={canTambah ? { onClick: openQuickCreate } : null}
      navLoading={loading || submitting || deleteSubmitting || quickSubmitting}
    >
      {!loading && !loadError && items.length > 0 ? (
        <p className="mb-1.5 text-[11px] text-text-muted">
          Menampilkan {visibleItems.length} dari {filteredItems.length}
          {filteredItems.length !== items.length
            ? ` (total ${items.length.toLocaleString('id-ID')})`
            : ''}
        </p>
      ) : null}

      {loading ? <ObatYeloSkeleton /> : null}

      {!loading && loadError ? (
        <div className="rounded-[4px] border border-state-error/40 bg-state-error/10 px-3 py-3 text-center">
          <p className="text-[13px] text-state-error">{loadError}</p>
          <button
            type="button"
            onClick={() => refreshAll({ force: true })}
            className="mt-2 text-[11px] font-medium text-accent-yellow underline-offset-2 hover:underline"
          >
            Coba lagi
          </button>
        </div>
      ) : null}

      {!loading && !loadError && items.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center">
          <p className="text-[13px] text-text-secondary">
            Belum ada data obat. Import CSV atau tambah dari tombol +.
          </p>
        </div>
      ) : null}

      {!loading && !loadError && items.length > 0 && filteredItems.length === 0 ? (
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
      ) : null}

      {!loading && !loadError && visibleItems.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((obat) => (
              <ObatYeloCard
                key={obat.kode_obat}
                obat={obat}
                suppliers={supplierMap[obat.kode_obat] || []}
                onOpen={setSelected}
              />
            ))}
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
      ) : null}

      {selected && !modalMode && !deleting && !quickOpen ? (
        <ObatYeloDetailSheet
          obat={selected}
          suppliers={selectedSuppliers}
          onClose={() => setSelected(null)}
          onEdit={canEdit ? openEdit : null}
          onDelete={
            canHapus
              ? (obat) => {
                  setSelected(null);
                  setDeleting(obat);
                }
              : null
          }
          onToggleVmedis={canEdit ? handleToggleVmedis : null}
          vmedisBusy={vmedisBusy}
        />
      ) : null}

      {modalMode === 'edit' ? (
        <ObatYeloFormModal
          mode="edit"
          values={form}
          onChange={handleChange}
          onField={handleField}
          refs={refs}
          onRefCreated={handleRefCreated}
          submitting={submitting}
          error={formError}
          onClose={closeForm}
          onSubmit={handleSubmit}
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

      {quickOpen ? (
        <TambahObatDariMatchingModal
          variant="standalone"
          values={quickForm}
          onChange={(e) => {
            const { name, value } = e.target;
            setQuickForm((prev) => ({ ...prev, [name]: value }));
          }}
          onField={(name, value) =>
            setQuickForm((prev) => ({ ...prev, [name]: value }))
          }
          refs={quickRefs}
          onRefCreated={(jenis, created) => {
            setQuickRefs((prev) => {
              const key = jenis;
              const list = prev[key] || [];
              if (list.some((item) => item.id === created.id)) return prev;
              return {
                ...prev,
                [key]: [...list, created].sort((a, b) =>
                  a.nama.localeCompare(b.nama, 'id')
                ),
              };
            });
          }}
          submitting={quickSubmitting}
          error={quickError}
          onClose={closeQuickCreate}
          onSubmit={handleQuickSubmit}
          kodeLoading={quickKodeLoading}
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

      <FilterSortSearchSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter Obat Yelo"
        searchValue={draftSearch}
        onSearchChange={setDraftSearch}
        searchPlaceholder="Cari nama, kandungan, substitusi, kode obat..."
        sortOptions={[
          { key: 'nama', label: 'Nama' },
          { key: 'kode', label: 'Kode Obat' },
        ]}
        sortState={draftSort}
        onSortChange={setDraftSort}
        filterGroups={[
          {
            key: 'stok',
            label: 'Stok',
            options: ['Ready', 'Kosong'],
            preserveOrder: true,
          },
          { key: 'supplier', label: 'Supplier', options: filterOptions.supplier },
          {
            key: 'golongan',
            label: 'Golongan',
            options: filterOptions.golongan,
            preserveOrder: true,
            showEmptyOption: true,
          },
          {
            key: 'substitusi',
            label: 'Substitusi',
            options: filterOptions.substitusi,
            showEmptyOption: true,
            showSearchInline: true,
          },
          { key: 'satuan', label: 'Satuan', options: filterOptions.satuan },
          {
            key: 'konversi',
            label: 'Konversi',
            options: filterOptions.konversi,
            preserveOrder: true,
          },
          {
            key: 'status_vmedis',
            label: 'Status Vmedis',
            options: filterOptions.status_vmedis,
            preserveOrder: true,
          },
        ]}
        filterState={draftFilters}
        onFilterChange={setDraftFilters}
        onApply={handleApply}
        onReset={handleReset}
      />

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
