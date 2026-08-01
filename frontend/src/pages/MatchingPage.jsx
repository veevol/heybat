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
  { id: 'ditolak', label: 'Ditolak' },
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

function boardCacheKey(pbfId, status, q, tanggalUpload = '', oleh = '') {
  return `${pbfId}|${status}|${q || ''}|${tanggalUpload || ''}|${oleh || ''}`;
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

/**
 * Bangun / lengkapi card Match dari response verifikasi (sumber kebenaran status)
 * + baris pricelist yang sudah ada di card Menunggu (bukan data fiktif).
 */
function buildPricelistRowFromSetujui(pendingCard, verified, fallbackInisial) {
  const pl = pendingCard?.pricelist || {};
  return {
    matching_id: verified.id,
    pricelist_pbf_id: verified.pricelist_pbf_id,
    pricelist_kode_pbf: verified.pricelist_kode_pbf,
    inisial: verified.supplier?.inisial || fallbackInisial || null,
    nama_barang: pl.nama_barang || verified.pricelist_kode_pbf,
    satuan: pl.satuan || null,
    qty: pl.qty ?? null,
    harga_dasar: pl.harga_dasar ?? null,
    catatan_kondisi: pl.catatan_kondisi ?? null,
    diskon: pl.diskon || null,
  };
}

function buildMatchCardFromSetujui(pendingCard, verified, fallbackInisial) {
  const kodeYelo = verified.kode_obat_yelo;
  const obatFromServer = verified.obat || {
    kode_obat: kodeYelo,
    nama_obat: kodeYelo,
  };
  return {
    kind: 'match',
    board_key: `match:${kodeYelo}`,
    status: verified.status,
    obat: {
      ...obatFromServer,
      golongan: obatFromServer.golongan || null,
      harga_1: obatFromServer.harga_1 ?? null,
      harga_3: obatFromServer.harga_3 ?? null,
    },
    pricelist_rows: [buildPricelistRowFromSetujui(pendingCard, verified, fallbackInisial)],
  };
}

function mergeMatchCard(existing, verified, newRow) {
  const rows = [...(existing.pricelist_rows || [])];
  if (!rows.some((r) => r.matching_id === verified.id)) {
    rows.push(newRow);
  }
  const obatFromServer = verified.obat || existing.obat || {};
  return {
    ...existing,
    status: verified.status,
    obat: {
      ...obatFromServer,
      golongan: obatFromServer.golongan || existing.obat?.golongan || null,
      // Pertahankan HJ stok yang sudah ada di card Match (response verifikasi tidak kirim harga stok)
      harga_1: existing.obat?.harga_1 ?? obatFromServer.harga_1 ?? null,
      harga_3: existing.obat?.harga_3 ?? obatFromServer.harga_3 ?? null,
    },
    pricelist_rows: rows,
  };
}

function insertMatchCardSorted(cards, matchCard) {
  const name = matchCard.obat?.nama_obat || '';
  const insertAt = cards.findIndex((c) => {
    if (c.kind !== 'match') return true;
    return (
      String(c.obat?.nama_obat || '').localeCompare(name, 'id', {
        sensitivity: 'base',
      }) > 0
    );
  });
  if (insertAt < 0) return [...cards, matchCard];
  return [...cards.slice(0, insertAt), matchCard, ...cards.slice(insertAt)];
}

function kodePbfOf(card) {
  return card?.pricelist?.kode_pbf || null;
}

function indexByKodePbf(cards, kodePbf) {
  if (!kodePbf) return -1;
  return cards.findIndex((c) => c.pricelist?.kode_pbf === kodePbf);
}

function applyCountDeltas(counts, deltas) {
  const next = { ...counts };
  for (const key of ['match', 'menunggu', 'belum', 'no_match', 'ditolak']) {
    if (!deltas[key]) continue;
    next[key] = Math.max(0, (Number(next[key]) || 0) + deltas[key]);
  }
  return next;
}

function buildPendingCard(sourceCard, matching, selectedObat) {
  const kodePbf = kodePbfOf(sourceCard);
  return {
    kind: 'pending',
    board_key: `pending:${kodePbf}`,
    status: matching.status || 'menunggu_verifikasi',
    matching_id: matching.id,
    dipilih_oleh: matching.dipilih_oleh || null,
    diusulkan_oleh: matching.diusulkan_oleh || null,
    pricelist: sourceCard.pricelist,
    selected_obat: matching.obat || selectedObat || null,
    kode_obat_yelo: matching.kode_obat_yelo || selectedObat?.kode_obat || null,
    kandidat: sourceCard.kandidat || [],
  };
}

function buildRejectedCard(sourceCard, matching) {
  const kodePbf = kodePbfOf(sourceCard);
  const hasYelo = Boolean(matching?.kode_obat_yelo);
  return {
    kind: hasYelo ? 'ditolak' : 'rejected',
    board_key: hasYelo ? `ditolak:${kodePbf}` : `rejected:${kodePbf}`,
    status: 'ditolak',
    matching_id: matching.id,
    dipilih_oleh: matching.dipilih_oleh || null,
    diusulkan_oleh: matching.diusulkan_oleh || null,
    pricelist: sourceCard.pricelist,
    selected_obat: matching.obat || sourceCard.selected_obat || null,
    kode_obat_yelo: matching.kode_obat_yelo || null,
    kandidat: sourceCard.kandidat || [],
  };
}

function buildUnmatchedCard(sourceCard) {
  const kodePbf = kodePbfOf(sourceCard);
  return {
    kind: 'unmatched',
    board_key: `unmatched:${kodePbf}`,
    status: 'belum',
    matching_id: null,
    dipilih_oleh: null,
    diusulkan_oleh: null,
    pricelist: sourceCard.pricelist,
    selected_obat: null,
    kode_obat_yelo: null,
    kandidat: sourceCard.kandidat || [],
  };
}

/** Patch cache entry pagination after drop/keep card in that filter's list. */
function cacheAfterCardChange(data, nextCards, { dropped }) {
  let total = Number(data.total_count ?? data.total) || 0;
  if (dropped) total = Math.max(0, total - 1);
  return {
    ...data,
    cards: nextCards,
    total,
    total_count: total,
    has_more: nextCards.length < total,
  };
}

export default function MatchingPage() {
  const { hasAccess, profile } = useAuth();
  const canUsulkan = hasAccess('matching', 'usulkan');
  const canEditMatching = hasAccess('matching', 'edit');
  const canEditObat = hasAccess('data-obat-yelo', 'edit');
  const canTambahObat = hasAccess('data-obat-yelo', 'tambah');
  const canUploadPricelist = hasAccess('pricelist-pbf', 'tambah');
  const isOwner = profile?.is_owner === true;
  /** FO: tombol + Data Obat hanya di card No Match (kind rejected). */
  const isFoGroup = !isOwner && profile?.group?.nama === 'FO';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [suppliers, setSuppliers] = useState([]);
  const [pbfId, setPbfId] = useState(() => searchParams.get('pbf_id') || '');
  const tanggalUpload = searchParams.get('tanggal_upload') || '';
  const tanggalPricelistParam = searchParams.get('tanggal_pricelist') || '';
  const olehFilter = (searchParams.get('oleh') || '').trim();
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [katalog, setKatalog] = useState([]);
  const [cards, setCards] = useState([]);
  const [totalCards, setTotalCards] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [counts, setCounts] = useState({
    match: 0,
    menunggu: 0,
    belum: 0,
    no_match: 0,
    ditolak: 0,
  });
  const [snapshot, setSnapshot] = useState(null);
  const PAGE = 40;
  const [selections, setSelections] = useState({});
  /** Board keys yang sedang submit — Set agar Setujui beruntun tidak saling blokir. */
  const [submittingKeys, setSubmittingKeys] = useState(() => new Set());
  const submittingKeysRef = useRef(new Set());
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
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
  /** Kode Yelo yang sudah pernah terlihat sebagai Match (untuk counter unik + race Setujui). */
  const matchedYeloCodesRef = useRef(new Set());
  const statusFilterRef = useRef(statusFilter);
  statusFilterRef.current = statusFilter;

  function markSubmitting(boardKey, on) {
    if (on) submittingKeysRef.current.add(boardKey);
    else submittingKeysRef.current.delete(boardKey);
    setSubmittingKeys(new Set(submittingKeysRef.current));
  }

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
    if (query.trim() !== debouncedQ) setSearchLoading(true);
    const t = setTimeout(() => setDebouncedQ(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query, debouncedQ]);

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
    if (olehFilter) {
      setStatusFilter('all');
      boardCacheRef.current.clear();
    }
  }, [olehFilter]);

  function clearOlehFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete('oleh');
    setSearchParams(next, { replace: true });
    boardCacheRef.current.clear();
  }

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
    // Katalog tidak memblokir board — diload di background
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
    for (const card of pageCards) {
      if (card.kind === 'match' && card.obat?.kode_obat) {
        matchedYeloCodesRef.current.add(card.obat.kode_obat);
      }
    }
    setCards((prev) => (append ? [...prev, ...pageCards] : pageCards));
    const total = Number(data.total_count ?? data.total) || 0;
    setTotalCards(total);
    const loaded = nextOffset + pageCards.length;
    setOffset(loaded);
    setHasMore(
      typeof data.has_more === 'boolean' ? data.has_more : loaded < total
    );
    setCounts(data.counts || { match: 0, menunggu: 0, belum: 0, no_match: 0, ditolak: 0 });
    if (!append) {
      setSnapshot(data.snapshot || null);
    }
    setSelections((prev) => {
      const next = { ...prev };
      for (const card of pageCards) {
        const key = card.pricelist?.kode_pbf;
        if (!key) continue;
        // Pending: selalu sync dari matching server (jangan biarkan selection stale dari Belum/No Match).
        if (card.kind === 'pending' && card.kode_obat_yelo) {
          next[key] = card.kode_obat_yelo;
          continue;
        }
        if (next[key]) continue;
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
        setHasMore(false);
        setSnapshot(null);
        return;
      }
      const useStatus = status ?? statusFilter;
      const useQ = q ?? debouncedQ;
      const cacheKey = boardCacheKey(
        id,
        useStatus,
        useQ,
        tanggalUpload,
        olehFilter
      );
      const boardOpts = {
        status: useStatus,
        q: useQ,
        search: useQ,
        limit: PAGE,
        tanggalUpload: tanggalUpload || null,
        tanggalPricelist: tanggalPricelistParam || null,
        oleh: olehFilter || null,
      };

      // Ganti filter/search: fetch page 1 dari server (bukan filter di memori)
      if (!append && !force) {
        const cached = boardCacheRef.current.get(cacheKey);
        if (cached) {
          applyBoardPayload(cached, { append: false, nextOffset: 0 });
          setLoading(false);
          setSearchLoading(false);
          return;
        }
        setCards([]);
        setHasMore(false);
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
              has_more: data.has_more,
              total_count: data.total_count ?? data.total,
              total: data.total_count ?? data.total,
            });
          }
        }
        applyBoardPayload(data, { append, nextOffset });
      } catch (err) {
        if (seq !== loadSeqRef.current) return;
        showToast(err.message || 'Gagal memuat board');
        if (!append) {
          setCards([]);
          setHasMore(false);
        }
      } finally {
        if (seq === loadSeqRef.current) {
          setLoading(false);
          setLoadingMore(false);
          setSearchLoading(false);
        }
      }
    },
    [
      statusFilter,
      debouncedQ,
      tanggalUpload,
      tanggalPricelistParam,
      olehFilter,
      showToast,
      applyBoardPayload,
    ]
  );

  useEffect(() => {
    matchedYeloCodesRef.current = new Set();
  }, [pbfId]);

  useEffect(() => {
    if (!pbfId) {
      setCards([]);
      setSnapshot(null);
      return;
    }
    loadBoard(pbfId);
  }, [
    pbfId,
    statusFilter,
    debouncedQ,
    tanggalUpload,
    tanggalPricelistParam,
    olehFilter,
    loadBoard,
  ]);

  function invalidateBoardCache() {
    boardCacheRef.current.clear();
  }

  /**
   * Setelah Setujui sukses: patch state + cache lokal saja (tanpa GET /board).
   * Dipanggil hanya setelah response server status=terverifikasi.
   */
  function applyLocalSetujuiSuccess(pendingCard, verified) {
    const kodeYelo = verified?.kode_obat_yelo;
    if (!kodeYelo || verified.status !== 'terverifikasi') return false;

    const matchKey = `match:${kodeYelo}`;
    const alreadyMatched = matchedYeloCodesRef.current.has(kodeYelo);
    // Klaim sinkron sebelum setState — aman untuk Setujui beruntun
    matchedYeloCodesRef.current.add(kodeYelo);

    const fallbackInisial = selectedPbf?.inisial || null;
    const newRow = buildPricelistRowFromSetujui(pendingCard, verified, fallbackInisial);
    const freshMatchCard = buildMatchCardFromSetujui(
      pendingCard,
      verified,
      fallbackInisial
    );
    const pendingKey = pendingCard.board_key;
    const filter = statusFilterRef.current;

    setCounts((prev) => ({
      ...prev,
      menunggu: Math.max(0, (Number(prev.menunggu) || 0) - 1),
      match: alreadyMatched
        ? Number(prev.match) || 0
        : (Number(prev.match) || 0) + 1,
    }));

    let nextTotal;
    const prevTotal = Number(totalCards) || 0;
    if (filter === 'menunggu') nextTotal = Math.max(0, prevTotal - 1);
    else if (filter === 'match') nextTotal = alreadyMatched ? prevTotal : prevTotal + 1;
    else if (filter === 'all') {
      nextTotal = alreadyMatched ? Math.max(0, prevTotal - 1) : prevTotal;
    } else nextTotal = Math.max(0, prevTotal - 1);

    const dropFromList =
      filter === 'menunggu' ||
      filter === 'belum' ||
      filter === 'no_match' ||
      filter === 'ditolak';
    const nextOffset = Math.max(0, (Number(offset) || 0) - (dropFromList ? 1 : 0));

    setCards((prev) => {
      const withoutPending = prev.filter(
        (c) => c.board_key !== pendingKey && c.matching_id !== verified.id
      );

      if (dropFromList) return withoutPending;

      const idx = withoutPending.findIndex((c) => c.board_key === matchKey);
      if (idx >= 0) {
        const next = [...withoutPending];
        next[idx] = mergeMatchCard(withoutPending[idx], verified, newRow);
        return next;
      }

      if (filter === 'match' || filter === 'all') {
        return insertMatchCardSorted(withoutPending, freshMatchCard);
      }
      return withoutPending;
    });
    setTotalCards(nextTotal);
    setOffset(nextOffset);
    setHasMore(nextOffset < nextTotal);

    // Patch semua cache board PBF ini supaya ganti filter tidak mengembalikan card lama
    for (const [key, data] of [...boardCacheRef.current.entries()]) {
      if (!key.startsWith(`${pbfId}|`)) continue;
      const status = key.split('|')[1];
      const prevCards = data.cards || [];
      let nextCards = prevCards.filter(
        (c) => c.board_key !== pendingKey && c.matching_id !== verified.id
      );
      let total = Number(data.total_count ?? data.total) || 0;
      const hadPending = prevCards.some((c) => c.board_key === pendingKey);

      if (status === 'menunggu') {
        if (hadPending) total = Math.max(0, total - 1);
      } else if (status === 'match' || status === 'all') {
        const idx = nextCards.findIndex((c) => c.board_key === matchKey);
        if (idx >= 0) {
          nextCards = [...nextCards];
          nextCards[idx] = mergeMatchCard(nextCards[idx], verified, newRow);
          if (status === 'all' && hadPending) {
            total = Math.max(0, total - 1);
          }
        } else {
          nextCards = insertMatchCardSorted(nextCards, freshMatchCard);
          if (status === 'match' && !alreadyMatched) {
            total += 1;
          } else if (status === 'all' && hadPending) {
            total = alreadyMatched ? Math.max(0, total - 1) : total;
          }
        }
      }

      boardCacheRef.current.set(key, {
        ...data,
        cards: nextCards,
        total,
        total_count: total,
        has_more: nextCards.length < total,
        counts: {
          ...(data.counts || {}),
          menunggu: Math.max(0, (Number(data.counts?.menunggu) || 0) - 1),
          match: alreadyMatched
            ? Number(data.counts?.match) || 0
            : (Number(data.counts?.match) || 0) + 1,
        },
      });
    }

    const kodePbf = pendingCard.pricelist?.kode_pbf;
    if (kodePbf) {
      setSelections((prev) => {
        if (!prev[kodePbf]) return prev;
        const next = { ...prev };
        delete next[kodePbf];
        return next;
      });
    }

    return true;
  }

  /**
   * Ajukan sukses: unmatched/rejected → pending (tanpa GET /board).
   * Aman untuk card dari load-more (cari by kode_pbf di list yang sudah di-load).
   */
  function applyLocalAjukanSuccess(sourceCard, matching, selectedObat) {
    if (!matching?.id || matching.status !== 'menunggu_verifikasi') return false;
    const kodePbf = kodePbfOf(sourceCard);
    if (!kodePbf) return false;

    const pendingCard = buildPendingCard(sourceCard, matching, selectedObat);
    const selectedKode =
      matching.kode_obat_yelo || selectedObat?.kode_obat || null;
    if (selectedKode) {
      setSelections((prev) => ({ ...prev, [kodePbf]: selectedKode }));
    }
    const fromRejected = sourceCard.kind === 'rejected';
    const fromDitolak = sourceCard.kind === 'ditolak';
    const deltas = fromRejected
      ? { no_match: -1, menunggu: 1 }
      : fromDitolak
        ? { ditolak: -1, menunggu: 1 }
        : { belum: -1, menunggu: 1 };
    const filter = statusFilterRef.current;
    const dropFromList =
      filter === 'belum' || filter === 'no_match' || filter === 'ditolak';

    setCounts((prev) => applyCountDeltas(prev, deltas));

    setCards((prev) => {
      if (dropFromList) {
        return prev.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
      }
      if (filter === 'all' || filter === 'menunggu') {
        const idx = indexByKodePbf(prev, kodePbf);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = pendingCard;
          return next;
        }
        if (filter === 'menunggu') return [pendingCard, ...prev];
      }
      return prev.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
    });

    if (dropFromList) {
      const nextTotal = Math.max(0, (Number(totalCards) || 0) - 1);
      const nextOffset = Math.max(0, (Number(offset) || 0) - 1);
      setTotalCards(nextTotal);
      setOffset(nextOffset);
      setHasMore(nextOffset < nextTotal);
    } else if (filter === 'menunggu') {
      // Card baru masuk list menunggu (jarang — biasanya ajukan dari belum/all)
      const had = cards.some((c) => c.pricelist?.kode_pbf === kodePbf);
      if (!had) {
        const nextTotal = (Number(totalCards) || 0) + 1;
        const nextOffset = (Number(offset) || 0) + 1;
        setTotalCards(nextTotal);
        setOffset(nextOffset);
        setHasMore(nextOffset < nextTotal);
      }
    }

    for (const [key, data] of [...boardCacheRef.current.entries()]) {
      if (!key.startsWith(`${pbfId}|`)) continue;
      const status = key.split('|')[1];
      const prevCards = data.cards || [];
      const idx = indexByKodePbf(prevCards, kodePbf);
      const nextCounts = applyCountDeltas(data.counts || {}, deltas);

      if (status === 'belum' || status === 'no_match' || status === 'ditolak') {
        if (idx < 0) {
          boardCacheRef.current.set(key, { ...data, counts: nextCounts });
          continue;
        }
        const nextCards = prevCards.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
        boardCacheRef.current.set(key, {
          ...cacheAfterCardChange(data, nextCards, { dropped: true }),
          counts: nextCounts,
        });
      } else if (status === 'menunggu') {
        let nextCards;
        let dropped = false;
        if (idx >= 0) {
          nextCards = [...prevCards];
          nextCards[idx] = pendingCard;
        } else {
          nextCards = [pendingCard, ...prevCards];
          dropped = false;
          const total = (Number(data.total_count ?? data.total) || 0) + 1;
          boardCacheRef.current.set(key, {
            ...data,
            cards: nextCards,
            total,
            total_count: total,
            has_more: nextCards.length < total,
            counts: nextCounts,
          });
          continue;
        }
        boardCacheRef.current.set(key, {
          ...cacheAfterCardChange(data, nextCards, { dropped }),
          counts: nextCounts,
        });
      } else if (status === 'all') {
        let nextCards = prevCards;
        if (idx >= 0) {
          nextCards = [...prevCards];
          nextCards[idx] = pendingCard;
        }
        boardCacheRef.current.set(key, {
          ...data,
          cards: nextCards,
          counts: nextCounts,
        });
      } else {
        boardCacheRef.current.set(key, { ...data, counts: nextCounts });
      }
    }

    return true;
  }

  /** No Data sukses: unmatched → rejected (atau noop jika sudah rejected). */
  function applyLocalNoDataSuccess(sourceCard, matching) {
    if (!matching?.id || matching.status !== 'ditolak') return false;
    const kodePbf = kodePbfOf(sourceCard);
    if (!kodePbf) return false;

    const alreadyRejected = sourceCard.kind === 'rejected';
    const rejectedCard = buildRejectedCard(sourceCard, matching);
    const deltas = alreadyRejected ? {} : { belum: -1, no_match: 1 };
    const filter = statusFilterRef.current;
    const dropFromList = filter === 'belum';

    if (!alreadyRejected) {
      setCounts((prev) => applyCountDeltas(prev, deltas));
    }

    setCards((prev) => {
      if (dropFromList) {
        return prev.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
      }
      if (filter === 'all' || filter === 'no_match') {
        const idx = indexByKodePbf(prev, kodePbf);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = rejectedCard;
          return next;
        }
        if (filter === 'no_match' && !alreadyRejected) {
          return [rejectedCard, ...prev];
        }
      }
      return prev;
    });

    if (dropFromList) {
      const nextTotal = Math.max(0, (Number(totalCards) || 0) - 1);
      const nextOffset = Math.max(0, (Number(offset) || 0) - 1);
      setTotalCards(nextTotal);
      setOffset(nextOffset);
      setHasMore(nextOffset < nextTotal);
    } else if (filter === 'no_match' && !alreadyRejected) {
      const had = cards.some((c) => c.pricelist?.kode_pbf === kodePbf);
      if (!had) {
        const nextTotal = (Number(totalCards) || 0) + 1;
        const nextOffset = (Number(offset) || 0) + 1;
        setTotalCards(nextTotal);
        setOffset(nextOffset);
        setHasMore(nextOffset < nextTotal);
      }
    }

    for (const [key, data] of [...boardCacheRef.current.entries()]) {
      if (!key.startsWith(`${pbfId}|`)) continue;
      const status = key.split('|')[1];
      const prevCards = data.cards || [];
      const idx = indexByKodePbf(prevCards, kodePbf);
      const nextCounts = alreadyRejected
        ? data.counts || {}
        : applyCountDeltas(data.counts || {}, deltas);

      if (status === 'belum') {
        if (idx < 0) {
          boardCacheRef.current.set(key, { ...data, counts: nextCounts });
          continue;
        }
        const nextCards = prevCards.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
        boardCacheRef.current.set(key, {
          ...cacheAfterCardChange(data, nextCards, { dropped: true }),
          counts: nextCounts,
        });
      } else if (status === 'no_match') {
        if (idx >= 0) {
          const nextCards = [...prevCards];
          nextCards[idx] = rejectedCard;
          boardCacheRef.current.set(key, {
            ...data,
            cards: nextCards,
            counts: nextCounts,
          });
        } else if (!alreadyRejected) {
          const nextCards = [rejectedCard, ...prevCards];
          const total = (Number(data.total_count ?? data.total) || 0) + 1;
          boardCacheRef.current.set(key, {
            ...data,
            cards: nextCards,
            total,
            total_count: total,
            has_more: nextCards.length < total,
            counts: nextCounts,
          });
        } else {
          boardCacheRef.current.set(key, { ...data, counts: nextCounts });
        }
      } else if (status === 'all') {
        if (idx >= 0) {
          const nextCards = [...prevCards];
          nextCards[idx] = rejectedCard;
          boardCacheRef.current.set(key, {
            ...data,
            cards: nextCards,
            counts: nextCounts,
          });
        } else {
          boardCacheRef.current.set(key, { ...data, counts: nextCounts });
        }
      } else {
        boardCacheRef.current.set(key, { ...data, counts: nextCounts });
      }
    }

    return true;
  }

  /** Owner tolak: pending → rejected (board No Match); progress = ditolak (punya kode Yelo). */
  function applyLocalTolakSuccess(pendingCard, matching) {
    if (!matching?.id || matching.status !== 'ditolak') return false;
    const kodePbf = kodePbfOf(pendingCard);
    if (!kodePbf || pendingCard.kind !== 'pending') return false;

    const rejectedCard = buildRejectedCard(pendingCard, matching);
    const deltas = { menunggu: -1, ditolak: 1 };
    const filter = statusFilterRef.current;
    const dropFromList = filter === 'menunggu';

    setCounts((prev) => applyCountDeltas(prev, deltas));

    setCards((prev) => {
      if (dropFromList) {
        return prev.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
      }
      if (filter === 'all' || filter === 'ditolak') {
        const idx = indexByKodePbf(prev, kodePbf);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = rejectedCard;
          return next;
        }
        if (filter === 'ditolak') {
          return [rejectedCard, ...prev];
        }
      }
      return prev.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
    });

    if (dropFromList) {
      const nextTotal = Math.max(0, (Number(totalCards) || 0) - 1);
      const nextOffset = Math.max(0, (Number(offset) || 0) - 1);
      setTotalCards(nextTotal);
      setOffset(nextOffset);
      setHasMore(nextOffset < nextTotal);
    } else if (filter === 'ditolak') {
      const had = cards.some((c) => c.pricelist?.kode_pbf === kodePbf);
      if (!had) {
        const nextTotal = (Number(totalCards) || 0) + 1;
        const nextOffset = (Number(offset) || 0) + 1;
        setTotalCards(nextTotal);
        setOffset(nextOffset);
        setHasMore(nextOffset < nextTotal);
      }
    }

    for (const [key, data] of [...boardCacheRef.current.entries()]) {
      if (!key.startsWith(`${pbfId}|`)) continue;
      const status = key.split('|')[1];
      const prevCards = data.cards || [];
      const idx = indexByKodePbf(prevCards, kodePbf);
      const nextCounts = applyCountDeltas(data.counts || {}, deltas);

      if (status === 'menunggu') {
        if (idx < 0) {
          boardCacheRef.current.set(key, { ...data, counts: nextCounts });
          continue;
        }
        const nextCards = prevCards.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
        boardCacheRef.current.set(key, {
          ...cacheAfterCardChange(data, nextCards, { dropped: true }),
          counts: nextCounts,
        });
      } else if (status === 'ditolak') {
        if (idx >= 0) {
          const nextCards = [...prevCards];
          nextCards[idx] = rejectedCard;
          boardCacheRef.current.set(key, {
            ...data,
            cards: nextCards,
            counts: nextCounts,
          });
        } else {
          const nextCards = [rejectedCard, ...prevCards];
          const total = (Number(data.total_count ?? data.total) || 0) + 1;
          boardCacheRef.current.set(key, {
            ...data,
            cards: nextCards,
            total,
            total_count: total,
            has_more: nextCards.length < total,
            counts: nextCounts,
          });
        }
      } else if (status === 'all') {
        if (idx >= 0) {
          const nextCards = [...prevCards];
          nextCards[idx] = rejectedCard;
          boardCacheRef.current.set(key, {
            ...data,
            cards: nextCards,
            counts: nextCounts,
          });
        } else {
          boardCacheRef.current.set(key, { ...data, counts: nextCounts });
        }
      } else {
        boardCacheRef.current.set(key, { ...data, counts: nextCounts });
      }
    }

    return true;
  }

  /** Batalkan sukses: pending → unmatched (DELETE 204 tidak kirim body). */
  function applyLocalBatalkanSuccess(pendingCard) {
    const kodePbf = kodePbfOf(pendingCard);
    if (!kodePbf || pendingCard.kind !== 'pending') return false;

    const unmatchedCard = buildUnmatchedCard(pendingCard);
    const deltas = { menunggu: -1, belum: 1 };
    const filter = statusFilterRef.current;
    const dropFromList = filter === 'menunggu';

    setCounts((prev) => applyCountDeltas(prev, deltas));

    setCards((prev) => {
      if (dropFromList) {
        return prev.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
      }
      if (filter === 'all') {
        const idx = indexByKodePbf(prev, kodePbf);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = unmatchedCard;
          return next;
        }
      }
      if (filter === 'belum') {
        const idx = indexByKodePbf(prev, kodePbf);
        if (idx >= 0) return prev;
        return [unmatchedCard, ...prev];
      }
      return prev.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
    });

    if (dropFromList) {
      const nextTotal = Math.max(0, (Number(totalCards) || 0) - 1);
      const nextOffset = Math.max(0, (Number(offset) || 0) - 1);
      setTotalCards(nextTotal);
      setOffset(nextOffset);
      setHasMore(nextOffset < nextTotal);
    } else if (filter === 'belum') {
      const had = cards.some((c) => c.pricelist?.kode_pbf === kodePbf);
      if (!had) {
        const nextTotal = (Number(totalCards) || 0) + 1;
        const nextOffset = (Number(offset) || 0) + 1;
        setTotalCards(nextTotal);
        setOffset(nextOffset);
        setHasMore(nextOffset < nextTotal);
      }
    }

    for (const [key, data] of [...boardCacheRef.current.entries()]) {
      if (!key.startsWith(`${pbfId}|`)) continue;
      const status = key.split('|')[1];
      const prevCards = data.cards || [];
      const idx = indexByKodePbf(prevCards, kodePbf);
      const nextCounts = applyCountDeltas(data.counts || {}, deltas);

      if (status === 'menunggu') {
        if (idx < 0) {
          boardCacheRef.current.set(key, { ...data, counts: nextCounts });
          continue;
        }
        const nextCards = prevCards.filter((c) => c.pricelist?.kode_pbf !== kodePbf);
        boardCacheRef.current.set(key, {
          ...cacheAfterCardChange(data, nextCards, { dropped: true }),
          counts: nextCounts,
        });
      } else if (status === 'belum') {
        if (idx >= 0) {
          boardCacheRef.current.set(key, { ...data, counts: nextCounts });
        } else {
          const nextCards = [unmatchedCard, ...prevCards];
          const total = (Number(data.total_count ?? data.total) || 0) + 1;
          boardCacheRef.current.set(key, {
            ...data,
            cards: nextCards,
            total,
            total_count: total,
            has_more: nextCards.length < total,
            counts: nextCounts,
          });
        }
      } else if (status === 'all') {
        if (idx >= 0) {
          const nextCards = [...prevCards];
          nextCards[idx] = unmatchedCard;
          boardCacheRef.current.set(key, {
            ...data,
            cards: nextCards,
            counts: nextCounts,
          });
        } else {
          boardCacheRef.current.set(key, { ...data, counts: nextCounts });
        }
      } else {
        boardCacheRef.current.set(key, { ...data, counts: nextCounts });
      }
    }

    return true;
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
          if (
            job?.status === 'done' ||
            job?.status === 'error' ||
            job?.status === 'cancelled' ||
            st?.status === 'idle'
          ) {
            clearInterval(pollTimer.current);
            pollTimer.current = null;
            setRefreshing(false);
            // Kandidat dihitung ulang di server — reload HANYA halaman filter aktif
            // (sudah paginated; bukan load-all seperti dulu).
            invalidateBoardCache();
            if (job?.status === 'done' || st?.status === 'idle') {
              await loadBoard(pbfId, { force: true });
              showToast('Kandidat diperbarui');
            } else {
              showToast(
                job?.status === 'cancelled'
                  ? 'Refresh dibatalkan'
                  : 'Refresh kandidat gagal'
              );
            }
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

  /** Dropdown: state lokal saja — tidak hit API / tidak refetch board. */
  function handleSelect(kodePbf, kodeObat) {
    setSelections((prev) => ({ ...prev, [kodePbf]: kodeObat }));
  }

  async function handleAjukan(card) {
    const kodePbf = card.pricelist?.kode_pbf;
    const selectedKode = selections[kodePbf];
    if (!pbfId || !kodePbf || !selectedKode) return;
    if (submittingKeysRef.current.has(card.board_key)) return;
    markSubmitting(card.board_key, true);
    try {
      const created = await createMatching({
        kode_obat_yelo: selectedKode,
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: kodePbf,
      });
      if (!created?.id || created.status !== 'menunggu_verifikasi') {
        showToast(
          created?.status
            ? `Status server: ${created.status} — board tidak diubah`
            : 'Respons Ajukan tidak valid'
        );
        return;
      }
      const selectedObat = resolveObatMeta(
        selectedKode,
        katalogMap,
        card.kandidat
      );
      applyLocalAjukanSuccess(card, created, selectedObat);
      showToast('Diajukan — menunggu verifikasi');
    } catch (err) {
      showToast(err.message || 'Gagal mengajukan');
    } finally {
      markSubmitting(card.board_key, false);
    }
  }

  async function handleNoData(card) {
    const kodePbf = card.pricelist?.kode_pbf;
    if (!pbfId || !kodePbf) return;
    if (submittingKeysRef.current.has(card.board_key)) return;
    markSubmitting(card.board_key, true);
    try {
      const marked = await markTidakCocok({
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: kodePbf,
      });
      if (!marked?.id || marked.status !== 'ditolak') {
        showToast(
          marked?.status
            ? `Status server: ${marked.status} — board tidak diubah`
            : 'Respons No Data tidak valid'
        );
        return;
      }
      applyLocalNoDataSuccess(card, marked);
      showToast('Ditandai No Data');
    } catch (err) {
      showToast(err.message || 'Gagal menandai');
    } finally {
      markSubmitting(card.board_key, false);
    }
  }

  async function handleBatalkan(card) {
    if (!card.matching_id) return;
    if (submittingKeysRef.current.has(card.board_key)) return;
    markSubmitting(card.board_key, true);
    try {
      await batalMatching(card.matching_id);
      // 204 → parseResponse null; sukses = tidak throw
      applyLocalBatalkanSuccess(card);
      showToast('Pengajuan dibatalkan');
    } catch (err) {
      showToast(err.message || 'Gagal membatalkan');
    } finally {
      markSubmitting(card.board_key, false);
    }
  }

  async function handleSetujui(card) {
    if (!card.matching_id || !isOwner) return;
    if (submittingKeysRef.current.has(card.board_key)) return;

    const kodePbf = card.pricelist?.kode_pbf;
    const selectedKode = selections[kodePbf] || card.kode_obat_yelo;
    if (!selectedKode) {
      showToast('Pilih obat Yelo dulu');
      return;
    }

    markSubmitting(card.board_key, true);
    try {
      if (selectedKode !== card.kode_obat_yelo) {
        await updateMatching(card.matching_id, {
          kode_obat_yelo: selectedKode,
        });
      }
      const verified = await verifikasiMatching(card.matching_id, 'setuju');
      if (!verified || verified.status !== 'terverifikasi') {
        showToast(
          verified?.status
            ? `Status server: ${verified.status} — tidak dipindah ke Match`
            : 'Respons Setujui tidak valid'
        );
        return;
      }
      applyLocalSetujuiSuccess(card, verified);
      showToast('Matching disetujui');
    } catch (err) {
      showToast(err.message || 'Gagal menyetujui');
    } finally {
      markSubmitting(card.board_key, false);
    }
  }

  async function handleTolak(card) {
    if (!card.matching_id || !isOwner) return;
    if (submittingKeysRef.current.has(card.board_key)) return;

    markSubmitting(card.board_key, true);
    try {
      const rejected = await verifikasiMatching(card.matching_id, 'tolak');
      if (!rejected || rejected.status !== 'ditolak') {
        showToast(
          rejected?.status
            ? `Status server: ${rejected.status} — tidak dipindah ke Ditolak`
            : 'Respons Ditolak tidak valid'
        );
        return;
      }
      applyLocalTolakSuccess(card, rejected);
      showToast('Pengajuan ditolak');
    } catch (err) {
      showToast(err.message || 'Gagal menolak');
    } finally {
      markSubmitting(card.board_key, false);
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
      const matching = result?.matching;
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

      const sourceCard =
        cards.find((c) => c.pricelist?.kode_pbf === tambahRow.kode_pbf) || {
          kind: 'unmatched',
          board_key: `unmatched:${tambahRow.kode_pbf}`,
          pricelist: { ...tambahRow, pbf_id: pbfId },
          kandidat: [],
        };

      setTambahRow(null);
      setTambahForm(EMPTY_TAMBAH_FORM);

      if (matching?.id && matching.status === 'menunggu_verifikasi') {
        applyLocalAjukanSuccess(
          sourceCard,
          {
            ...matching,
            obat,
            kode_obat_yelo: matching.kode_obat_yelo || obat?.kode_obat,
          },
          obat
        );
        showToast('Obat dibuat & diajukan — menunggu verifikasi');
      } else {
        showToast(
          result?.warning ||
            'Obat dibuat — matching tidak terbuat, muat ulang board'
        );
        invalidateBoardCache();
        await loadBoard(pbfId, { force: true });
      }
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
      navLoading={loading || refreshing}
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
              className="w-full rounded-[4px] border border-border-subtle bg-bg-surface py-1.5 pl-10 pr-9 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
            />
            {searchLoading || (loading && Boolean(query.trim())) ? (
              <SubmitSpinner className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent-yellow" />
            ) : null}
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

          {olehFilter ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-[4px] bg-accent-navy/80 px-2 py-1 text-[11px] font-semibold text-white">
                <span className="truncate">Oleh: {olehFilter}</span>
                <button
                  type="button"
                  onClick={clearOlehFilter}
                  className="shrink-0 rounded-[2px] px-1 text-white/80 hover:bg-white/15 hover:text-white"
                  aria-label="Hapus filter oleh"
                >
                  ×
                </button>
              </span>
            </div>
          ) : null}

          <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
            {FILTERS.map((f) => {
              const active = statusFilter === f.id;
              const count =
                f.id === 'all'
                  ? counts.match +
                    counts.menunggu +
                    counts.belum +
                    counts.no_match +
                    (counts.ditolak || 0)
                  : counts[f.id] ?? 0;
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
          {olehFilter
            ? `Filter Oleh: ${olehFilter}. Pilih supplier (dari card Supplier) untuk membuka board.`
            : 'Buka dari card supplier (tap progress matching) untuk melihat pricelist.'}
        </p>
      ) : loading && cards.length === 0 ? (
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
              (card.kind === 'pending' ||
              card.kind === 'rejected' ||
              card.kind === 'ditolak'
                ? card.kode_obat_yelo
                : '') ||
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
                onTolak={() => handleTolak(card)}
                busy={submittingKeys.has(card.board_key)}
                canUsulkan={canUsulkan}
                canTambahObat={
                  canTambahObat && (!isFoGroup || card.kind === 'rejected')
                }
                isOwner={isOwner}
              />
            );
          })}
        </div>
      )}

      {pbfId && !loading && hasMore ? (
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
