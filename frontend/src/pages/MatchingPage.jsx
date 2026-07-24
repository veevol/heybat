import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { listSuppliers } from '../api/suppliers';
import {
  createMatching,
  getKandidatMatching,
  getKatalogObat,
  getRefreshKandidatStatus,
  markTidakCocok,
  refreshKandidat,
} from '../api/matching';
import AppShell from '../components/layout/AppShell';
import SearchableObatSelect from '../components/SearchableObatSelect';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';

const selectClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow';

const PAGE = 40;

function MatchingCardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[4px] border border-border-subtle bg-bg-surface p-2.5"
        >
          <div className="h-3.5 w-3/4 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-2 h-8 w-full rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-2 h-7 w-1/2 rounded-[4px] bg-bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

function formatScore(score) {
  return `${Math.round((score || 0) * 100)}%`;
}

function formatHarga(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('id-ID');
}

function formatRelative(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return 'baru saja';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 48) return `${diffHour} jam lalu`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} hari lalu`;
}

export default function MatchingPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [pbfId, setPbfId] = useState('');
  const [katalog, setKatalog] = useState([]);
  const [items, setItems] = useState([]);
  const [totalUnmatched, setTotalUnmatched] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [skipped, setSkipped] = useState(() => new Set());
  const [selections, setSelections] = useState({});
  const [submittingKode, setSubmittingKode] = useState('');
  const [loading, setLoading] = useState(false);
  const [katalogLoading, setKatalogLoading] = useState(true);
  const [cacheDihitungPada, setCacheDihitungPada] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const pollTimer = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3200);
  }, []);

  useEffect(() => {
    Promise.all([listSuppliers(), getKatalogObat()])
      .then(([sups, obat]) => {
        setSuppliers(sups || []);
        setKatalog(obat || []);
      })
      .catch((err) => showToast(err.message || 'Gagal memuat data awal'))
      .finally(() => setKatalogLoading(false));

    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [showToast]);

  const applySelections = useCallback((list, merge = false) => {
    setSelections((prev) => {
      const next = merge ? { ...prev } : {};
      for (const row of list) {
        if (!next[row.kode_pbf]) {
          next[row.kode_pbf] = row.kandidat?.[0]?.kode_obat_yelo || '';
        }
      }
      return next;
    });
  }, []);

  const loadKandidat = useCallback(
    async (id, { append = false, nextOffset = 0 } = {}) => {
      if (!id) {
        setItems([]);
        setTotalUnmatched(0);
        setSelections({});
        setOffset(0);
        setCacheDihitungPada(null);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await getKandidatMatching(id, {
          limit: PAGE,
          offset: nextOffset,
        });
        const list = data.items || [];
        setItems((prev) => (append ? [...prev, ...list] : list));
        setTotalUnmatched(data.total_unmatched ?? list.length);
        setOffset(nextOffset + list.length);
        setCacheDihitungPada(data.cache_dihitung_pada || null);
        applySelections(list, append);

        if (data.refresh_job?.status === 'running') {
          setRefreshing(true);
          setRefreshProgress(data.refresh_job);
        }
      } catch (err) {
        showToast(err.message || 'Gagal memuat kandidat');
        if (!append) {
          setItems([]);
          setTotalUnmatched(0);
          setOffset(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [showToast, applySelections]
  );

  useEffect(() => {
    setSkipped(new Set());
    setOffset(0);
    setRefreshing(false);
    setRefreshProgress(null);
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    loadKandidat(pbfId, { append: false, nextOffset: 0 });
  }, [pbfId, loadKandidat]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const startPollingRefresh = useCallback(
    (id) => {
      stopPolling();
      pollTimer.current = setInterval(async () => {
        try {
          const job = await getRefreshKandidatStatus(id);
          setRefreshProgress(job);
          if (job.status === 'done') {
            stopPolling();
            setRefreshing(false);
            const elapsed = job.elapsed_ms
              ? ` · ${(job.elapsed_ms / 1000).toFixed(1)}s`
              : '';
            showToast(`Kandidat di-refresh${elapsed}`);
            setSkipped(new Set());
            await loadKandidat(id, { append: false, nextOffset: 0 });
          } else if (job.status === 'error') {
            stopPolling();
            setRefreshing(false);
            showToast(job.error || 'Refresh gagal');
          } else if (job.status === 'idle') {
            stopPolling();
            setRefreshing(false);
          }
        } catch (err) {
          stopPolling();
          setRefreshing(false);
          showToast(err.message || 'Gagal cek status refresh');
        }
      }, 1500);
    },
    [loadKandidat, showToast, stopPolling]
  );

  const handleRefreshKandidat = async () => {
    if (!pbfId || refreshing) return;
    setRefreshing(true);
    setRefreshProgress({ status: 'running', processed: 0, total: 0 });
    try {
      const result = await refreshKandidat(pbfId);
      setRefreshProgress(result.job || { status: 'running' });
      showToast('Refresh kandidat dimulai…');
      startPollingRefresh(pbfId);
    } catch (err) {
      if (err.status === 409) {
        setRefreshing(true);
        showToast('Refresh masih berjalan');
        startPollingRefresh(pbfId);
        return;
      }
      setRefreshing(false);
      setRefreshProgress(null);
      showToast(err.message || 'Gagal memulai refresh');
    }
  };

  const visibleItems = useMemo(
    () => items.filter((row) => !skipped.has(row.kode_pbf)),
    [items, skipped]
  );

  const handleSelect = (kodePbf, kodeObat) => {
    setSelections((prev) => ({ ...prev, [kodePbf]: kodeObat }));
  };

  const handlePilih = async (row) => {
    const kodeObat = selections[row.kode_pbf];
    if (!kodeObat) {
      showToast('Pilih obat Yelo terlebih dahulu');
      return;
    }
    setSubmittingKode(row.kode_pbf);
    try {
      await createMatching({
        kode_obat_yelo: kodeObat,
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: row.kode_pbf,
      });
      setSkipped((prev) => new Set(prev).add(row.kode_pbf));
      setTotalUnmatched((n) => Math.max(0, n - 1));
      showToast('Tersimpan — menunggu verifikasi');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan matching');
    } finally {
      setSubmittingKode('');
    }
  };

  const handleSkip = async (kodePbf) => {
    setSubmittingKode(kodePbf);
    try {
      await markTidakCocok({
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: kodePbf,
      });
      setSkipped((prev) => new Set(prev).add(kodePbf));
      setTotalUnmatched((n) => Math.max(0, n - 1));
      showToast('Ditandai tidak cocok');
    } catch (err) {
      showToast(err.message || 'Gagal menandai tidak cocok');
    } finally {
      setSubmittingKode('');
    }
  };

  const cacheLabel = formatRelative(cacheDihitungPada);

  return (
    <AppShell
      title="Matching"
      navLoading={loading || katalogLoading || refreshing}
      actions={
        <div className="flex items-center gap-2 text-[11px]">
          <Link
            to="/matching/verifikasi"
            className="text-accent-yellow hover:underline"
          >
            Verifikasi
          </Link>
          <span className="text-text-muted">·</span>
          <Link
            to="/matching/belum-matching"
            className="text-accent-yellow hover:underline"
          >
            Belum match
          </Link>
        </div>
      }
    >
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-accent-yellow">
        HEYBAT
      </p>
      <h1 className="mb-3 text-[22px] font-bold leading-tight text-text-primary">
        Matching Obat
      </h1>
      <p className="mb-3 text-[13px] leading-snug text-text-secondary">
        Sambungkan item pricelist PBF ke master Obat Yelo. Pilihan staf masuk
        antrean verifikasi.
      </p>

      <label className="mb-1 block text-[13px] text-text-secondary">
        Pilih PBF
      </label>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          className={`${selectClass} sm:flex-1`}
          value={pbfId}
          onChange={(e) => setPbfId(e.target.value)}
        >
          <option value="">— Pilih supplier —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.inisial ? `${s.inisial} · ` : ''}
              {s.nama}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pbfId || refreshing}
          onClick={handleRefreshKandidat}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] font-semibold text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
        >
          {refreshing ? (
            <SubmitSpinner className="h-3.5 w-3.5" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 text-accent-yellow" />
          )}
          Refresh Kandidat
        </button>
      </div>

      {pbfId && (
        <p className="mb-2 text-[11px] text-text-muted">
          {cacheLabel
            ? `Kandidat terakhir dihitung: ${cacheLabel}`
            : 'Belum ada cache kandidat — klik Refresh Kandidat atau buka list (hitung on-the-fly per item).'}
          {refreshing && refreshProgress && (
            <span className="ml-1 text-state-warning">
              · refresh {refreshProgress.processed || 0}/
              {refreshProgress.total || '…'}
            </span>
          )}
        </p>
      )}

      {pbfId && !loading && (
        <p className="mb-2 text-[11px] text-text-muted">
          {totalUnmatched} kode PBF belum matching aktif · menampilkan{' '}
          {visibleItems.length} di halaman ini
        </p>
      )}

      {!pbfId ? (
        <p className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-4 text-[13px] text-text-muted">
          Pilih PBF untuk melihat item yang belum di-match.
        </p>
      ) : loading || katalogLoading ? (
        <MatchingCardSkeleton />
      ) : visibleItems.length === 0 ? (
        <p className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-4 text-[13px] text-text-muted">
          Semua kode PBF untuk supplier ini sudah matching aktif, ditandai tidak
          cocok, atau sudah diproses di sesi ini.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5">
          {visibleItems.map((row) => {
            const selected = selections[row.kode_pbf] || '';
            const busy = submittingKode === row.kode_pbf;
            return (
              <article
                key={row.kode_pbf}
                className="rounded-[4px] border border-border-subtle bg-bg-surface p-2.5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-[14px] font-bold leading-snug text-text-primary">
                      {row.nama_barang || '—'}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      {row.kode_pbf}
                      {row.satuan ? ` · ${row.satuan}` : ''}
                      {row.harga_dasar != null
                        ? ` · Rp ${formatHarga(row.harga_dasar)}`
                        : ''}
                    </p>
                  </div>
                </div>

                {row.kandidat?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {row.kandidat.map((k) => {
                      const active = selected === k.kode_obat_yelo;
                      return (
                        <button
                          key={k.kode_obat_yelo}
                          type="button"
                          onClick={() =>
                            handleSelect(row.kode_pbf, k.kode_obat_yelo)
                          }
                          className={`max-w-full truncate rounded-[4px] border px-2 py-0.5 text-[10px] font-semibold ${
                            active
                              ? 'border-accent-yellow bg-accent-yellow text-bg-base'
                              : 'border-border-subtle bg-bg-base text-text-secondary hover:bg-bg-surface-hover'
                          }`}
                          title={k.nama_obat}
                        >
                          {k.nama_obat} · {formatScore(k.skor_kemiripan)}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-2">
                  <SearchableObatSelect
                    options={katalog}
                    value={selected}
                    onChange={(kode) => handleSelect(row.kode_pbf, kode)}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !selected}
                    onClick={() => handlePilih(row)}
                    className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy && <SubmitSpinner className="h-3.5 w-3.5" />}
                    Pilih Ini
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSkip(row.kode_pbf)}
                    className="rounded-[4px] border border-border-subtle px-3 py-1.5 text-[13px] text-text-secondary hover:bg-bg-surface-hover disabled:opacity-50"
                  >
                    Tidak Ada yang Cocok
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pbfId && !loading && items.length < totalUnmatched && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => loadKandidat(pbfId, { append: true, nextOffset: offset })}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-secondary hover:bg-bg-surface-hover disabled:opacity-50"
        >
          {loadingMore && <SubmitSpinner className="h-3.5 w-3.5" />}
          Muat lagi ({items.length}/{totalUnmatched})
        </button>
      )}

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </AppShell>
  );
}
