import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Archive, Flag, Plus, SlidersHorizontal, Trash2, Upload, X } from 'lucide-react';
import {
  confirmStokUpload,
  createStokPenandaan,
  deleteStokUploadBatch,
  getStokRingkasPreview,
  listStokBatchesByKode,
  listStokPenandaan,
  listStokTerkini,
  listStokUploadBatches,
  parseStokPreview,
  refreshStokPreviewInfo,
  runStokRingkasLama,
  selesaiStokPenandaan,
  tandaiStokPreview,
  updateStokPenandaan,
} from '../api/stok';
import { createObatYelo, getObatYelo } from '../api/obatYelo';
import { listRef } from '../api/refData';
import AppShell from '../components/layout/AppShell';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import FilterSortSearchSheet, {
  emptyFilterSection,
  normalizeFilterSection,
} from '../components/FilterSortSearchSheet';
import SheetModal from '../components/SheetModal';
import StokRingkasConfirmModal from '../components/StokRingkasConfirmModal';
import StokTandaiModal, { JENIS_OPTIONS } from '../components/StokTandaiModal';
import StokUploadPreviewSheet from '../components/StokUploadPreviewSheet';
import SubmitSpinner from '../components/SubmitSpinner';
import TambahObatDariMatchingModal from '../components/TambahObatDariMatchingModal';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const VALID_STOK_TABS = ['stok', 'upload', 'tindak', 'riwayat'];
const EMPTY_FILTERS = { gudang: emptyFilterSection() };
const EMPTY_SORT = { key: null, direction: 'asc' };
const EMPTY_OBAT_FORM = {
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

function jenisLabel(kode) {
  const map = {
    karantina: 'Karantina',
    jual_prioritas: 'Jual Prioritas',
    lainnya: 'Lainnya',
    tambah_ke_obat_yelo: 'Tambah ke Obat Yelo',
  };
  return map[kode] || JENIS_OPTIONS.find((o) => o.value === kode)?.label || kode || '—';
}

const PENANDAAN_FILTERS = [
  { value: '', label: 'Semua' },
  { value: 'tambah_ke_obat_yelo', label: 'Tambah Obat Yelo' },
  { value: 'karantina', label: 'Karantina' },
  { value: 'jual_prioritas', label: 'Jual Prioritas' },
  { value: 'lainnya', label: 'Lainnya' },
];

const AUTO_DITANDAI_OLEH = 'sistem (auto dari upload)';

function toObatPayload(form) {
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
    asal_input: 'vmedis',
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value) || 0);
}

