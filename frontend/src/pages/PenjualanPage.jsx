import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Trash2, Upload } from 'lucide-react';
import {
  confirmPenjualanUpload,
  deletePenjualanUploadBatch,
  getPenjualanRingkasan,
  listPenjualanPerluCek,
  listPenjualanUploadBatches,
  parsePenjualanPreview,
  updateKategoriPenjualan,
} from '../api/penjualan';
import AppShell from '../components/layout/AppShell';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PenjualanUploadPreviewSheet from '../components/PenjualanUploadPreviewSheet';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const BULAN_LABEL = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

function formatRupiah(value) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value) || 0);
}

function labelBulan(key) {
  const [y, m] = String(key || '').split('-');
  const idx = Number(m) - 1;
  if (!y || !Number.isFinite(idx) || idx < 0 || idx > 11) return key || '—';
  return `${BULAN_LABEL[idx]} ${y}`;
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

export default function PenjualanPage() {
  const { hasAccess, profile } = useAuth();
  const canTambah = hasAccess('penjualan', 'tambah');
  const canEdit = hasAccess('penjualan', 'edit');
  const isOwner = profile?.is_owner === true;

  const [tab, setTab] = useState('ringkasan'); // ringkasan | perlu_cek | riwayat
  const [ringkasan, setRingkasan] = useState([]);
  const [totalPerluCek, setTotalPerluCek] = useState(0);
  const [perluCekItems, setPerluCekItems] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [overrideBusyId, setOverrideBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const toastTimer = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }, []);

  const loadRingkasan = useCallback(async () => {
    const data = await getPenjualanRingkasan();
    setRingkasan(data.ringkasan || []);
    setTotalPerluCek(data.total_perlu_cek || 0);
  }, []);

  const loadPerluCek = useCallback(async () => {
    const data = await listPenjualanPerluCek({ limit: 200, offset: 0 });
    setPerluCekItems(data.items || []);
    setTotalPerluCek(data.total ?? (data.items || []).length);
  }, []);

  const loadBatches = useCallback(async () => {
    const data = await listPenjualanUploadBatches();
    setBatches(data.items || []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await loadRingkasan();
      if (tab === 'perlu_cek') await loadPerluCek();
      if (tab === 'riwayat') await loadBatches();
    } catch (err) {
      showToast(err.message || 'Gagal memuat data penjualan');
    } finally {
      setLoading(false);
    }
  }, [loadRingkasan, loadPerluCek, loadBatches, tab, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab !== 'perlu_cek' && tab !== 'riwayat') return;
    let cancelled = false;
    (async () => {
      try {
        if (tab === 'perlu_cek') await loadPerluCek();
        if (tab === 'riwayat') await loadBatches();
      } catch (err) {
        if (!cancelled) showToast(err.message || 'Gagal memuat data');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, loadPerluCek, loadBatches, showToast]);

  async function handleFile(file) {
    if (!file || busy) return;
    const name = String(file.name || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      showToast('Hanya file Excel (.xlsx) yang diterima');
      return;
    }

    setBusy(true);
    try {
      const result = await parsePenjualanPreview(file);
      setPreview(result);
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
      const summary = await confirmPenjualanUpload(preview.session_id);
      setPreviewOpen(false);
      setPreview(null);
      showToast(
        `Masuk ${summary.masuk}, di-skip ${summary.di_skip}` +
          (summary.perlu_cek ? `, perlu cek ${summary.perlu_cek}` : '')
      );
      await loadRingkasan();
      if (tab === 'perlu_cek' || (summary.perlu_cek || 0) > 0) {
        await loadPerluCek();
      }
      if (tab === 'riwayat') await loadBatches();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan');
    } finally {
      setBusy(false);
    }
  }

  async function handleOverride(id, kategori) {
    if (!canEdit || overrideBusyId) return;
    setOverrideBusyId(id);
    try {
      await updateKategoriPenjualan(id, kategori);
      setPerluCekItems((prev) => prev.filter((row) => row.id !== id));
      setTotalPerluCek((n) => Math.max(0, n - 1));
      showToast(`Ditandai sebagai ${kategori}`);
      await loadRingkasan();
    } catch (err) {
      showToast(err.message || 'Gagal mengubah kategori');
    } finally {
      setOverrideBusyId(null);
    }
  }

  async function handleConfirmDeleteBatch() {
    if (!deleteTarget || !isOwner) return;
    setDeleting(true);
    try {
      const result = await deletePenjualanUploadBatch(deleteTarget.id);
      showToast(
        `Dataset “${result.nama_file || deleteTarget.nama_file}” dihapus (${result.baris_dihapus || 0} baris)`
      );
      setDeleteTarget(null);
      await loadBatches();
      await loadRingkasan();
      if (tab === 'perlu_cek') await loadPerluCek();
    } catch (err) {
      showToast(err.message || 'Gagal menghapus dataset');
    } finally {
      setDeleting(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (!canTambah) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  const tabBtn = (id, label, badge = null) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`inline-flex flex-1 items-center justify-center gap-1 rounded-[4px] px-2 py-1.5 text-[12px] font-medium ${
        tab === id
          ? 'bg-accent-navy text-white'
          : 'text-text-secondary hover:bg-bg-surface-hover'
      }`}
    >
      {label}
      {badge}
    </button>
  );

  return (
    <AppShell title="Penjualan" navLoading={loading}>
      <div className="space-y-3">
        {canTambah ? (
          <section
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-[4px] border border-dashed px-3 py-4 transition ${
              dragOver
                ? 'border-accent-yellow bg-accent-yellow/10'
                : 'border-border-subtle bg-bg-surface'
            }`}
          >
            <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <p className="text-[13px] font-medium text-text-primary">
                  Upload Excel Vmedis (.xlsx)
                </p>
                <p className="mt-0.5 text-[11px] text-text-secondary">
                  File dari Vmedis sering rusak styles-nya — sistem memperbaiki otomatis.
                  Drag-drop atau pilih file.
                </p>
              </div>
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
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </section>
        ) : null}

        <div className="flex gap-1 rounded-[4px] border border-border-subtle bg-bg-surface p-0.5">
          {tabBtn('ringkasan', 'Ringkasan')}
          {tabBtn(
            'perlu_cek',
            'Perlu cek',
            totalPerluCek > 0 ? (
              <span
                className={`rounded-[4px] px-1 py-0.5 text-[10px] font-semibold ${
                  tab === 'perlu_cek'
                    ? 'bg-white/20 text-white'
                    : 'bg-state-warning/20 text-state-warning'
                }`}
              >
                {totalPerluCek}
              </span>
            ) : null
          )}
          {tabBtn('riwayat', 'Riwayat Upload')}
        </div>

        {loading ? (
          <div className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
            Memuat…
          </div>
        ) : null}

        {!loading && tab === 'ringkasan' ? (
          ringkasan.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Belum ada data penjualan. Upload Excel (.xlsx) dari Vmedis untuk mulai.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5">
              {ringkasan.map((row) => (
                <article
                  key={row.bulan}
                  className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[14px] font-semibold text-text-primary">
                      {labelBulan(row.bulan)}
                    </h3>
                    <p className="text-[13px] font-medium text-accent-yellow">
                      {formatRupiah(row.total_nominal)}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-secondary">
                    <span>{formatNumber(row.jumlah_transaksi)} baris</span>
                    <span>Retail {formatNumber(row.retail)}</span>
                    <span>Mitra {formatNumber(row.mitra)}</span>
                    <span>Titip {formatNumber(row.titip)}</span>
                    {(row.perlu_cek || 0) > 0 ? (
                      <span className="text-state-warning">
                        Perlu cek {formatNumber(row.perlu_cek)}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )
        ) : null}

        {!loading && tab === 'perlu_cek' ? (
          perluCekItems.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Tidak ada transaksi yang perlu dicek.
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="flex items-start gap-1.5 text-[11px] text-text-secondary">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-warning" />
                Hanya salah satu syarat Mitra/Titip terpenuhi. Tandai manual jadi retail,
                mitra, atau titip.
              </p>
              {perluCekItems.map((row) => (
                <article
                  key={row.id}
                  className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-text-primary">
                        {row.nama_obat || row.kode_obat}
                      </p>
                      <p className="text-[11px] text-text-muted">
                        {row.kode_obat} · {row.no_faktur}
                      </p>
                    </div>
                    <p className="shrink-0 text-[12px] text-text-secondary">
                      {formatRupiah(row.subtotal)}
                    </p>
                  </div>
                  <div className="mt-1 text-[11px] text-text-secondary">
                    <span>{formatTanggal(row.tanggal_transaksi)}</span>
                    {' · '}
                    dokter: {row.nama_dokter || '—'}
                    {' · '}
                    {row.harga_jual_label || '—'}
                  </div>
                  {canEdit ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={overrideBusyId === row.id}
                        onClick={() => handleOverride(row.id, 'retail')}
                        className="rounded-[4px] border border-border-subtle px-2.5 py-1 text-[11px] text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
                      >
                        {overrideBusyId === row.id ? '…' : 'Retail'}
                      </button>
                      <button
                        type="button"
                        disabled={overrideBusyId === row.id}
                        onClick={() => handleOverride(row.id, 'mitra')}
                        className="rounded-[4px] border border-accent-yellow/40 bg-accent-yellow/10 px-2.5 py-1 text-[11px] text-accent-yellow hover:bg-accent-yellow/20 disabled:opacity-50"
                      >
                        {overrideBusyId === row.id ? '…' : 'Mitra'}
                      </button>
                      <button
                        type="button"
                        disabled={overrideBusyId === row.id}
                        onClick={() => handleOverride(row.id, 'titip')}
                        className="rounded-[4px] border border-border-subtle px-2.5 py-1 text-[11px] text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
                      >
                        {overrideBusyId === row.id ? '…' : 'Titip'}
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )
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
              ) : (
                <p className="text-[11px] text-text-secondary">
                  Hapus dataset menghapus semua baris transaksi dari file tersebut.
                </p>
              )}
              {batches.map((batch) => (
                <article
                  key={batch.id}
                  className="flex items-start gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text-primary">
                      {batch.nama_file}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-secondary">
                      {formatTanggal(batch.tanggal_upload)}
                      {' · '}
                      {batch.diupload_oleh || '—'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      Masuk {formatNumber(batch.jumlah_baris_masuk)}
                      {' · '}
                      Skip {formatNumber(batch.jumlah_baris_skip_duplikat)}
                    </p>
                  </div>
                  {isOwner ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(batch)}
                      disabled={deleting}
                      className="shrink-0 rounded-[4px] p-1.5 text-state-error hover:bg-state-error/10 disabled:opacity-50"
                      aria-label={`Hapus dataset ${batch.nama_file}`}
                      title="Hapus dataset"
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
        <PenjualanUploadPreviewSheet
          preview={preview}
          onConfirm={handleConfirm}
          onCancel={() => {
            if (!busy) {
              setPreviewOpen(false);
              setPreview(null);
            }
          }}
          submitting={busy}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmDeleteModal
          confirmName={deleteTarget.nama_file}
          title="Hapus Dataset Upload"
          entityLabel="file"
          submitting={deleting}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={handleConfirmDeleteBatch}
        />
      ) : null}

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
