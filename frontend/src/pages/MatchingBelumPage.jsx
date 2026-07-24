import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { listSuppliers } from '../api/suppliers';
import { listUnmatched } from '../api/matching';
import AppShell from '../components/layout/AppShell';
import Toast from '../components/Toast';

const selectClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow';

function Skeleton() {
  return (
    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[4px] border border-border-subtle bg-bg-surface p-2.5"
        >
          <div className="h-3.5 w-3/4 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-2 h-3 w-1/3 rounded-[4px] bg-bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

function formatHarga(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('id-ID');
}

export default function MatchingBelumPage() {
  const [tab, setTab] = useState('obat'); // obat | pbf
  const [suppliers, setSuppliers] = useState([]);
  const [pbfFilter, setPbfFilter] = useState('');
  const [obatBelum, setObatBelum] = useState([]);
  const [itemPbfBelum, setItemPbfBelum] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  const refresh = useCallback(
    async (filterId = pbfFilter) => {
      setLoading(true);
      try {
        const data = await listUnmatched(
          filterId ? { pbf_id: filterId } : undefined
        );
        setObatBelum(data.obat_yelo_belum || []);
        setItemPbfBelum(data.item_pbf_belum || []);
      } catch (err) {
        showToast(err.message || 'Gagal memuat data');
        setObatBelum([]);
        setItemPbfBelum([]);
      } finally {
        setLoading(false);
      }
    },
    [pbfFilter, showToast]
  );

  useEffect(() => {
    listSuppliers()
      .then((data) => setSuppliers(data || []))
      .catch((err) => showToast(err.message || 'Gagal memuat supplier'));
    refresh('');
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load once
  }, []);

  const onFilterChange = async (id) => {
    setPbfFilter(id);
    await refresh(id);
  };

  const filteredPbfItems = useMemo(() => {
    if (!pbfFilter) return itemPbfBelum;
    return itemPbfBelum.filter((r) => r.pbf_id === pbfFilter);
  }, [itemPbfBelum, pbfFilter]);

  return (
    <AppShell
      title="Belum Matching"
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
      <h1 className="mb-3 text-[22px] font-bold leading-tight text-text-primary">
        Belum Matching
      </h1>

      <div className="mb-3 flex gap-1 rounded-[4px] border border-border-subtle bg-bg-surface p-0.5">
        <button
          type="button"
          onClick={() => setTab('obat')}
          className={`flex-1 rounded-[4px] px-2 py-1.5 text-[12px] font-semibold ${
            tab === 'obat'
              ? 'bg-accent-yellow text-bg-base'
              : 'text-text-secondary hover:bg-bg-surface-hover'
          }`}
        >
          Obat Yelo ({obatBelum.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('pbf')}
          className={`flex-1 rounded-[4px] px-2 py-1.5 text-[12px] font-semibold ${
            tab === 'pbf'
              ? 'bg-accent-yellow text-bg-base'
              : 'text-text-secondary hover:bg-bg-surface-hover'
          }`}
        >
          Item PBF ({filteredPbfItems.length})
        </button>
      </div>

      {tab === 'pbf' && (
        <div className="mb-3">
          <label className="mb-1 block text-[13px] text-text-secondary">
            Filter PBF
          </label>
          <select
            className={selectClass}
            value={pbfFilter}
            onChange={(e) => onFilterChange(e.target.value)}
          >
            <option value="">Semua PBF</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.inisial ? `${s.inisial} · ` : ''}
                {s.nama}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <Skeleton />
      ) : tab === 'obat' ? (
        obatBelum.length === 0 ? (
          <p className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-4 text-[13px] text-text-muted">
            Semua obat Yelo sudah punya matching terverifikasi.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {obatBelum.map((o) => (
              <article
                key={o.kode_obat}
                className="rounded-[4px] border border-border-subtle bg-bg-surface p-2.5 shadow-sm"
              >
                <h2 className="truncate text-[13px] font-bold text-text-primary">
                  {o.nama_obat}
                </h2>
                <p className="mt-0.5 text-[11px] text-text-muted">{o.kode_obat}</p>
                {o.golongan?.nama && (
                  <p className="mt-1 text-[11px] text-text-secondary">
                    {o.golongan.nama}
                  </p>
                )}
              </article>
            ))}
          </div>
        )
      ) : filteredPbfItems.length === 0 ? (
        <p className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-4 text-[13px] text-text-muted">
          Tidak ada item PBF tanpa matching terverifikasi
          {pbfFilter ? ' untuk filter ini' : ''}.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5">
          {filteredPbfItems.map((row) => (
            <article
              key={`${row.pbf_id}-${row.kode_pbf}`}
              className="rounded-[4px] border border-border-subtle bg-bg-surface p-2.5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {row.pbf_inisial && (
                  <span className="rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-bold text-bg-base">
                    {row.pbf_inisial}
                  </span>
                )}
                {row.ditandai_tidak_cocok && (
                  <span className="rounded-[4px] bg-state-error/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-error">
                    Ditandai tidak cocok
                  </span>
                )}
                <span className="text-[11px] text-text-muted">{row.pbf_nama}</span>
              </div>
              <h2 className="mt-1 text-[13px] font-bold leading-snug text-text-primary">
                {row.nama_barang || '—'}
              </h2>
              <p className="mt-0.5 text-[11px] text-text-muted">
                {row.kode_pbf}
                {row.satuan ? ` · ${row.satuan}` : ''}
                {row.harga_dasar != null
                  ? ` · Rp ${formatHarga(row.harga_dasar)}`
                  : ''}
              </p>
            </article>
          ))}
        </div>
      )}

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </AppShell>
  );
}