function formatRupiah(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatTanggal(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

export default function StokPage() {
  const { hasAccess, profile } = useAuth();
  const canTambah = hasAccess('stok', 'tambah');
  const canEdit = hasAccess('stok', 'edit');
  const canTambahObat = hasAccess('data-obat-yelo', 'tambah');
  const isOwner = profile?.is_owner === true;

  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return VALID_STOK_TABS.includes(t) ? t : 'stok';
  }); // stok | upload | riwayat | tindak
  const [kodeObatFilter, setKodeObatFilter] = useState(
    () => searchParams.get('kode_obat') || ''
  );
  const [batch, setBatch] = useState(null);
  const [items, setItems] = useState([]);
  const [gudangOptions, setGudangOptions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [penandaanItems, setPenandaanItems] = useState([]);
  const [penandaanFilter, setPenandaanFilter] = useState('');
  const [jenisBusyId, setJenisBusyId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resolvedKodes, setResolvedKodes] = useState(() => new Set());
  const [toast, setToast] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [ringkasPreview, setRingkasPreview] = useState(null);
  const [ringkasOpen, setRingkasOpen] = useState(false);
  const [ringkasBusy, setRingkasBusy] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [sortState, setSortState] = useState(EMPTY_SORT);
  const [draftSort, setDraftSort] = useState(EMPTY_SORT);

  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState(EMPTY_OBAT_FORM);
  const [quickRefs, setQuickRefs] = useState(EMPTY_REFS);
  const [quickSubmitting, setQuickSubmitting] = useState(false);
  const [quickError, setQuickError] = useState('');
  const [quickSourceRow, setQuickSourceRow] = useState(null);

  const [tandaiTarget, setTandaiTarget] = useState(null); // { mode:'preview'|'saved', ... }
  const [tandaiBusy, setTandaiBusy] = useState(false);

  const [batchSheetKode, setBatchSheetKode] = useState(null);
  const [batchSheetRows, setBatchSheetRows] = useState([]);
  const [batchSheetLoading, setBatchSheetLoading] = useState(false);
  const [selesaiBusyId, setSelesaiBusyId] = useState(null);

  const toastTimer = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }, []);

  const loadStok = useCallback(async () => {
    const data = await listStokTerkini();
    setBatch(data.batch || null);
    setItems(data.items || []);
    setGudangOptions(data.gudang_options || []);
  }, []);

  const loadBatches = useCallback(async () => {
    const data = await listStokUploadBatches();
    setBatches(data.items || []);
  }, []);

  const loadPenandaan = useCallback(async () => {
    const data = await listStokPenandaan({
      status: 'terbuka',
      jenis_tindakan: penandaanFilter || undefined,
    });
    setPenandaanItems(data.items || []);
  }, [penandaanFilter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'riwayat') await loadBatches();
      else if (tab === 'tindak') await loadPenandaan();
      else await loadStok();
    } catch (err) {
      showToast(err.message || 'Gagal memuat stok');
    } finally {
      setLoading(false);
    }
  }, [tab, loadStok, loadBatches, loadPenandaan, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab !== 'riwayat') return;
    let cancelled = false;
    (async () => {
      try {
        await loadBatches();
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Gagal memuat riwayat');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, loadBatches, showToast]);

  useEffect(() => {
    if (tab !== 'tindak') return;
    let cancelled = false;
    (async () => {
      try {
        await loadPenandaan();
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Gagal memuat penandaan');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, loadPenandaan, showToast]);

  async function handleFile(file) {
    if (!file || busy) return;
    const name = String(file.name || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      showToast('Hanya file Excel (.xlsx) yang diterima');
      return;
    }
    setBusy(true);
    try {
      const result = await parseStokPreview(file);
      setPreview(result);
      setResolvedKodes(new Set());
      setPreviewOpen(true);
    } catch (err) {
      showToast(err.message || 'Gagal parse Excel');
      setPreview(null);
      setPreviewOpen(false);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleConfirm() {
    if (!preview?.session_id || busy) return;
    setBusy(true);
    try {
      const summary = await confirmStokUpload(preview.session_id);
      setPreviewOpen(false);
      setPreview(null);
      setResolvedKodes(new Set());
      const extra =
        summary.penandaan_masuk > 0
          ? ` · ${summary.penandaan_masuk} penandaan`
          : '';
      showToast(`Masuk ${summary.masuk} baris stok${extra}`);
      setTab('tindak');
      await loadPenandaan();
      await loadStok();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  async function openTambahObat(row, opts = {}) {
    if (!canTambahObat || !row) return;
    const fromPenandaan = opts.from === 'penandaan';
    setQuickSourceRow({
      ...row,
      _from: opts.from || 'preview',
      _penandaanId: opts.penandaanId || null,
    });
    setQuickError('');
    setQuickForm({
      ...EMPTY_OBAT_FORM,
      kode_obat: row.kode_obat || '',
      nama_obat: row.nama_obat || '',
    });
    setQuickOpen(true);
    try {
      const [kandungan, golongan, satuan, grup] = await Promise.all([
        listRef('kandungan'),
        listRef('golongan'),
        listRef('satuan'),
        listRef('grup-substitusi'),
      ]);
      const nextRefs = {
        kandungan: kandungan || [],
        golongan: golongan || [],
        satuan: satuan || [],
        'grup-substitusi': grup || [],
      };
      setQuickRefs(nextRefs);

      if (fromPenandaan) {
        const matchRefId = (options, raw) => {
          const needle = String(raw || '')
            .trim()
            .toLowerCase();
          if (!needle || needle === '-') return '';
          const hit = (options || []).find(
            (o) => String(o?.nama || '').trim().toLowerCase() === needle
          );
          return hit?.id || '';
        };
        const satuan1Id = matchRefId(nextRefs.satuan, row.satuan);
        const golonganId = matchRefId(nextRefs.golongan, row.golongan_vmedis);
        if (satuan1Id || golonganId) {
          setQuickForm((prev) => ({
            ...prev,
            satuan_1_id: satuan1Id || prev.satuan_1_id,
            golongan_id: golonganId || prev.golongan_id,
          }));
        }
      }
    } catch (err) {
      setQuickError(err.message || 'Gagal memuat referensi');
    }
  }

  function closeQuickCreate() {
    if (quickSubmitting) return;
    setQuickOpen(false);
    setQuickForm(EMPTY_OBAT_FORM);
    setQuickError('');
    setQuickSourceRow(null);
  }

  async function handleQuickSubmit(event) {
    event.preventDefault();
    const fromPenandaan = quickSourceRow?._from === 'penandaan';
    const penandaanId = quickSourceRow?._penandaanId;
    if (!fromPenandaan && !preview?.session_id) return;

    setQuickSubmitting(true);
    setQuickError('');
    const kode = quickForm.kode_obat.trim();

    async function markResolvedAlreadyExists() {
      setQuickError('Kode ini sudah terdaftar');
      if (fromPenandaan && penandaanId) {
        try {
          await selesaiStokPenandaan(penandaanId);
          showToast('Kode sudah terdaftar — penandaan ditutup');
          setQuickOpen(false);
          setQuickForm(EMPTY_OBAT_FORM);
          setQuickSourceRow(null);
          await loadPenandaan();
        } catch (err) {
          setQuickError(err.message || 'Kode sudah ada, gagal menutup penandaan');
        }
        return;
      }
      setResolvedKodes((prev) => new Set([...prev, kode]));
      if (preview?.session_id) {
        const refreshed = await refreshStokPreviewInfo(preview.session_id);
        setPreview((p) => (p ? { ...p, info: refreshed.info } : p));
      }
    }

    try {
      try {
        await getObatYelo(kode);
        await markResolvedAlreadyExists();
        return;
      } catch (checkErr) {
        if (checkErr.status && checkErr.status !== 404 && checkErr.status !== 403) {
          throw checkErr;
        }
      }

      await createObatYelo(toObatPayload(quickForm));
      showToast(`Obat ${kode} ditambahkan ke Obat Yelo`);

      if (fromPenandaan && penandaanId) {
        try {
          await selesaiStokPenandaan(penandaanId);
        } catch (err) {
          showToast(err.message || 'Obat ditambah, tapi gagal menutup penandaan');
        }
        setQuickOpen(false);
        setQuickForm(EMPTY_OBAT_FORM);
        setQuickSourceRow(null);
        await loadPenandaan();
        return;
      }

      setResolvedKodes((prev) => new Set([...prev, kode]));
      const refreshed = await refreshStokPreviewInfo(preview.session_id);
      setPreview((p) => (p ? { ...p, info: refreshed.info } : p));
      setQuickOpen(false);
      setQuickForm(EMPTY_OBAT_FORM);
      setQuickSourceRow(null);
    } catch (err) {
      if (err.status === 409) {
        await markResolvedAlreadyExists();
      } else {
        setQuickError(err.message || 'Gagal menyimpan obat');
      }
    } finally {
      setQuickSubmitting(false);
    }
  }

  function openTandaiPreview(row) {
    if (!canEdit || row?.item_index == null) return;
    setTandaiTarget({
      mode: 'preview',
      item_index: row.item_index,
      label: `${row.kode_obat} · ${row.nama_obat || '—'}`,
    });
  }

  function openTandaiSaved(row) {
    if (!canEdit || !row?.id) return;
    setTandaiTarget({
      mode: 'saved',
      stok_obat_id: row.id,
      label: `${row.kode_obat} · batch ${row.no_batch || '—'}`,
    });
  }

  async function handleTandaiConfirm({ jenis_tindakan, catatan }) {
    if (!tandaiTarget) return;
    setTandaiBusy(true);
    try {
      if (tandaiTarget.mode === 'preview') {
        if (!preview?.session_id) throw new Error('Sesi preview tidak valid');
        const result = await tandaiStokPreview(preview.session_id, {
          item_index: tandaiTarget.item_index,
          jenis_tindakan,
          catatan,
        });
        setPreview((p) => (p ? { ...p, info: result.info } : p));
        showToast('Ditandai — akan tersimpan saat konfirmasi upload');
      } else {
        await createStokPenandaan({
          stok_obat_id: tandaiTarget.stok_obat_id,
          jenis_tindakan,
          catatan,
        });
        showToast('Ditandai untuk ditindaklanjuti');
        if (batchSheetKode) {
          const data = await listStokBatchesByKode(batchSheetKode);
          setBatchSheetRows(data.items || []);
        }
        await loadStok();
        if (tab === 'tindak') await loadPenandaan();
      }
      setTandaiTarget(null);
    } catch (err) {
      showToast(err.message || 'Gagal menandai');
    } finally {
      setTandaiBusy(false);
    }
  }

  async function openBatchSheet(kodeObat) {
    setBatchSheetKode(kodeObat);
    setBatchSheetRows([]);
    setBatchSheetLoading(true);
    try {
      const data = await listStokBatchesByKode(kodeObat);
      setBatchSheetRows(data.items || []);
    } catch (err) {
      showToast(err.message || 'Gagal memuat batch');
      setBatchSheetKode(null);
    } finally {
      setBatchSheetLoading(false);
    }
  }

  async function handleSelesaiPenandaan(id) {
    if (!canEdit || !id) return;
    setSelesaiBusyId(id);
    try {
      await selesaiStokPenandaan(id);
      showToast('Penandaan ditandai selesai');
      await loadPenandaan();
      await loadStok();
    } catch (err) {
      showToast(err.message || 'Gagal menutup penandaan');
    } finally {
      setSelesaiBusyId(null);
    }
  }

  async function handleChangeJenisPenandaan(id, jenis_tindakan) {
    if (!canEdit || !id || !jenis_tindakan) return;
    setJenisBusyId(id);
    try {
      await updateStokPenandaan(id, { jenis_tindakan });
      showToast(`Jenis diubah ke ${jenisLabel(jenis_tindakan)}`);
      await loadPenandaan();
    } catch (err) {
      showToast(err.message || 'Gagal mengubah jenis');
    } finally {
      setJenisBusyId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || !isOwner) return;
    setDeleting(true);
    try {
      const result = await deleteStokUploadBatch(deleteTarget.id);
      showToast(
        `Dataset “${result.nama_file || deleteTarget.nama_file}” dihapus (${result.baris_dihapus || 0} baris)`
      );
      setDeleteTarget(null);
      await loadBatches();
      await loadStok();
    } catch (err) {
      showToast(err.message || 'Gagal menghapus dataset');
    } finally {
      setDeleting(false);
    }
  }

  async function openRingkas() {
    if (!isOwner || ringkasBusy) return;
    setRingkasBusy(true);
    try {
      const data = await getStokRingkasPreview();
      setRingkasPreview(data);
      setRingkasOpen(true);
    } catch (err) {
      showToast(err.message || 'Gagal memuat preview ringkas');
    } finally {
      setRingkasBusy(false);
    }
  }

  async function handleRingkasConfirm() {
    if (!isOwner || ringkasBusy) return;
    setRingkasBusy(true);
    try {
      const result = await runStokRingkasLama();
      setRingkasOpen(false);
      setRingkasPreview(null);
      showToast(
        `Diringkas ${result.pasangan_kode_bulan || 0} bulan×kode, hapus ${result.baris_detail_dihapus || 0} baris`
      );
      await loadStok();
    } catch (err) {
      showToast(err.message || 'Gagal meringkas data');
    } finally {
      setRingkasBusy(false);
    }
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const gudangFilter = normalizeFilterSection(filters.gudang).selected;
    let list = items.filter((row) => {
      if (gudangFilter.length) {
        const hasGudang = (row.gudang_list || []).some((g) =>
          gudangFilter.includes(g.gudang)
        );
        if (!hasGudang) return false;
      }
      if (!q) return true;
      const hay = `${row.kode_obat || ''} ${row.nama_obat || ''}`.toLowerCase();
      return hay.includes(q);
    });

    // Saat filter gudang aktif, tampilkan hanya slot gudang yang dipilih
    if (gudangFilter.length) {
      list = list.map((row) => ({
        ...row,
        gudang_list: (row.gudang_list || []).filter((g) =>
          gudangFilter.includes(g.gudang)
        ),
      }));
    }

    if (sortState.key === 'nama') {
      list = [...list].sort((a, b) => {
        const cmp = String(a.nama_obat || a.kode_obat).localeCompare(
          String(b.nama_obat || b.kode_obat),
          'id'
        );
        return sortState.direction === 'desc' ? -cmp : cmp;
      });
    } else if (sortState.key === 'stok') {
      list = [...list].sort((a, b) => {
        const sa = (a.gudang_list || []).reduce((n, g) => n + (Number(g.stok_total) || 0), 0);
        const sb = (b.gudang_list || []).reduce((n, g) => n + (Number(g.stok_total) || 0), 0);
        return sortState.direction === 'desc' ? sb - sa : sa - sb;
      });
    }

    return list;
  }, [items, search, filters, sortState]);

  const filteredPenandaanItems = useMemo(() => {
    if (!kodeObatFilter) return penandaanItems;
    return penandaanItems.filter((p) => p.kode_obat === kodeObatFilter);
  }, [penandaanItems, kodeObatFilter]);

  function clearKodeObatFilter() {
    setKodeObatFilter('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('kode_obat');
      return next;
    });
  }

  function openFilterSheet() {
    setDraftSearch(search);
    setDraftFilters({ gudang: normalizeFilterSection(filters.gudang) });
    setDraftSort({ ...sortState });
    setFilterOpen(true);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (!canTambah) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  const tabBtn = (id, label) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`flex-1 rounded-[4px] px-2 py-1.5 text-[12px] font-medium ${
        tab === id
          ? 'bg-accent-navy text-white'
          : 'text-text-secondary hover:bg-bg-surface-hover'
      }`}
    >
      {label}
    </button>
  );

  const topActions = (
    <div className="flex items-center gap-1">
      {tab === 'stok' ? (
        <button
          type="button"
          onClick={openFilterSheet}
          className="inline-flex items-center gap-1 rounded-[4px] border border-border-subtle px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-surface-hover"
          aria-label="Filter dan cari"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter
        </button>
      ) : null}
      {isOwner ? (
        <button
          type="button"
          onClick={openRingkas}
          disabled={ringkasBusy}
          className="inline-flex items-center gap-1 rounded-[4px] border border-border-subtle px-2 py-1 text-[11px] text-text-secondary hover:bg-bg-surface-hover disabled:opacity-50"
        >
          {ringkasBusy ? (
            <SubmitSpinner className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          Ringkas Data Lama
        </button>
      ) : null}
    </div>
  );

  return (
    <AppShell title="Stok" actions={topActions} navLoading={loading}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1 rounded-[4px] border border-border-subtle bg-bg-surface p-0.5">
          {tabBtn('stok', 'Stok terkini')}
          {tabBtn('upload', 'Upload')}
          {tabBtn('tindak', 'Perlu Ditindaklanjuti')}
          {tabBtn('riwayat', 'Riwayat Upload')}
        </div>

        {loading ? (
          <div className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
            Memuat…
          </div>
        ) : null}

        {!loading && tab === 'upload' ? (
          canTambah ? (
            <section
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`rounded-[4px] border border-dashed px-3 py-6 transition ${
                dragOver
                  ? 'border-accent-yellow bg-accent-yellow/10'
                  : 'border-border-subtle bg-bg-surface'
              }`}
            >
              <div className="flex flex-col items-center gap-3 text-center">
                <p className="text-[13px] font-medium text-text-primary">
                  Upload Excel Stok Vmedis (.xlsx)
                </p>
                <p className="max-w-sm text-[11px] text-text-secondary">
                  Snapshot stok per batch. Styles rusak diperbaiki otomatis. Data menumpuk
                  (tidak mengganti upload sebelumnya).
                </p>
                <label
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white ${
                    busy ? 'pointer-events-none opacity-50' : ''
                  }`}
                >
                  {busy ? <SubmitSpinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                  Pilih Excel
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </section>
          ) : (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Tidak punya izin upload stok.
            </div>
          )
        ) : null}

        {!loading && tab === 'stok' ? (
          items.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Belum ada snapshot stok. Upload Excel dari tab Upload.
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Tidak ada obat yang cocok dengan filter/cari.
            </div>
          ) : (
            <div className="space-y-2">
              {batch ? (
                <p className="text-[11px] text-text-muted">
                  Snapshot: {batch.nama_file} · {formatTanggal(batch.tanggal_upload)} ·{' '}
                  {formatNumber(filteredItems.length)} obat
                </p>
              ) : null}
              <div className="grid grid-cols-1 gap-1.5">
                {filteredItems.map((row) => {
                  const gudangList = row.gudang_list || [];
                  const single = gudangList.length === 1 ? gudangList[0] : null;
                  return (
                    <article
                      key={row.kode_obat}
                      className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-text-primary">
                            {row.nama_obat || row.kode_obat}
                          </p>
                          <p className="text-[11px] text-text-muted">{row.kode_obat}</p>
                        </div>
                        <div className="flex shrink-0 items-start gap-1.5">
                          {(row.penandaan_terbuka || 0) > 0 ? (
                            <span
                              className="inline-flex items-center gap-0.5 rounded-[4px] bg-state-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-state-warning"
                              title={`${row.penandaan_terbuka} perlu ditindaklanjuti`}
                            >
                              <Flag className="h-3 w-3" />
                              {row.penandaan_terbuka}
                            </span>
                          ) : null}
                          {single ? (
                            <div className="text-right">
                              <p className="text-[13px] font-semibold text-accent-yellow">
                                {formatNumber(single.stok_total)}
                                {single.satuan ? (
                                  <span className="ml-1 text-[11px] font-normal text-text-muted">
                                    {single.satuan}
                                  </span>
                                ) : null}
                              </p>
                              <p className="text-[10px] text-text-muted">{single.gudang}</p>
                            </div>
                          ) : (
                            <p className="text-[10px] text-text-muted">
                              {formatNumber(gudangList.length)} gudang
                            </p>
                          )}
                        </div>
                      </div>

                      {gudangList.length > 1 ? (
                        <ul className="mt-1.5 space-y-0.5 text-[11px] text-text-secondary">
                          {gudangList.map((g) => (
                            <li key={g.gudang} className="flex justify-between gap-2">
                              <span>{g.gudang}</span>
                              <span className="font-medium text-text-primary">
                                {formatNumber(g.stok_total)}
                                {g.satuan ? ` ${g.satuan}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {single ? (
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-secondary">
                          <span>H1 {formatRupiah(single.harga_1)}</span>
                          <span>H2 {formatRupiah(single.harga_2)}</span>
                          <span>H3 {formatRupiah(single.harga_3)}</span>
                        </div>
                      ) : (
                        <div className="mt-1.5 space-y-1">
                          {gudangList.map((g) => (
                            <div
                              key={`h-${g.gudang}`}
                              className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-muted"
                            >
                              <span className="text-text-secondary">{g.gudang}:</span>
                              <span>H1 {formatRupiah(g.harga_1)}</span>
                              <span>H2 {formatRupiah(g.harga_2)}</span>
                              <span>H3 {formatRupiah(g.harga_3)}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {(row.expired_lewat || 0) > 0 || (row.expired_segera || 0) > 0 ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {(row.expired_lewat || 0) > 0 ? (
                            <span className="rounded-[4px] bg-state-error/15 px-1.5 py-0.5 text-[10px] font-medium text-state-error">
                              ED lewat {row.expired_lewat}
                            </span>
                          ) : null}
                          {(row.expired_segera || 0) > 0 ? (
                            <span className="rounded-[4px] bg-state-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-state-warning">
                              ED ≤90hr {row.expired_segera}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openBatchSheet(row.kode_obat)}
                            className="rounded-[4px] border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-secondary hover:bg-bg-surface-hover"
                          >
                            Lihat batch / Tandai
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          )
        ) : null}

        {!loading && tab === 'tindak' ? (
          <div className="space-y-2">
            {kodeObatFilter ? (
              <div className="flex items-center gap-1.5 rounded-[4px] border border-accent-navy/40 bg-accent-navy/10 px-2 py-1 text-[11px] text-accent-navy">
                <span className="min-w-0 flex-1 truncate">
                  Difilter untuk kode obat: <strong>{kodeObatFilter}</strong>
                </span>
                <button
                  type="button"
                  onClick={clearKodeObatFilter}
                  className="shrink-0 rounded-[4px] p-0.5 hover:bg-accent-navy/20"
                  aria-label="Hapus filter kode obat"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-1">
              {PENANDAAN_FILTERS.map((f) => (
                <button
                  key={f.value || 'all'}
                  type="button"
                  onClick={() => setPenandaanFilter(f.value)}
                  className={`rounded-[4px] px-2 py-1 text-[11px] font-medium ${
                    penandaanFilter === f.value
                      ? 'bg-accent-navy text-white'
                      : 'border border-border-subtle text-text-secondary hover:bg-bg-surface-hover'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {filteredPenandaanItems.length === 0 ? (
              <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
                Tidak ada stok yang perlu ditindaklanjuti
                {penandaanFilter || kodeObatFilter ? ` untuk filter ini` : ''}.
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] text-text-muted">
                  {formatNumber(filteredPenandaanItems.length)} penandaan terbuka — otomatis dari
                  upload atau ditandai manual.
                </p>
                {filteredPenandaanItems.map((p) => {
                  const s = p.stok || {};
                  const isTambah = p.jenis_tindakan === 'tambah_ke_obat_yelo';
                  const kode = p.kode_obat || s.kode_obat || '—';
                  const nama = p.nama_obat || s.nama_obat || kode;
                  const otomatis =
                    p.otomatis === true || p.ditandai_oleh === AUTO_DITANDAI_OLEH;

                  return (
                    <article
                      key={p.id}
                      className="rounded-[4px] border border-state-warning/30 bg-bg-surface px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-[13px] font-medium text-text-primary">
                              {nama}
                            </p>
                            {otomatis ? (
                              <span className="rounded-[4px] bg-accent-navy/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-navy">
                                Otomatis
                              </span>
                            ) : (
                              <span className="rounded-[4px] bg-bg-base px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                                Manual
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-text-muted">
                            {kode}
                            {!isTambah ? (
                              <>
                                {' '}
                                · {s.gudang || '—'} · batch {s.no_batch || '—'}
                              </>
                            ) : null}
                          </p>
                          {!isTambah ? (
                            <p className="mt-0.5 text-[11px] text-text-secondary">
                              ED {formatTanggal(s.tanggal_expired)} · stok{' '}
                              {formatNumber(s.stok_qty)}
                              {s.satuan ? ` ${s.satuan}` : ''}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[11px] text-state-warning">
                            <Flag className="mr-1 inline h-3 w-3" />
                            {jenisLabel(p.jenis_tindakan)}
                            {p.catatan ? ` — ${p.catatan}` : ''}
                          </p>
                          <p className="text-[10px] text-text-muted">
                            Ditandai {p.ditandai_oleh || '—'} ·{' '}
                            {formatTanggal(p.tanggal_tandai)}
                          </p>

                          {!isTambah && canEdit ? (
                            <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-secondary">
                              <span className="shrink-0">Ubah jenis</span>
                              <select
                                value={p.jenis_tindakan}
                                disabled={jenisBusyId === p.id}
                                onChange={(e) =>
                                  handleChangeJenisPenandaan(p.id, e.target.value)
                                }
                                className="rounded-[4px] border border-border-subtle bg-bg-surface px-1.5 py-0.5 text-[11px] text-text-primary outline-none focus:border-accent-yellow"
                              >
                                {JENIS_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 flex-col gap-1">
                          {isTambah && canTambahObat ? (
                            <button
                              type="button"
                              onClick={() =>
                                openTambahObat(
                                  {
                                    kode_obat: kode,
                                    nama_obat: nama !== kode ? nama : '',
                                    satuan: p.satuan || s.satuan || '',
                                    golongan_vmedis:
                                      p.golongan_vmedis || s.golongan_vmedis || '',
                                  },
                                  { from: 'penandaan', penandaanId: p.id }
                                )
                              }
                              className="inline-flex items-center gap-0.5 rounded-[4px] bg-accent-navy px-3 py-1.5 text-[11px] font-medium text-white hover:brightness-110"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Tambah ke Obat Yelo
                            </button>
                          ) : null}
                          {!isTambah && canEdit ? (
                            <button
                              type="button"
                              disabled={selesaiBusyId === p.id}
                              onClick={() => handleSelesaiPenandaan(p.id)}
                              className="rounded-[4px] border border-border-subtle px-2 py-1 text-[11px] text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
                            >
                              {selesaiBusyId === p.id ? (
                                <SubmitSpinner />
                              ) : (
                                'Tandai Selesai'
                              )}
                            </button>
                          ) : null}
                          {isTambah && canEdit && !canTambahObat ? (
                            <button
                              type="button"
                              disabled={selesaiBusyId === p.id}
                              onClick={() => handleSelesaiPenandaan(p.id)}
                              className="rounded-[4px] border border-border-subtle px-2 py-1 text-[11px] text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
                            >
                              {selesaiBusyId === p.id ? (
                                <SubmitSpinner />
                              ) : (
                                'Tandai Selesai'
                              )}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {!loading && tab === 'riwayat' ? (
          batches.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Belum ada riwayat upload.
            </div>
          ) : (
            <div className="space-y-1.5">
              {!isOwner ? (
                <p className="text-[11px] text-text-muted">
                  Hanya owner yang dapat menghapus dataset upload.
                </p>
              ) : null}
              {batches.map((b) => (
                <article
                  key={b.id}
                  className="flex items-start gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {b.nama_file}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-secondary">
                      {formatTanggal(b.tanggal_upload)} · {b.diupload_oleh || '—'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      Masuk {formatNumber(b.jumlah_baris_masuk)} · Skip{' '}
                      {formatNumber(b.jumlah_baris_skip)}
                    </p>
                  </div>
                  {isOwner ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(b)}
                      disabled={deleting}
                      className="shrink-0 rounded-[4px] p-1.5 text-state-error hover:bg-state-error/10 disabled:opacity-50"
                      aria-label={`Hapus dataset ${b.nama_file}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )
        ) : null}
      </div>

      {previewOpen && preview ? (
        <StokUploadPreviewSheet
          preview={preview}
          onConfirm={handleConfirm}
          onCancel={() => {
            if (!busy) {
              setPreviewOpen(false);
              setPreview(null);
              setResolvedKodes(new Set());
            }
          }}
          submitting={busy}
          canTambahObat={canTambahObat}
          canTandai={canEdit}
          resolvedKodes={resolvedKodes}
          onTambahObat={openTambahObat}
          onTandai={openTandaiPreview}
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
          onField={(name, id) => {
            setQuickForm((prev) => ({ ...prev, [name]: id }));
          }}
          refs={quickRefs}
          onRefCreated={(jenis, created) => {
            setQuickRefs((prev) => ({
              ...prev,
              [jenis]: [...(prev[jenis] || []), created],
            }));
          }}
          submitting={quickSubmitting}
          error={quickError}
          onClose={closeQuickCreate}
          onSubmit={handleQuickSubmit}
          submitLabel="Simpan ke Obat Yelo"
          kodeHint="Kode dari Vmedis (bisa diedit). Asal input: vmedis."
        />
      ) : null}

      {tandaiTarget ? (
        <StokTandaiModal
          subtitle={tandaiTarget.label}
          submitting={tandaiBusy}
          onClose={() => {
            if (!tandaiBusy) setTandaiTarget(null);
          }}
          onConfirm={handleTandaiConfirm}
        />
      ) : null}

      {batchSheetKode ? (
        <SheetModal
          title={
            <h2 className="text-[15px] font-semibold leading-none text-text-primary">
              Batch · {batchSheetKode}
            </h2>
          }
          onClose={() => {
            setBatchSheetKode(null);
            setBatchSheetRows([]);
          }}
          footer={
            <button
              type="button"
              onClick={() => {
                setBatchSheetKode(null);
                setBatchSheetRows([]);
              }}
              className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary sm:w-auto"
            >
              Tutup
            </button>
          }
        >
          {batchSheetLoading ? (
            <p className="py-6 text-center text-[13px] text-text-secondary">Memuat…</p>
          ) : batchSheetRows.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-secondary">Tidak ada batch.</p>
          ) : (
            <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
              {batchSheetRows.map((row) => (
                <li
                  key={row.id}
                  className={`rounded-[4px] border px-2.5 py-2 ${
                    row.penandaan
                      ? 'border-state-warning/40 bg-state-warning/10'
                      : 'border-border-subtle bg-bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-text-primary">
                        {row.gudang || '—'} · batch {row.no_batch || '—'}
                      </p>
                      <p className="text-[11px] text-text-secondary">
                        ED {formatTanggal(row.tanggal_expired)} · stok{' '}
                        {formatNumber(row.stok_qty)}
                        {row.satuan ? ` ${row.satuan}` : ''}
                      </p>
                      {row.ed_status === 'lewat' ? (
                        <span className="mt-0.5 inline-block text-[10px] font-medium text-state-error">
                          Lewat expired
                        </span>
                      ) : null}
                      {row.ed_status === 'mendekati' ? (
                        <span className="mt-0.5 inline-block text-[10px] font-medium text-state-warning">
                          Mendekati expired
                        </span>
                      ) : null}
                      {row.penandaan ? (
                        <p className="mt-0.5 text-[10px] text-state-warning">
                          <Flag className="mr-0.5 inline h-3 w-3" />
                          {jenisLabel(row.penandaan.jenis_tindakan)}
                          {row.penandaan.catatan ? ` — ${row.penandaan.catatan}` : ''}
                        </p>
                      ) : null}
                    </div>
                    {!row.penandaan &&
                    canEdit &&
                    (row.ed_status === 'lewat' || row.ed_status === 'mendekati') ? (
                      <button
                        type="button"
                        onClick={() => openTandaiSaved(row)}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-[4px] border border-state-warning/40 bg-state-warning/10 px-1.5 py-1 text-[10px] font-medium text-state-warning"
                      >
                        <Flag className="h-3 w-3" />
                        Tandai
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SheetModal>
      ) : null}

      {deleteTarget ? (
        <ConfirmDeleteModal
          confirmName={deleteTarget.nama_file}
          title="Hapus Dataset Stok"
          entityLabel="file"
          submitting={deleting}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      {ringkasOpen ? (
        <StokRingkasConfirmModal
          preview={ringkasPreview}
          submitting={ringkasBusy}
          onClose={() => {
            if (!ringkasBusy) {
              setRingkasOpen(false);
              setRingkasPreview(null);
            }
          }}
          onConfirm={handleRingkasConfirm}
        />
      ) : null}

      <FilterSortSearchSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter Stok"
        searchValue={draftSearch}
        onSearchChange={setDraftSearch}
        searchPlaceholder="Cari kode / nama obat…"
        sortOptions={[
          { key: 'nama', label: 'Nama obat' },
          { key: 'stok', label: 'Total stok' },
        ]}
        sortState={draftSort}
        onSortChange={setDraftSort}
        filterGroups={[
          {
            key: 'gudang',
            label: 'Gudang',
            options: gudangOptions,
            preserveOrder: true,
          },
        ]}
        filterState={draftFilters}
        onFilterChange={setDraftFilters}
        onApply={() => {
          setSearch(draftSearch);
          setFilters({ gudang: normalizeFilterSection(draftFilters.gudang) });
          setSortState({ ...draftSort });
          setFilterOpen(false);
        }}
        onReset={() => {
          setDraftSearch('');
          setDraftFilters({ gudang: emptyFilterSection() });
          setDraftSort(EMPTY_SORT);
          setSearch('');
          setFilters({ gudang: emptyFilterSection() });
          setSortState(EMPTY_SORT);
          setFilterOpen(false);
        }}
      />

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
