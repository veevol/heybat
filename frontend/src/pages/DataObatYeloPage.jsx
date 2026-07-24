import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react';
import {
  createObatYelo,
  deleteObatYelo,
  listObatYelo,
  updateObatYelo,
} from '../api/obatYelo';
import { listRef } from '../api/refData';
import AppShell from '../components/layout/AppShell';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import ObatYeloCard from '../components/ObatYeloCard';
import ObatYeloDetailSheet from '../components/ObatYeloDetailSheet';
import ObatYeloFormModal from '../components/ObatYeloFormModal';
import ObatYeloSkeleton from '../components/ObatYeloSkeleton';
import Toast from '../components/Toast';

const PAGE_SIZE = 50;

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

export default function DataObatYeloPage() {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
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
  const searchTimer = useRef(null);

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
      setRefs({
        kandungan: kandungan || [],
        golongan: golongan || [],
        satuan: satuan || [],
        'grup-substitusi': grup || [],
      });
    } catch (err) {
      showToast(err.message || 'Gagal memuat data referensi');
    }
  }, [showToast]);

  const refreshList = useCallback(
    async (pageNum = page, searchTerm = search) => {
      setLoading(true);
      setLoadError('');
      try {
        const result = await listObatYelo({
          page: pageNum,
          limit: PAGE_SIZE,
          search: searchTerm,
        });
        setItems(result.data || []);
        setTotal(result.total ?? 0);
        setTotalPages(result.totalPages ?? 1);
        setPage(result.page ?? pageNum);
        return result.data || [];
      } catch (err) {
        setLoadError(err.message || 'Gagal memuat data obat');
        return [];
      } finally {
        setLoading(false);
      }
    },
    [page, search]
  );

  useEffect(() => {
    loadRefs();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [loadRefs]);

  useEffect(() => {
    refreshList(page, search);
  }, [page, search]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSearchChange(event) {
    const value = event.target.value;
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setSearch(value.trim());
    }, 350);
  }

  function clearSearch() {
    setSearchInput('');
    setSearch('');
    setPage(1);
  }

  function openCreate() {
    setModalMode('create');
    setEditing(null);
    setSelected(null);
    setForm({ ...EMPTY_FORM });
    setFormError('');
    loadRefs();
  }

  function openEdit(obat) {
    setModalMode('edit');
    setEditing(obat);
    setSelected(null);
    setForm(obatToForm(obat));
    setFormError('');
    loadRefs();
  }

  function closeForm() {
    if (submitting) return;
    setModalMode(null);
    setEditing(null);
    setFormError('');
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
      if (modalMode === 'create') {
        saved = await createObatYelo(payload);
        showToast('Obat berhasil ditambahkan');
      } else if (modalMode === 'edit' && editing) {
        const { kode_obat: _kode, ...rest } = payload;
        saved = await updateObatYelo(editing.kode_obat, rest);
        showToast('Obat berhasil diperbarui');
      }

      setModalMode(null);
      setEditing(null);
      const list = await refreshList(page, search);
      if (saved?.kode_obat) {
        const fresh = list.find((item) => item.kode_obat === saved.kode_obat);
        if (fresh) setSelected(fresh);
        else setSelected(saved);
      }
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
      setDeleting(null);
      setSelected(null);
      await refreshList(page, search);
    } catch (err) {
      showToast(err.message || 'Gagal menghapus obat');
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const searchActions = (
    <div className="relative flex items-center">
      <Search
        className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-text-muted"
        strokeWidth={2}
      />
      <input
        type="search"
        value={searchInput}
        onChange={handleSearchChange}
        placeholder="Cari nama / kode"
        className="h-8 w-[148px] rounded-[4px] border border-border-subtle bg-bg-surface py-1 pl-7 pr-7 text-[12px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow sm:w-[200px]"
        aria-label="Cari obat"
      />
      {searchInput ? (
        <button
          type="button"
          onClick={clearSearch}
          className="absolute right-1.5 text-text-muted hover:text-text-primary"
          aria-label="Hapus pencarian"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );

  return (
    <AppShell
      title="Data Obat Yelo"
      actions={searchActions}
      pageAction={{ onClick: openCreate }}
    >
      {loading ? <ObatYeloSkeleton /> : null}

      {!loading && loadError ? (
        <div className="rounded-[4px] border border-state-error/40 bg-state-error/10 px-3 py-3 text-center">
          <p className="text-[13px] text-state-error">{loadError}</p>
          <button
            type="button"
            onClick={() => refreshList(page, search)}
            className="mt-2 text-[11px] font-medium text-accent-yellow underline-offset-2 hover:underline"
          >
            Coba lagi
          </button>
        </div>
      ) : null}

      {!loading && !loadError && items.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center">
          <p className="text-[13px] text-text-secondary">
            {search
              ? `Tidak ada obat yang cocok dengan “${search}”.`
              : 'Belum ada data obat. Import CSV atau tambah manual.'}
          </p>
          {!search ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white sm:w-auto"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              Tambah Obat
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && !loadError && items.length > 0 ? (
        <>
          <p className="mb-1.5 text-[11px] text-text-muted">
            {total.toLocaleString('id-ID')} obat
            {search ? ` · filter “${search}”` : ''}
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((obat) => (
              <ObatYeloCard
                key={obat.kode_obat}
                obat={obat}
                onOpen={setSelected}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-[4px] border border-border-subtle px-2.5 py-1.5 text-[12px] text-text-primary hover:bg-bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </button>
              <span className="text-[12px] text-text-secondary">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-[4px] border border-border-subtle px-2.5 py-1.5 text-[12px] text-text-primary hover:bg-bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {selected && !modalMode && !deleting ? (
        <ObatYeloDetailSheet
          obat={selected}
          onClose={() => setSelected(null)}
          onEdit={openEdit}
          onDelete={(obat) => {
            setSelected(null);
            setDeleting(obat);
          }}
        />
      ) : null}

      {modalMode ? (
        <ObatYeloFormModal
          mode={modalMode}
          values={form}
          onChange={handleChange}
          onField={handleField}
          refs={refs}
          onRefCreated={handleRefCreated}
          submitting={submitting}
          error={formError}
          onClose={closeForm}
          onSubmit={handleSubmit}
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

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
