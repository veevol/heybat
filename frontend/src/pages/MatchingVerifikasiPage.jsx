import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getKatalogObat,
  listMenungguVerifikasi,
  updateMatching,
  verifikasiMatching,
} from '../api/matching';
import AppShell from '../components/layout/AppShell';
import SearchableObatSelect from '../components/SearchableObatSelect';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import {
  formatHarga,
  formatOlehDipilih,
  formatSatuanKonversi,
} from '../lib/matchingUi';

/**
 * TODO: batasi akses halaman ini ke owner / is_owner setelah sistem akses
 * (Group) final diimplementasikan. Saat ini terbuka untuk semua user.
 * Catatan UI sengaja tidak ditampilkan — hanya komentar kode.
 */

function Skeleton() {
  return (
    <div className="grid grid-cols-1 gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[4px] border border-border-subtle bg-bg-surface p-2.5"
        >
          <div className="h-3.5 w-2/3 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-2 h-3 w-1/2 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-3 h-12 w-full rounded-[4px] bg-bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

export default function MatchingVerifikasiPage() {
  const [items, setItems] = useState([]);
  const [katalog, setKatalog] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const katalogMap = useMemo(() => {
    const map = new Map();
    for (const o of katalog) map.set(o.kode_obat, o);
    return map;
  }, [katalog]);

  const breakdownByPbf = useMemo(() => {
    const counts = new Map();
    for (const row of items) {
      const label = row.supplier?.inisial || row.supplier?.nama || 'PBF';
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'id'));
  }, [items]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [data, obat] = await Promise.all([
        listMenungguVerifikasi(),
        getKatalogObat(),
      ]);
      setItems(data || []);
      setKatalog(obat || []);
      setEdits({});
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

  const selectedKodeFor = (row) =>
    edits[row.id] ?? row.kode_obat_yelo ?? '';

  const handleChangeObat = async (row, kodeObat) => {
    setEdits((prev) => ({ ...prev, [row.id]: kodeObat }));
    if (!kodeObat || kodeObat === row.kode_obat_yelo) return;
    try {
      const updated = await updateMatching(row.id, {
        kode_obat_yelo: kodeObat,
      });
      setItems((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, ...updated } : item))
      );
    } catch (err) {
      showToast(err.message || 'Gagal mengubah obat');
      setEdits((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    }
  };

  const handleKeputusan = async (id, keputusan) => {
    setBusyId(id);
    try {
      await verifikasiMatching(id, keputusan);
      setItems((prev) => prev.filter((row) => row.id !== id));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
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
        <Link
          to="/matching"
          className="text-[11px] text-accent-yellow hover:underline"
        >
          ← Matching
        </Link>
      }
    >
      {!loading && items.length > 0 && (
        <p className="mb-3 text-[11px] leading-snug text-text-secondary">
          {items.length} menunggu verifikasi
          {breakdownByPbf.length > 0
            ? ` · ${breakdownByPbf
                .map(([label, n]) => `${label}: ${n} menunggu`)
                .join(' · ')}`
            : ''}
        </p>
      )}

      {loading ? (
        <Skeleton />
      ) : items.length === 0 ? (
        <p className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-4 text-[13px] text-text-muted">
          Tidak ada matching menunggu verifikasi.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {items.map((row) => {
            const busy = busyId === row.id;
            const selectedKode = selectedKodeFor(row);
            const obatMeta =
              katalogMap.get(selectedKode) ||
              (row.obat?.kode_obat === selectedKode ? row.obat : null) ||
              row.obat;
            const yeloBadge = formatSatuanKonversi(obatMeta);
            const hargaLabel = formatHarga(row.pricelist_harga_dasar);

            return (
              <article
                key={row.id}
                className="rounded-[4px] border border-border-subtle bg-bg-surface p-2.5 shadow-sm"
              >
                {/* Section 1 — Data PBF */}
                <div>
                  <div className="flex items-center gap-2">
                    {row.supplier?.inisial ? (
                      <span className="shrink-0 rounded-[4px] bg-bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {row.supplier.inisial}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-text-muted">
                        PBF
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-right text-[11px] leading-snug text-text-secondary">
                      {formatOlehDipilih(row.dipilih_oleh, row.tanggal_dipilih)}
                    </span>
                    <span className="shrink-0 rounded-[4px] bg-state-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning">
                      menunggu
                    </span>
                  </div>
                  <h2 className="mt-1.5 text-[14px] font-bold leading-snug text-text-primary">
                    {row.pricelist_nama_barang || row.pricelist_kode_pbf || '—'}
                  </h2>
                  {(row.pricelist_satuan || hargaLabel) && (
                    <p className="mt-0.5 text-[12px] leading-snug text-text-secondary">
                      {[row.pricelist_satuan, hargaLabel]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  {row.pricelist_catatan_kondisi ? (
                    <p className="mt-1 text-[11px] leading-snug text-text-muted">
                      {row.pricelist_catatan_kondisi}
                    </p>
                  ) : null}
                </div>

                <div className="mt-2 rounded-[4px] bg-accent-yellow px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold leading-snug text-bg-base">
                      {obatMeta?.nama_obat || selectedKode || '—'}
                    </span>
                    {yeloBadge ? (
                      <span className="shrink-0 rounded-[4px] bg-bg-base/15 px-1.5 py-0.5 text-[10px] font-semibold text-bg-base">
                        {yeloBadge}
                      </span>
                    ) : null}
                  </div>
                  {obatMeta?.grup_substitusi?.nama ? (
                    <p className="mt-1 text-[11px] leading-snug text-bg-base/75">
                      Substitusi: {obatMeta.grup_substitusi.nama}
                    </p>
                  ) : null}
                </div>

                {/* Section 3 — Aksi */}
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 sm:max-w-[55%] sm:flex-1">
                    <SearchableObatSelect
                      options={katalog}
                      value={selectedKode}
                      onChange={(kode) => handleChangeObat(row, kode)}
                      placeholder="Ganti obat Yelo…"
                    />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
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
