import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listMenungguVerifikasi,
  verifikasiMatching,
} from '../api/matching';
import AppShell from '../components/layout/AppShell';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';

/**
 * TODO: batasi akses halaman ini ke owner / is_owner setelah sistem akses
 * (Group) final diimplementasikan. Saat ini terbuka untuk semua user.
 */

function formatWhen(iso) {
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
    return iso;
  }
}

function Skeleton() {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[4px] border border-border-subtle bg-bg-surface p-2.5"
        >
          <div className="h-3.5 w-2/3 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-2 h-3 w-1/2 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-3 h-7 w-40 rounded-[4px] bg-bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

export default function MatchingVerifikasiPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listMenungguVerifikasi();
      setItems(data || []);
    } catch (err) {
      showToast(err.message || 'Gagal memuat antrean');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh]);

  const handleKeputusan = async (id, keputusan) => {
    setBusyId(id);
    try {
      await verifikasiMatching(id, keputusan);
      setItems((prev) => prev.filter((row) => row.id !== id));
      showToast(keputusan === 'setuju' ? 'Disetujui' : 'Ditolak');
    } catch (err) {
      showToast(err.message || 'Gagal memverifikasi');
    } finally {
      setBusyId('');
    }
  };

  return (
    <AppShell
      title="Verifikasi Matching"
      navLoading={loading}
      actions={
        <Link to="/matching" className="text-[11px] text-accent-yellow hover:underline">
          ← Matching
        </Link>
      }
    >
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-accent-yellow">
        HEYBAT
      </p>
      <h1 className="mb-1 text-[22px] font-bold leading-tight text-text-primary">
        Verifikasi Matching
      </h1>
      <p className="mb-3 text-[12px] leading-snug text-state-warning">
        Akses sementara terbuka untuk semua user. Nanti dibatasi ke owner /
        is_owner setelah sistem akses siap.
      </p>

      {loading ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <p className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-4 text-[13px] text-text-muted">
          Tidak ada matching menunggu verifikasi.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5">
          {items.map((row) => {
            const busy = busyId === row.id;
            return (
              <article
                key={row.id}
                className="rounded-[4px] border border-border-subtle bg-bg-surface p-2.5 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-[4px] bg-state-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning">
                    menunggu
                  </span>
                  {row.supplier?.inisial && (
                    <span className="rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-bold text-bg-base">
                      {row.supplier.inisial}
                    </span>
                  )}
                </div>
                <h2 className="mt-1.5 text-[14px] font-bold leading-snug text-text-primary">
                  {row.obat?.nama_obat || row.kode_obat_yelo || '—'}
                </h2>
                <p className="mt-0.5 text-[12px] text-text-secondary">
                  ← {row.pricelist_nama_barang || row.pricelist_kode_pbf}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">
                  Dipilih oleh {row.dipilih_oleh || '—'} ·{' '}
                  {formatWhen(row.tanggal_dipilih)}
                </p>
                <p className="text-[11px] text-text-muted">
                  PBF: {row.supplier?.nama || '—'} · kode{' '}
                  {row.pricelist_kode_pbf}
                </p>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleKeputusan(row.id, 'setuju')}
                    className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy && <SubmitSpinner className="h-3.5 w-3.5" />}
                    Setuju
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleKeputusan(row.id, 'tolak')}
                    className="rounded-[4px] border border-state-error/60 px-3 py-1.5 text-[13px] font-semibold text-state-error hover:bg-bg-surface-hover disabled:opacity-50"
                  >
                    Tolak
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </AppShell>
  );
}
