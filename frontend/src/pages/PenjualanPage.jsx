import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, MoreVertical, Trash2, Upload } from 'lucide-react';
import {
  deletePenjualanUploadBatch,
  getPenjualanRingkasan,
  listPenjualanPerluCek,
  listPenjualanUploadBatches,
  updateKategoriPenjualan,
} from '../api/penjualan';
import AppShell from '../components/layout/AppShell';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PenjualanUploadSheet from '../components/PenjualanUploadSheet';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const BULAN_SINGKAT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
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

/** MMM YYYY — untuk header card collapse */
function labelBulanSingkat(key) {
  const [y, m] = String(key || '').split('-');
  const idx = Number(m) - 1;
  if (!y || !Number.isFinite(idx) || idx < 0 || idx > 11) return key || '—';
  return `${BULAN_SINGKAT[idx]} ${y}`;
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
  const [uploadOpen, setUploadOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [overrideBusyId, setOverrideBusyId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const toastTimer = useRef(null);
  const menuRef = useRef(null);

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

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await loadRingkasan();
    } catch (err) {
      showToast(err.message || 'Gagal memuat ringkasan');
    } finally {
      setLoading(false);
    }
  }, [loadRingkasan, showToast]);

  useEffect(() => {
    refreshAll();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refreshAll]);

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

  async function handleUploadSuccess(summary) {
    await loadRingkasan();
    if (tab === 'perlu_cek' || (summary?.perlu_cek || 0) > 0) {
      try {
        await loadPerluCek();
      } catch {
        /* ringkasan sudah refresh */
      }
    }
    if (tab === 'riwayat') {
      try {
        await loadBatches();
      } catch {
        /* ignore */
      }
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
    if (!deleteTarget || deleting) return;
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

  const tabBtn = (id, label, badge = null) => (
    <button
      key={id}
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
    <AppShell
      title="Penjualan"
      navLoading={loading}
      actions={
        canTambah ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary transition hover:bg-bg-surface-hover hover:text-text-primary"
              aria-label="Menu penjualan"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[11rem] overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface shadow-lg shadow-black/40"
              >
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
                  Upload Penjualan
                </button>
              </div>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="space-y-3">
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
              Belum ada data penjualan.
              {canTambah
                ? ' Buka menu titik tiga → Upload Penjualan untuk mengunggah Excel Vmedis.'
                : ''}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5">
              {ringkasan.map((row) => {
                const retailGabungNominal =
                  (Number(row.retail_nominal) || 0) +
                  (Number(row.titip_nominal) || 0);
                const retailGabungFaktur =
                  (Number(row.retail_faktur) || 0) +
                  (Number(row.titip_faktur) || 0);

                return (
                  <article
                    key={row.bulan}
                    className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5"
                  >
                    {/* Collapse row 1 — bulan | perlu cek / total baris */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="shrink-0 text-[14px] font-semibold leading-none text-text-primary">
                        {labelBulanSingkat(row.bulan)}
                      </h3>
                      <p className="min-w-0 flex-1 text-right text-[11px] leading-snug text-text-secondary">
                        <span
                          className={
                            (row.perlu_cek || 0) > 0
                              ? 'text-state-warning'
                              : undefined
                          }
                        >
                          {formatNumber(row.perlu_cek || 0)}
                        </span>
                        {' / '}
                        {formatNumber(row.jumlah_transaksi)} baris perlu cek
                      </p>
                    </div>

                    {/* Collapse row 2 — Retail(+Titip) · Mitra | total */}
                    <div className="mt-1.5 flex items-end justify-between gap-2">
                      <div className="min-w-0 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-snug text-text-secondary">
                        <span>
                          <span className="font-medium text-text-primary">
                            Retail
                          </span>{' '}
                          {formatRupiah(retailGabungNominal)}{' '}
                          <span className="text-text-muted">
                            ({formatNumber(retailGabungFaktur)})
                          </span>
                        </span>
                        <span>
                          <span className="font-medium text-text-primary">
                            Mitra
                          </span>{' '}
                          {formatRupiah(row.mitra_nominal)}{' '}
                          <span className="text-text-muted">
                            ({formatNumber(row.mitra_faktur)})
                          </span>
                        </span>
                      </div>
                      <p className="shrink-0 text-[13px] font-medium leading-none text-accent-yellow">
                        {formatRupiah(row.total_nominal)}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : null}

        {!loading && tab === 'perlu_cek' ? (
          perluCekItems.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Tidak ada baris perlu cek.
            </div>
          ) : (
            <div className="space-y-1.5">
              {!canEdit ? (
                <p className="flex items-start gap-1.5 text-[11px] text-text-muted">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Hanya user dengan izin edit yang dapat menandai kategori.
                </p>
              ) : null}
              {perluCekItems.map((row) => (
                <article
                  key={row.id}
                  className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-[13px] font-semibold text-text-primary">
                        {row.nama_obat || row.kode_obat}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-text-secondary">
                        {row.no_faktur || '—'} · {row.kode_obat || '—'} ·{' '}
                        {formatTanggal(row.tanggal_transaksi)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-text-muted">
                        Dokter: {row.nama_dokter || '—'} ·{' '}
                        {row.harga_jual_label || '—'}
                      </p>
                    </div>
                    <p className="shrink-0 text-[12px] font-medium text-accent-yellow">
                      {formatRupiah(row.subtotal ?? row.harga)}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {['retail', 'mitra', 'titip'].map((kat) => (
                        <button
                          key={kat}
                          type="button"
                          disabled={overrideBusyId === row.id}
                          onClick={() => handleOverride(row.id, kat)}
                          className="rounded-[4px] border border-border-subtle px-2 py-1 text-[11px] capitalize text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
                        >
                          {overrideBusyId === row.id ? (
                            <SubmitSpinner className="inline h-3 w-3" />
                          ) : (
                            kat
                          )}
                        </button>
                      ))}
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
              ) : null}
              {batches.map((batch) => (
                <article
                  key={batch.id}
                  className="flex items-start justify-between gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-[13px] font-semibold text-text-primary">
                      {batch.nama_file || '—'}
                    </h3>
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

      <PenjualanUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        onToast={showToast}
      />

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
