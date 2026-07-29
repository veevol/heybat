import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { listSuppliers } from '../api/suppliers';
import {
  batalMatching,
  createMatching,
  getKatalogObat,
  getMatchingBoard,
  getRefreshKandidatStatus,
  markTidakCocok,
  refreshKandidat,
  updateMatching,
  verifikasiMatching,
} from '../api/matching';
import {
  createObatDariMatching,
  getNextKodeApp,
} from '../api/obatYelo';
import { listRef } from '../api/refData';
import AppShell from '../components/layout/AppShell';
import MatchingActionCard from '../components/MatchingActionCard';
import MatchingMatchCard from '../components/MatchingMatchCard';
import SubmitSpinner from '../components/SubmitSpinner';
import SupplierPricelistTabs from '../components/SupplierPricelistTabs';
import PricelistUploadSheet from '../components/PricelistUploadSheet';
import TambahObatDariMatchingModal from '../components/TambahObatDariMatchingModal';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { toTitleCaseNamaObat } from '../lib/obatYelo';

const EMPTY_TAMBAH_FORM = {
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

const FILTERS = [
  { id: 'all', label: 'Semua' },
  { id: 'match', label: 'Match' },
  { id: 'menunggu', label: 'Menunggu' },
  { id: 'belum', label: 'Blm Diajukan' },
  { id: 'no_match', label: 'No Match' },
];

function MatchingCardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[4px] border border-border-subtle bg-bg-surface p-2.5"
        >
          <div className="h-3.5 w-20 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-2 h-3.5 w-3/4 rounded-[4px] bg-bg-surface-hover" />
          <div className="mt-2 h-12 w-full rounded-[4px] bg-bg-surface-hover" />
        </div>
      ))}
    </div>
  );
}

function resolveObatMeta(kode, katalogMap, kandidat = []) {
  if (!kode) return null;
  const fromKat = katalogMap.get(kode);
  if (fromKat) return fromKat;
  const fromKand = kandidat.find((k) => k.kode_obat_yelo === kode);
  if (fromKand) {
    return {
      kode_obat: fromKand.kode_obat_yelo,
      nama_obat: fromKand.nama_obat,
      konversi: fromKand.konversi,
      satuan_1: fromKand.satuan_1,
      skor_kemiripan: fromKand.skor_kemiripan,
    };
  }
  return { kode_obat: kode, nama_obat: kode };
}

function boardCacheKey(pbfId, status, q, tanggalUpload = '') {
  return `${pbfId}|${status}|${q || ''}|${tanggalUpload || ''}`;
}

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

