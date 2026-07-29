import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MoreVertical, Trash2 } from 'lucide-react';
import {
  deletePricelistUpload,
  listPricelistUploads,
} from '../api/pricelist';
import AppShell from '../components/layout/AppShell';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PricelistSkeleton from '../components/PricelistSkeleton';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

function formatPricelistDate(isoDate) {
  if (!isoDate) return '—';
  try {
    const d = String(isoDate).slice(0, 10);
    const [y, m, day] = d.split('-').map(Number);
    if (!y || !m || !day) return d;
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return String(isoDate);
  }
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('id-ID').format(num);
}

function displayDate(batch) {
  return batch.tanggal_pricelist || String(batch.tanggal_upload || '').slice(0, 10) || null;
}

function batchConfirmName(batch) {
  const inisial = batch.inisial || 'PBF';
  const tgl = formatPricelistDate(displayDate(batch));
  return `${inisial} ${tgl}`;
}

function HistoryRowMenu({ batch, onDelete, disabled }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onDoc(e) {
      if (!menuRef.current?.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-text-muted transition hover:bg-bg-surface-hover hover:text-text-primary disabled:opacity-40"
        aria-label="Menu history"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[9.5rem] overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface shadow-lg shadow-black/40"
        >
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              onDelete?.(batch);
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-state-error transition hover:bg-bg-surface-hover"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Hapus Pricelist
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function PricelistHistoryPage() {
  const navigate = useNavigate();
  const { hasAccess } = useAuth();
  const canHapus = hasAccess('pricelist-pbf', 'hapus');

  const [uploads, setUploads] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [toast, setToast] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await listPricelistUploads();
      setUploads(Array.isArray(data) ? data : []);
    } catch (err) {
      setUploads([]);
      showToast(err.message || 'Gagal memuat history pricelist');
    } finally {
      setLoadingList(false);
    }
  }, [showToast]);

  useEffect(() => {
    refreshList();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refreshList]);

  const openBatch = (batch) => {
    const qs = new URLSearchParams({
      pbf_id: batch.pbf_id,
      tanggal_upload: batch.tanggal_upload,
    });
    const tgl = displayDate(batch);
    if (tgl) qs.set('tanggal_pricelist', tgl);
    try {
      sessionStorage.setItem('heybat_pricelist_pbf_id', batch.pbf_id);
    } catch {
      /* ignore */
    }
    navigate(`/matching?${qs.toString()}`);
  };

  const backToMatching = () => {
    try {
      const last = sessionStorage.getItem('heybat_pricelist_pbf_id');
      if (last) {
        navigate(`/matching?pbf_id=${encodeURIComponent(last)}`);
        return;
      }
    } catch {
      /* ignore */
    }
    navigate('/matching');
  };

  async function handleConfirmDelete() {
    if (!deleteTarget || !canHapus) return;
    setDeleting(true);
    try {
      const result = await deletePricelistUpload({
        pbfId: deleteTarget.pbf_id,
        tanggalUpload: deleteTarget.tanggal_upload,
      });
      showToast(
        `Pricelist dihapus (${result.baris_dihapus || 0} baris) — matching & kode obat tetap`
      );
      setDeleteTarget(null);
      await refreshList();
    } catch (err) {
      showToast(err.message || 'Gagal menghapus pricelist');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell
      title="History Pricelist"
      actions={
        <button
          type="button"
          onClick={backToMatching}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary hover:bg-bg-surface-hover hover:text-accent-yellow"
          aria-label="Kembali ke Pricelist"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        </button>
      }
      navLoading={loadingList || deleting}
    >
      <p className="mb-2 text-[11px] text-text-muted">
        Riwayat pricelist — tap untuk buka matching dengan qty & harga batch itu.
      </p>

      {loadingList ? <PricelistSkeleton /> : null}

      {!loadingList && uploads.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
          Belum ada history pricelist.
        </div>
      ) : null}

      {!loadingList && uploads.length > 0 ? (
        <div className="grid grid-cols-1 gap-1.5">
          {uploads.map((batch) => (
            <div
              key={`${batch.pbf_id}-${batch.tanggal_upload}`}
              className="flex w-full items-center gap-1 rounded-[4px] border border-border-subtle bg-bg-surface shadow-sm shadow-black/10"
            >
              <button
                type="button"
                onClick={() => openBatch(batch)}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2.5 py-2.5 text-left transition hover:bg-bg-surface-hover"
              >
                <span className="min-w-0 truncate text-[13px] leading-snug text-text-primary">
                  {formatPricelistDate(displayDate(batch))}
                </span>
                <span className="shrink-0 text-right text-[13px] tabular-nums text-text-secondary">
                  <span className="font-semibold text-text-primary">
                    {formatNumber(batch.item_count)}
                  </span>
                  {' data · '}
                  <span className="font-semibold text-accent-yellow">
                    {batch.inisial || '—'}
                  </span>
                </span>
              </button>
              {canHapus ? (
                <div className="pr-1">
                  <HistoryRowMenu
                    batch={batch}
                    disabled={deleting}
                    onDelete={setDeleteTarget}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {deleteTarget ? (
        <ConfirmDeleteModal
          confirmName={batchConfirmName(deleteTarget)}
          title="Hapus Pricelist"
          entityLabel="pricelist"
          submitting={deleting}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
