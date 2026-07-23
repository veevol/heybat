import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  updateSupplier,
} from '../api/suppliers';
import AppShell from '../components/layout/AppShell';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import SupplierCard from '../components/SupplierCard';
import SupplierDetailSheet from '../components/SupplierDetailSheet';
import SupplierFormModal from '../components/SupplierFormModal';
import SupplierSkeleton from '../components/SupplierSkeleton';
import Toast from '../components/Toast';
import { defaultJadwal } from '../lib/supplier';

const EMPTY_FORM = {
  nama: '',
  inisial: '',
  no_telp_pbf: '',
  nama_sales: '',
  no_wa_sales: '',
  jenis_kelamin_sales: '',
  alamat: '',
  jenis_pbf: [],
  jadwal: defaultJadwal(),
};

function toPayload(form) {
  return {
    nama: form.nama,
    inisial: form.inisial,
    no_telp_pbf: form.no_telp_pbf,
    nama_sales: form.nama_sales,
    no_wa_sales: form.no_wa_sales,
    jenis_kelamin_sales: form.jenis_kelamin_sales || null,
    alamat: form.alamat,
    jenis_pbf: form.jenis_pbf,
    jadwal: form.jadwal.map((row) => ({
      hari: row.hari,
      bisa_order: Boolean(row.bisa_order),
      bisa_kirim: Boolean(row.bisa_kirim),
      jam_cutoff: row.jam_cutoff?.trim() || null,
    })),
  };
}

export default function DataSupplierPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
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

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }, []);

  const refreshList = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await listSuppliers();
      setSuppliers(data);
      return data;
    } catch (err) {
      setLoadError(err.message || 'Gagal memuat supplier');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshList();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refreshList]);

  function openCreate() {
    setModalMode('create');
    setEditing(null);
    setSelected(null);
    setForm({ ...EMPTY_FORM, jadwal: defaultJadwal() });
    setFormError('');
  }

  function openEdit(supplier) {
    setModalMode('edit');
    setEditing(supplier);
    setSelected(null);
    setForm({
      nama: supplier.nama || '',
      inisial: supplier.inisial || '',
      no_telp_pbf: supplier.no_telp_pbf || '',
      nama_sales: supplier.nama_sales || '',
      no_wa_sales: supplier.no_wa_sales || '',
      jenis_kelamin_sales: supplier.jenis_kelamin_sales || '',
      alamat: supplier.alamat || '',
      jenis_pbf: supplier.jenis_pbf || [],
      jadwal: defaultJadwal(supplier.jadwal),
    });
    setFormError('');
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

  function handleJenisPbfToggle(option) {
    setForm((prev) => {
      const exists = prev.jenis_pbf.includes(option);
      return {
        ...prev,
        jenis_pbf: exists
          ? prev.jenis_pbf.filter((item) => item !== option)
          : [...prev.jenis_pbf, option],
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
        saved = await createSupplier(payload);
        showToast('Supplier berhasil ditambahkan');
      } else if (modalMode === 'edit' && editing) {
        const { inisial: _inisial, ...rest } = payload;
        saved = await updateSupplier(editing.id, rest);
        showToast('Supplier berhasil diperbarui');
      }

      setModalMode(null);
      setEditing(null);
      const list = await refreshList();
      if (saved?.id) {
        const fresh = list.find((item) => item.id === saved.id);
        if (fresh) setSelected(fresh);
      }
    } catch (err) {
      setFormError(err.message || 'Gagal menyimpan supplier');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleting) return;
    setDeleteSubmitting(true);
    try {
      await deleteSupplier(deleting.id);
      showToast('Supplier berhasil dihapus');
      setDeleting(null);
      setSelected(null);
      await refreshList();
    } catch (err) {
      showToast(err.message || 'Gagal menghapus supplier');
    } finally {
      setDeleteSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Data Supplier"
      pageAction={{ onClick: openCreate }}
    >
      {loading ? <SupplierSkeleton /> : null}

      {!loading && loadError ? (
        <div className="rounded-[4px] border border-state-error/40 bg-state-error/10 px-3 py-3 text-center">
          <p className="text-[13px] text-state-error">{loadError}</p>
          <button
            type="button"
            onClick={refreshList}
            className="mt-2 text-[11px] font-medium text-accent-yellow underline-offset-2 hover:underline"
          >
            Coba lagi
          </button>
        </div>
      ) : null}

      {!loading && !loadError && suppliers.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center">
          <p className="text-[13px] text-text-secondary">
            Belum ada supplier. Tambahkan yang pertama supaya pricelist nanti siap.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white sm:w-auto"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Tambah Supplier
          </button>
        </div>
      ) : null}

      {!loading && !loadError && suppliers.length > 0 ? (
        <div className="grid grid-cols-1 gap-1.5">
          {suppliers.map((supplier) => (
            <SupplierCard
              key={supplier.id}
              supplier={supplier}
              onOpen={setSelected}
            />
          ))}
        </div>
      ) : null}

      {selected && !modalMode && !deleting ? (
        <SupplierDetailSheet
          supplier={selected}
          onClose={() => setSelected(null)}
          onEdit={openEdit}
          onDelete={(supplier) => {
            setSelected(null);
            setDeleting(supplier);
          }}
        />
      ) : null}

      {modalMode ? (
        <SupplierFormModal
          mode={modalMode}
          values={form}
          onChange={handleChange}
          onJenisPbfToggle={handleJenisPbfToggle}
          onJadwalChange={(jadwal) => setForm((prev) => ({ ...prev, jadwal }))}
          submitting={submitting}
          error={formError}
          onClose={closeForm}
          onSubmit={handleSubmit}
        />
      ) : null}

      {deleting ? (
        <ConfirmDeleteModal
          supplierName={deleting.nama}
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