export default function MatchingPage() {
  const { hasAccess, profile } = useAuth();
  const canUsulkan = hasAccess('matching', 'usulkan');
  const canEditMatching = hasAccess('matching', 'edit');
  const canEditObat = hasAccess('data-obat-yelo', 'edit');
  const canTambahObat = hasAccess('data-obat-yelo', 'tambah');
  const canUploadPricelist = hasAccess('pricelist-pbf', 'tambah');
  const isOwner = profile?.is_owner === true;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [suppliers, setSuppliers] = useState([]);
  const [pbfId, setPbfId] = useState(() => searchParams.get('pbf_id') || '');
  const tanggalUpload = searchParams.get('tanggal_upload') || '';
  const tanggalPricelistParam = searchParams.get('tanggal_pricelist') || '';
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [katalog, setKatalog] = useState([]);
  const [cards, setCards] = useState([]);
  const [totalCards, setTotalCards] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState({
    match: 0,
    menunggu: 0,
    belum: 0,
    no_match: 0,
  });
  const [snapshot, setSnapshot] = useState(null);
  const PAGE = 40;
  const [selections, setSelections] = useState({});
  const [submittingKey, setSubmittingKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [katalogLoading, setKatalogLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState(null);
  const [toast, setToast] = useState('');
  const [tambahRow, setTambahRow] = useState(null);
  const [tambahForm, setTambahForm] = useState(EMPTY_TAMBAH_FORM);
  const [tambahRefs, setTambahRefs] = useState(EMPTY_REFS);
  const [tambahSubmitting, setTambahSubmitting] = useState(false);
  const [tambahError, setTambahError] = useState('');
  const [tambahKodeLoading, setTambahKodeLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const toastTimer = useRef(null);
  const pollTimer = useRef(null);
  const boardCacheRef = useRef(new Map());
  const loadSeqRef = useRef(0);

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

  const selectedPbf = useMemo(
    () => suppliers.find((s) => s.id === pbfId) || null,
    [suppliers, pbfId]
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const fromUrl = searchParams.get('pbf_id') || '';
    if (fromUrl) {
      setPbfId(fromUrl);
      try {
        sessionStorage.setItem('heybat_pricelist_pbf_id', fromUrl);
      } catch {
        /* ignore */
      }
    }
  }, [searchParams]);

  useEffect(() => {
    listSuppliers()
      .then((data) => {
        setSuppliers(data || []);
        const fromUrl = searchParams.get('pbf_id');
        let nextId = fromUrl || '';
        if (!nextId) {
          try {
            nextId = sessionStorage.getItem('heybat_pricelist_pbf_id') || '';
          } catch {
            nextId = '';
          }
        }
        if (nextId && data?.some((s) => s.id === nextId)) {
          setPbfId(nextId);
        } else if (!nextId && data?.length === 1) {
          setPbfId(data[0].id);
        } else if (!nextId) {
          setPbfId('');
        }
      })
      .catch((err) => showToast(err.message || 'Gagal memuat supplier'));
    getKatalogObat()
      .then((data) => setKatalog(data || []))
      .catch(() => setKatalog([]))
      .finally(() => setKatalogLoading(false));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [showToast, searchParams]);

  const applyBoardPayload = useCallback((data, { append = false, nextOffset = 0 } = {}) => {
    const pageCards = data.cards || [];
    setCards((prev) => (append ? [...prev, ...pageCards] : pageCards));
    setTotalCards(data.total || 0);
    setOffset(nextOffset + pageCards.length);
    setCounts(data.counts || { match: 0, menunggu: 0, belum: 0, no_match: 0 });
    if (!append) {
      setSnapshot(data.snapshot || null);
    }
    setSelections((prev) => {
      const next = { ...prev };
      for (const card of pageCards) {
        const key = card.pricelist?.kode_pbf;
        if (!key || next[key]) continue;
        if (card.kind === 'pending' && card.kode_obat_yelo) {
          next[key] = card.kode_obat_yelo;
          continue;
        }
        const top = [...(card.kandidat || [])].sort(
          (a, b) => (b.skor_kemiripan || 0) - (a.skor_kemiripan || 0)
        )[0];
        if (top?.kode_obat_yelo) next[key] = top.kode_obat_yelo;
      }
      return next;
    });
  }, []);

  const loadBoard = useCallback(
    async (
      id,
      { status, q, append = false, nextOffset = 0, force = false } = {}
    ) => {
      if (!id) {
        setCards([]);
        setTotalCards(0);
        setSnapshot(null);
        return;
      }
      const useStatus = status ?? statusFilter;
      const useQ = q ?? debouncedQ;
      const cacheKey = boardCacheKey(id, useStatus, useQ, tanggalUpload);
      const boardOpts = {
        status: useStatus,
        q: useQ,
        limit: PAGE,
        tanggalUpload: tanggalUpload || null,
        tanggalPricelist: tanggalPricelistParam || null,
      };

      if (!append && !force) {
        const cached = boardCacheRef.current.get(cacheKey);
        if (cached) {
          applyBoardPayload(cached, { append: false, nextOffset: 0 });
          setLoading(false);
          // Soft revalidate di background
          loadSeqRef.current += 1;
          const seq = loadSeqRef.current;
          try {
            const data = await getMatchingBoard(id, {
              ...boardOpts,
              offset: 0,
            });
            if (seq !== loadSeqRef.current) return;
            boardCacheRef.current.set(cacheKey, data);
            applyBoardPayload(data, { append: false, nextOffset: 0 });
          } catch {
            /* biarkan cache tampil */
          }
          return;
        }
        // Filter baru: jangan tampilkan card filter lain sambil menunggu
        setCards([]);
      }

      if (append) setLoadingMore(true);
      else setLoading(true);

      loadSeqRef.current += 1;
      const seq = loadSeqRef.current;
      try {
        const data = await getMatchingBoard(id, {
          ...boardOpts,
          offset: nextOffset,
        });
        if (seq !== loadSeqRef.current) return;
        if (!append) boardCacheRef.current.set(cacheKey, data);
        else {
          const prev = boardCacheRef.current.get(cacheKey);
          if (prev) {
            boardCacheRef.current.set(cacheKey, {
              ...data,
              cards: [...(prev.cards || []), ...(data.cards || [])],
            });
          }
        }
        applyBoardPayload(data, { append, nextOffset });
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        showToast(err.message || 'Gagal memuat board');
        if (!append) setCards([]);
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      statusFilter,
      debouncedQ,
      tanggalUpload,
      tanggalPricelistParam,
      showToast,
      applyBoardPayload,
    ]
  );

  useEffect(() => {
    if (!pbfId) {
      setCards([]);
      setSnapshot(null);
      return;
    }
    loadBoard(pbfId);
  }, [pbfId, statusFilter, debouncedQ, tanggalUpload, tanggalPricelistParam, loadBoard]);

  function invalidateBoardCache() {
    boardCacheRef.current.clear();
  }

  async function handleRefreshKandidat() {
    if (!pbfId || refreshing || !canEditMatching) return;
    setRefreshing(true);
    setRefreshProgress({ status: 'running', processed: 0, total: 0 });
    try {
      await refreshKandidat(pbfId);
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = setInterval(async () => {
        try {
          const st = await getRefreshKandidatStatus(pbfId);
          const job = st?.job || st;
          setRefreshProgress(job || { status: 'running' });
          if (job?.status === 'done' || job?.status === 'error' || job?.status === 'cancelled' || st?.status === 'idle') {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
            setRefreshing(false);
            invalidateBoardCache();
            await loadBoard(pbfId, { force: true });
            showToast('Kandidat diperbarui');
          }
        } catch {
          clearInterval(pollTimer.current);
          pollTimer.current = null;
          setRefreshing(false);
        }
      }, 1500);
    } catch (err) {
      setRefreshing(false);
      showToast(err.message || 'Gagal refresh kandidat');
    }
  }

  function handleEditMatch(card) {
    const kode = card?.obat?.kode_obat;
    if (!kode) return;
    navigate(`/data-obat-yelo?edit=${encodeURIComponent(kode)}`);
  }

  function handleSelect(kodePbf, kodeObat) {
    setSelections((prev) => ({ ...prev, [kodePbf]: kodeObat }));
  }

  async function handleAjukan(card) {
    const kodePbf = card.pricelist?.kode_pbf;
    const selectedKode = selections[kodePbf];
    if (!pbfId || !kodePbf || !selectedKode) return;
    setSubmittingKey(card.board_key);
    try {
      await createMatching({
        kode_obat_yelo: selectedKode,
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: kodePbf,
      });
      showToast('Diajukan — menunggu verifikasi');
      invalidateBoardCache();
      await loadBoard(pbfId, { force: true });
    } catch (err) {
      showToast(err.message || 'Gagal mengajukan');
    } finally {
      setSubmittingKey('');
    }
  }

  async function handleNoData(card) {
    const kodePbf = card.pricelist?.kode_pbf;
    if (!pbfId || !kodePbf) return;
    setSubmittingKey(card.board_key);
    try {
      await markTidakCocok({
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: kodePbf,
      });
      showToast('Ditandai No Data');
      invalidateBoardCache();
      await loadBoard(pbfId, { force: true });
    } catch (err) {
      showToast(err.message || 'Gagal menandai');
    } finally {
      setSubmittingKey('');
    }
  }

  async function handleBatalkan(card) {
    if (!card.matching_id) return;
    setSubmittingKey(card.board_key);
    try {
      await batalMatching(card.matching_id);
      showToast('Pengajuan dibatalkan');
      invalidateBoardCache();
      await loadBoard(pbfId, { force: true });
    } catch (err) {
      showToast(err.message || 'Gagal membatalkan');
    } finally {
      setSubmittingKey('');
    }
  }

  async function handleSetujui(card) {
    if (!card.matching_id || !isOwner) return;
    const kodePbf = card.pricelist?.kode_pbf;
    const selectedKode = selections[kodePbf] || card.kode_obat_yelo;
    if (!selectedKode) {
      showToast('Pilih obat Yelo dulu');
      return;
    }
    setSubmittingKey(card.board_key);
    try {
      if (selectedKode !== card.kode_obat_yelo) {
        await updateMatching(card.matching_id, {
          kode_obat_yelo: selectedKode,
        });
      }
      await verifikasiMatching(card.matching_id, 'setuju');
      showToast('Matching disetujui');
      invalidateBoardCache();
      await loadBoard(pbfId, { force: true });
    } catch (err) {
      showToast(err.message || 'Gagal menyetujui');
    } finally {
      setSubmittingKey('');
    }
  }

  async function openTambahObat(card) {
    const row = card.pricelist;
    setTambahRow(row);
    setTambahError('');
    setTambahForm({
      ...EMPTY_TAMBAH_FORM,
      nama_obat: toTitleCaseNamaObat(row?.nama_barang || ''),
    });
    setTambahKodeLoading(true);
    try {
      const [next, ...refLists] = await Promise.all([
        getNextKodeApp(),
        listRef('kandungan'),
        listRef('golongan'),
        listRef('satuan'),
        listRef('grup-substitusi'),
      ]);
      setTambahForm((prev) => ({
        ...prev,
        kode_obat: next?.kode_obat || '',
      }));
      setTambahRefs({
        kandungan: refLists[0] || [],
        golongan: refLists[1] || [],
        satuan: refLists[2] || [],
        'grup-substitusi': refLists[3] || [],
      });
    } catch (err) {
      setTambahError(err.message || 'Gagal menyiapkan form');
    } finally {
      setTambahKodeLoading(false);
    }
  }

  function closeTambahObat() {
    if (tambahSubmitting) return;
    setTambahRow(null);
    setTambahForm(EMPTY_TAMBAH_FORM);
    setTambahError('');
  }

  function handleTambahField(event) {
    const { name, value } = event.target;
    setTambahForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleTambahRefCreated(jenis, item) {
    setTambahRefs((prev) => ({
      ...prev,
      [jenis]: [...(prev[jenis] || []), item],
    }));
  }

  async function handleSimpanAjukan(e) {
    e.preventDefault();
    if (!tambahRow || !pbfId) return;
    setTambahSubmitting(true);
    setTambahError('');
    try {
      const numOrNull = (v) => {
        if (v === '' || v === null || v === undefined) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const result = await createObatDariMatching({
        kode_obat: tambahForm.kode_obat.trim(),
        nama_obat: tambahForm.nama_obat.trim(),
        kandungan_id: tambahForm.kandungan_id || null,
        golongan_id: tambahForm.golongan_id || null,
        satuan_1_id: tambahForm.satuan_1_id || null,
        satuan_2_id: tambahForm.satuan_2_id || null,
        grup_substitusi_id: tambahForm.grup_substitusi_id || null,
        konversi: numOrNull(tambahForm.konversi),
        min_jual: numOrNull(tambahForm.min_jual),
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: tambahRow.kode_pbf,
      });

      const obat = result?.obat;
      if (obat) {
        setKatalog((prev) => {
          if (prev.some((o) => o.kode_obat === obat.kode_obat)) return prev;
          return [...prev, obat].sort((a, b) =>
            String(a.nama_obat || '').localeCompare(String(b.nama_obat || ''), 'id', {
              sensitivity: 'base',
            })
          );
        });
      }

      setTambahRow(null);
      setTambahForm(EMPTY_TAMBAH_FORM);
      showToast('Obat dibuat & diajukan — menunggu verifikasi');
      invalidateBoardCache();
      await loadBoard(pbfId, { force: true });
    } catch (err) {
      setTambahError(err.message || 'Gagal menyimpan obat');
    } finally {
      setTambahSubmitting(false);
    }
  }

  return (
    <AppShell
      title="Pricelist"
      actions={
        <SupplierPricelistTabs
          active="pricelist"
          onRefreshKandidat={canEditMatching ? handleRefreshKandidat : null}
          refreshDisabled={!pbfId || !canEditMatching}
          refreshing={refreshing}
          onUploadPricelist={
            canUploadPricelist ? () => setUploadOpen(true) : null
          }
          onHistoryPricelist={() => navigate('/matching/history-pricelist')}
        />
      }
      navLoading={loading || katalogLoading || refreshing}
    >
      {pbfId ? (
        <div className="sticky top-12 z-20 -mx-3 mb-3 space-y-2 bg-bg-surface/80 px-3 pb-2 pt-1 backdrop-blur-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari nama obat..."
              className="w-full rounded-[4px] border border-border-subtle bg-bg-surface py-1.5 pl-10 pr-3 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
            />
          </div>

          {tanggalUpload ? (
            <p className="text-[11px] leading-snug text-text-muted">
              Pricelist {selectedPbf?.inisial || snapshot?.inisial || '—'} tanggal{' '}
              {formatPricelistDate(
                snapshot?.tanggal_pricelist ||
                  tanggalPricelistParam ||
                  String(tanggalUpload).slice(0, 10)
              )}
              {' · '}
              {formatNumber(snapshot?.item_count ?? 0)} item
            </p>
          ) : null}

          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {FILTERS.map((f) => {
              const active = statusFilter === f.id;
              const count =
                f.id === 'all'
                  ? counts.match + counts.menunggu + counts.belum + counts.no_match
                  : counts[f.id === 'belum' ? 'belum' : f.id === 'no_match' ? 'no_match' : f.id] ?? 0;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`flex-none whitespace-nowrap rounded-[4px] px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                    active
                      ? 'bg-accent-yellow text-bg-base'
                      : 'border border-border-subtle bg-bg-surface text-text-secondary hover:bg-bg-surface-hover'
                  }`}
                >
                  {f.label}
                  {` (${count})`}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {refreshing && refreshProgress ? (
        <p className="mb-2 text-[11px] text-state-warning">
          Refresh {refreshProgress.processed || 0}/{refreshProgress.total || '…'}
        </p>
      ) : null}

      {!pbfId ? (
        <p className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-4 text-[13px] text-text-muted">
          Buka dari card supplier (tap progress matching) untuk melihat pricelist.
        </p>
      ) : (loading || katalogLoading) && cards.length === 0 ? (
        <MatchingCardSkeleton />
      ) : cards.length === 0 ? (
        <p className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-4 text-[13px] text-text-muted">
          Tidak ada item untuk filter ini.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5">
          {cards.map((card) => {
            if (card.kind === 'match') {
              return (
                <MatchingMatchCard
                  key={card.board_key}
                  card={card}
                  inisialPbf={selectedPbf?.inisial}
                  canEditMatch={canEditObat}
                  onEditMatch={handleEditMatch}
                />
              );
            }

            const kodePbf = card.pricelist?.kode_pbf;
            const topKandidat = [...(card.kandidat || [])].sort(
              (a, b) => (b.skor_kemiripan || 0) - (a.skor_kemiripan || 0)
            )[0];
            const selectedKode =
              selections[kodePbf] ||
              (card.kind === 'pending' ? card.kode_obat_yelo : '') ||
              topKandidat?.kode_obat_yelo ||
              '';
            const selectedMeta =
              resolveObatMeta(selectedKode, katalogMap, card.kandidat) ||
              (card.selected_obat
                ? {
                    ...card.selected_obat,
                    kode_obat: card.selected_obat.kode_obat || card.kode_obat_yelo,
                  }
                : null);

            return (
              <MatchingActionCard
                key={card.board_key}
                card={card}
                inisialPbf={selectedPbf?.inisial}
                katalog={katalog}
                selectedKode={selectedKode}
                selectedMeta={selectedMeta}
                onSelect={(kode) => handleSelect(kodePbf, kode)}
                onAjukan={() => handleAjukan(card)}
                onNoData={() => handleNoData(card)}
                onTambahObat={() => openTambahObat(card)}
                onBatalkan={() => handleBatalkan(card)}
                onSetujui={() => handleSetujui(card)}
                busy={submittingKey === card.board_key}
                canUsulkan={canUsulkan}
                canTambahObat={canTambahObat}
                isOwner={isOwner}
              />
            );
          })}
        </div>
      )}

      {pbfId && !loading && cards.length < totalCards ? (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => loadBoard(pbfId, { append: true, nextOffset: offset })}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-secondary hover:bg-bg-surface-hover disabled:opacity-50"
        >
          {loadingMore && <SubmitSpinner className="h-3.5 w-3.5" />}
          Muat lagi ({cards.length}/{totalCards})
        </button>
      ) : null}

      {tambahRow ? (
        <TambahObatDariMatchingModal
          pricelistRow={tambahRow}
          values={tambahForm}
          onChange={handleTambahField}
          onField={(name, value) =>
            setTambahForm((prev) => ({ ...prev, [name]: value }))
          }
          refs={tambahRefs}
          onRefCreated={handleTambahRefCreated}
          submitting={tambahSubmitting}
          error={tambahError}
          onClose={closeTambahObat}
          onSubmit={handleSimpanAjukan}
          kodeLoading={tambahKodeLoading}
        />
      ) : null}

      <PricelistUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        suppliers={suppliers}
        initialPbfId={pbfId}
        onToast={showToast}
        onSuccess={({ pbfId: uploadedPbfId }) => {
          if (uploadedPbfId) {
            setPbfId(uploadedPbfId);
            try {
              sessionStorage.setItem('heybat_pricelist_pbf_id', uploadedPbfId);
            } catch {
              /* ignore */
            }
            navigate(
              `/matching?pbf_id=${encodeURIComponent(uploadedPbfId)}`,
              { replace: true }
            );
          }
          invalidateBoardCache();
          if (uploadedPbfId) loadBoard(uploadedPbfId, { force: true });
        }}
      />

      {toast ? <Toast message={toast} onClose={() => setToast('')} /> : null}
    </AppShell>
  );
}
