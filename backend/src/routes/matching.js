const express = require('express');
const stringSimilarity = require('string-similarity');
const { supabase } = require('../db');
const {
  requireAuth,
  requireApproved,
  requireOwner,
  requireMenuAksi,
} = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireApproved);

/** Status yang membuat kode_pbf tidak muncul di antrean matching staf. */
const HIDDEN_FROM_KANDIDAT = ['menunggu_verifikasi', 'terverifikasi'];
const KANDIDAT_TOP = 5;
const UPSERT_CHUNK = 100;

const SELECT_MATCHING = `
  id,
  kode_obat_yelo,
  pricelist_pbf_id,
  pricelist_kode_pbf,
  status,
  diusulkan_oleh,
  dipilih_oleh,
  diverifikasi_oleh,
  tanggal_diusulkan,
  tanggal_dipilih,
  tanggal_diverifikasi,
  created_at,
  updated_at,
  obat:obat_yelo (
    kode_obat,
    nama_obat,
    konversi,
    satuan_1:ref_satuan!obat_yelo_satuan_1_id_fkey ( id, nama ),
    satuan_2:ref_satuan!obat_yelo_satuan_2_id_fkey ( id, nama ),
    golongan:ref_golongan ( id, nama ),
    grup_substitusi:ref_grup_substitusi ( id, nama )
  ),
  supplier:supplier ( id, nama, inisial )
`;

/** In-memory refresh jobs per pbfId. */
const refreshJobs = new Map();

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/** Supabase default max rows = 1000; page through until exhausted. */
async function fetchAllRows(buildQuery, pageSize = 1000) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function actorFromReq(req) {
  return (
    normalizeText(req.user?.nama) ||
    normalizeText(req.user?.email) ||
    normalizeText(req.headers['x-heybat-actor']) ||
    normalizeText(req.body?.actor) ||
    'staf'
  );
}

async function fetchLatestPricelistByPbf(pbfId) {
  const data = await fetchAllRows(() =>
    supabase
      .from('pricelist')
      .select('kode_pbf, nama_barang, satuan, qty, harga_dasar, catatan_kondisi, tanggal_upload, id')
      .eq('pbf_id', pbfId)
      .order('tanggal_upload', { ascending: false })
      .order('id', { ascending: false })
  );

  const map = new Map();
  for (const row of data) {
    if (!map.has(row.kode_pbf)) map.set(row.kode_pbf, row);
  }
  return [...map.values()];
}

async function fetchAllObatYeloLight() {
  return fetchAllRows(() =>
    supabase
      .from('obat_yelo')
      .select(
        'kode_obat, nama_obat, konversi, satuan_1:ref_satuan!obat_yelo_satuan_1_id_fkey ( id, nama ), satuan_2:ref_satuan!obat_yelo_satuan_2_id_fkey ( id, nama ), grup_substitusi:ref_grup_substitusi ( id, nama )'
      )
      .order('nama_obat', { ascending: true })
  );
}

function scoreCandidates(namaBarang, obatList, topN = KANDIDAT_TOP) {
  const target = String(namaBarang || '').trim().toLowerCase();
  if (!target || !obatList.length) return [];

  const ratings = obatList.map((obat) => {
    const nama = String(obat.nama_obat || '').trim().toLowerCase();
    const score = nama
      ? stringSimilarity.compareTwoStrings(target, nama)
      : 0;
    return {
      kode_obat_yelo: obat.kode_obat,
      nama_obat: obat.nama_obat,
      skor_kemiripan: Math.round(score * 1000) / 1000,
      konversi: obat.konversi ?? null,
      satuan_1: obat.satuan_1 || null,
    };
  });

  ratings.sort((a, b) => b.skor_kemiripan - a.skor_kemiripan);
  return ratings.slice(0, topN).filter((r) => r.skor_kemiripan > 0);
}

/**
 * Kode PBF yang disembunyikan dari antrean matching:
 * - menunggu_verifikasi / terverifikasi (aktif)
 * - ditolak dengan kode_obat_yelo NULL ("Tidak Ada yang Cocok" permanen)
 * Catatan: ditolak hasil verifikasi (masih punya kode_obat) tetap boleh muncul lagi.
 */
async function fetchHiddenKodePbf(pbfId) {
  const rows = await fetchAllRows(() =>
    supabase
      .from('matching')
      .select('pricelist_kode_pbf, status, kode_obat_yelo')
      .eq('pricelist_pbf_id', pbfId)
  );

  const hidden = new Set();
  for (const row of rows) {
    if (HIDDEN_FROM_KANDIDAT.includes(row.status)) {
      hidden.add(row.pricelist_kode_pbf);
      continue;
    }
    if (row.status === 'ditolak' && !row.kode_obat_yelo) {
      hidden.add(row.pricelist_kode_pbf);
    }
  }
  return hidden;
}

async function fetchCacheMap(pbfId) {
  const rows = await fetchAllRows(() =>
    supabase
      .from('matching_kandidat_cache')
      .select('pricelist_kode_pbf, kandidat, dihitung_pada')
      .eq('pricelist_pbf_id', pbfId)
  );
  const map = new Map();
  let newest = null;
  for (const row of rows) {
    map.set(row.pricelist_kode_pbf, row);
    if (!newest || new Date(row.dihitung_pada) > new Date(newest)) {
      newest = row.dihitung_pada;
    }
  }
  return { map, newest };
}

async function upsertCacheRows(rows) {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from('matching_kandidat_cache').upsert(chunk, {
      onConflict: 'pricelist_pbf_id,pricelist_kode_pbf',
    });
    if (error) throw error;
  }
}

async function runRefreshJob(pbfId) {
  const job = refreshJobs.get(pbfId);
  if (!job) return;

  try {
    const [obatList, hidden, latest] = await Promise.all([
      fetchAllObatYeloLight(),
      fetchHiddenKodePbf(pbfId),
      fetchLatestPricelistByPbf(pbfId),
    ]);

    const targets = latest.filter((row) => !hidden.has(row.kode_pbf));
    job.total = targets.length;
    job.processed = 0;

    const now = new Date().toISOString();
    const buffer = [];

    for (const row of targets) {
      if (job.cancel) break;
      const kandidat = scoreCandidates(row.nama_barang, obatList, KANDIDAT_TOP);
      buffer.push({
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: row.kode_pbf,
        kandidat,
        dihitung_pada: now,
      });
      job.processed += 1;

      if (buffer.length >= UPSERT_CHUNK) {
        await upsertCacheRows(buffer.splice(0, buffer.length));
      }
    }

    if (buffer.length) await upsertCacheRows(buffer);

    job.status = job.cancel ? 'cancelled' : 'done';
    job.finished_at = new Date().toISOString();
    job.dihitung_pada = now;
  } catch (err) {
    console.error('[refresh-kandidat job]', pbfId, err);
    job.status = 'error';
    job.error = err.message || 'Gagal menghitung kandidat';
    job.finished_at = new Date().toISOString();
  }
}

function jobPublicView(job) {
  if (!job) return null;
  return {
    pbf_id: job.pbf_id,
    status: job.status,
    processed: job.processed,
    total: job.total,
    started_at: job.started_at,
    finished_at: job.finished_at || null,
    dihitung_pada: job.dihitung_pada || null,
    error: job.error || null,
    elapsed_ms: job.finished_at
      ? new Date(job.finished_at) - new Date(job.started_at)
      : Date.now() - new Date(job.started_at).getTime(),
  };
}

// GET /api/matching/katalog-obat
router.get('/katalog-obat', requireMenuAksi('matching', 'lihat'), async (_req, res) => {
  try {
    const data = await fetchAllObatYeloLight();
    return res.json(data);
  } catch (err) {
    console.error('[GET /matching/katalog-obat]', err);
    return res.status(500).json({ error: 'Gagal mengambil katalog obat' });
  }
});

// GET /api/matching/refresh-kandidat/:pbfId/status
router.get('/refresh-kandidat/:pbfId/status', requireMenuAksi('matching', 'lihat'), (req, res) => {
  const pbfId = normalizeText(req.params.pbfId);
  const job = refreshJobs.get(pbfId);
  if (!job) {
    return res.json({ pbf_id: pbfId, status: 'idle' });
  }
  return res.json(jobPublicView(job));
});

// POST /api/matching/refresh-kandidat/:pbfId — hitung ulang cache (async)
router.post('/refresh-kandidat/:pbfId', requireMenuAksi('matching', 'edit'), async (req, res) => {
  try {
    const pbfId = normalizeText(req.params.pbfId);
    if (!pbfId) {
      return res.status(400).json({ error: 'pbf_id wajib diisi' });
    }

    const { data: supplier, error: supplierError } = await supabase
      .from('supplier')
      .select('id, nama, inisial')
      .eq('id', pbfId)
      .maybeSingle();
    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: 'PBF tidak ditemukan' });
    }

    const existing = refreshJobs.get(pbfId);
    if (existing && existing.status === 'running') {
      return res.status(409).json({
        error: 'Refresh kandidat untuk PBF ini masih berjalan',
        job: jobPublicView(existing),
      });
    }

    const job = {
      pbf_id: pbfId,
      status: 'running',
      processed: 0,
      total: 0,
      started_at: new Date().toISOString(),
      finished_at: null,
      dihitung_pada: null,
      error: null,
      cancel: false,
    };
    refreshJobs.set(pbfId, job);

    // Fire-and-forget; client poll status endpoint
    setImmediate(() => {
      runRefreshJob(pbfId).catch((err) => {
        console.error('[refresh-kandidat]', err);
      });
    });

    return res.status(202).json({
      message: 'Refresh kandidat dimulai — pantau progress via status endpoint',
      pbf: supplier,
      job: jobPublicView(job),
    });
  } catch (err) {
    console.error('[POST /matching/refresh-kandidat]', err);
    return res.status(500).json({ error: err.message || 'Gagal memulai refresh kandidat' });
  }
});

// GET /api/matching/kandidat/:pbfId — baca dari cache; hitung on-the-fly jika belum ada
router.get('/kandidat/:pbfId', requireMenuAksi('matching', 'lihat'), async (req, res) => {
  try {
    const pbfId = normalizeText(req.params.pbfId);
    if (!pbfId) {
      return res.status(400).json({ error: 'pbf_id wajib diisi' });
    }

    const limitRaw = parseInt(String(req.query.limit || '80'), 10);
    const offsetRaw = parseInt(String(req.query.offset || '0'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(300, Math.max(1, limitRaw)) : 80;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const { data: supplier, error: supplierError } = await supabase
      .from('supplier')
      .select('id, nama, inisial')
      .eq('id', pbfId)
      .maybeSingle();

    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: 'PBF tidak ditemukan' });
    }

    const [hidden, latest, cacheInfo] = await Promise.all([
      fetchHiddenKodePbf(pbfId),
      fetchLatestPricelistByPbf(pbfId),
      fetchCacheMap(pbfId),
    ]);

    const unmatched = latest.filter((row) => !hidden.has(row.kode_pbf));

    // Default A-Z nama barang PBF (skor kandidat tetap di dalam tiap card)
    unmatched.sort((a, b) =>
      String(a.nama_barang || '').localeCompare(String(b.nama_barang || ''), 'id', {
        sensitivity: 'base',
      })
    );

    const pageRows = unmatched.slice(offset, offset + limit);
    let obatList = null;
    const onTheFly = [];

    const items = [];
    for (const row of pageRows) {
      const cached = cacheInfo.map.get(row.kode_pbf);
      let kandidat = Array.isArray(cached?.kandidat) ? cached.kandidat : null;
      let fromCache = Boolean(kandidat);

      if (!kandidat) {
        if (!obatList) obatList = await fetchAllObatYeloLight();
        kandidat = scoreCandidates(row.nama_barang, obatList, KANDIDAT_TOP);
        fromCache = false;
        onTheFly.push({
          pricelist_pbf_id: pbfId,
          pricelist_kode_pbf: row.kode_pbf,
          kandidat,
          dihitung_pada: new Date().toISOString(),
        });
      }

      items.push({
        kode_pbf: row.kode_pbf,
        nama_barang: row.nama_barang,
        satuan: row.satuan,
        qty: row.qty,
        harga_dasar: row.harga_dasar,
        catatan_kondisi: row.catatan_kondisi || null,
        kandidat,
        dari_cache: fromCache,
      });
    }

    // Simpan hasil on-the-fly supaya request berikutnya cepat
    if (onTheFly.length) {
      upsertCacheRows(onTheFly).catch((err) =>
        console.error('[kandidat on-the-fly upsert]', err)
      );
    }

    const refreshJob = refreshJobs.get(pbfId);

    return res.json({
      pbf: supplier,
      total_unmatched: unmatched.length,
      offset,
      limit,
      items,
      cache_dihitung_pada: cacheInfo.newest,
      refresh_job: refreshJob ? jobPublicView(refreshJob) : { status: 'idle' },
    });
  } catch (err) {
    console.error('[GET /matching/kandidat]', err);
    return res.status(500).json({ error: err.message || 'Gagal mengambil kandidat matching' });
  }
});

/**
 * GET /api/matching/board?pbf_id=&status=&q=
 * status: all | match | menunggu | belum | no_match
 * Cards:
 *  - kind=match: grup per obat Yelo (terverifikasi) + semua baris pricelist match
 *  - kind=pending|unmatched|rejected: 1 card per kode PBF
 */
router.get('/board', requireMenuAksi('matching', 'lihat'), async (req, res) => {
  try {
    const pbfId = normalizeText(req.query.pbf_id);
    if (!pbfId) {
      return res.status(400).json({ error: 'pbf_id wajib diisi' });
    }

    const statusFilter = normalizeText(req.query.status) || 'all';
    const allowed = new Set(['all', 'match', 'menunggu', 'belum', 'no_match']);
    if (!allowed.has(statusFilter)) {
      return res.status(400).json({ error: 'status filter tidak valid' });
    }
    const q = String(req.query.q || '').trim().toLowerCase();
    const limitRaw = parseInt(String(req.query.limit || '40'), 10);
    const offsetRaw = parseInt(String(req.query.offset || '0'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 40;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const { data: supplier, error: supplierError } = await supabase
      .from('supplier')
      .select('id, nama, inisial')
      .eq('id', pbfId)
      .maybeSingle();
    if (supplierError) throw supplierError;
    if (!supplier) {
      return res.status(404).json({ error: 'PBF tidak ditemukan' });
    }

    const needMatch = statusFilter === 'all' || statusFilter === 'match';
    const needPending = statusFilter === 'all' || statusFilter === 'menunggu';
    const needUnmatched = statusFilter === 'all' || statusFilter === 'belum';
    const needRejected = statusFilter === 'all' || statusFilter === 'no_match';
    const needActionCards = needPending || needUnmatched || needRejected;

    const { loadLatestStokRingkasanMap } = require('../lib/stokRingkasan');

    // Data dasar selalu; stok/supplier-all hanya bila perlu card Match
    const [latest, matchings, cacheInfo, stokMap] = await Promise.all([
      fetchLatestPricelistByPbf(pbfId),
      fetchAllRows(() =>
        supabase
          .from('matching')
          .select(SELECT_MATCHING)
          .eq('pricelist_pbf_id', pbfId)
      ),
      needActionCards
        ? fetchCacheMap(pbfId)
        : Promise.resolve({ map: new Map(), newest: null }),
      needMatch
        ? loadLatestStokRingkasanMap().catch(() => new Map())
        : Promise.resolve(new Map()),
    ]);

    // Active matching per kode for this PBF (prefer terverifikasi > menunggu > ditolak skip)
    const byKode = new Map();
    for (const row of matchings) {
      const prev = byKode.get(row.pricelist_kode_pbf);
      if (!prev) {
        byKode.set(row.pricelist_kode_pbf, row);
        continue;
      }
      const rank = (s) =>
        s === 'terverifikasi' ? 3 : s === 'menunggu_verifikasi' ? 2 : s === 'ditolak' ? 1 : 0;
      if (rank(row.status) > rank(prev.status)) {
        byKode.set(row.pricelist_kode_pbf, row);
      }
    }

    // Match groups: obat Yelo that have terverifikasi on this PBF
    const yeloCodesNeeded = new Set();
    for (const row of matchings) {
      if (row.status === 'terverifikasi' && row.kode_obat_yelo) {
        yeloCodesNeeded.add(row.kode_obat_yelo);
      }
    }

    // Counts murah (tanpa scoring kandidat / cross-PBF enrich)
    let countMenunggu = 0;
    let countBelum = 0;
    let countNoMatch = 0;
    for (const row of latest) {
      const m = byKode.get(row.kode_pbf);
      if (m?.status === 'terverifikasi') continue;
      if (m?.status === 'menunggu_verifikasi') countMenunggu += 1;
      else if (m?.status === 'ditolak' && !m.kode_obat_yelo) countNoMatch += 1;
      else countBelum += 1;
    }
    const counts = {
      match: yeloCodesNeeded.size,
      menunggu: countMenunggu,
      belum: countBelum,
      no_match: countNoMatch,
    };

    // --- Match cards (hanya bila filter butuh) ---
    const matchCards = [];
    if (needMatch && yeloCodesNeeded.size) {
      const codes = [...yeloCodesNeeded];
      const crossMatchings = await fetchAllRows(() =>
        supabase
          .from('matching')
          .select(SELECT_MATCHING)
          .eq('status', 'terverifikasi')
          .in('kode_obat_yelo', codes)
      );

      const needPl = new Map(); // pbfId -> Set(kode)
      for (const row of crossMatchings) {
        if (!needPl.has(row.pricelist_pbf_id)) needPl.set(row.pricelist_pbf_id, new Set());
        needPl.get(row.pricelist_pbf_id).add(row.pricelist_kode_pbf);
      }
      const plLookup = new Map(); // `${pbfId}::${kode}` -> row
      await Promise.all(
        [...needPl.entries()].map(async ([id, kodeSet]) => {
          const rows = await fetchLatestPricelistByPbf(id);
          for (const r of rows) {
            if (kodeSet.has(r.kode_pbf)) plLookup.set(`${id}::${r.kode_pbf}`, r);
          }
        })
      );

      const obatByKode = new Map();
      for (const row of crossMatchings) {
        if (row.obat?.kode_obat) obatByKode.set(row.obat.kode_obat, row.obat);
      }

      for (const kodeObat of yeloCodesNeeded) {
        const obat = obatByKode.get(kodeObat) || { kode_obat: kodeObat, nama_obat: kodeObat };
        const lines = crossMatchings
          .filter((m) => m.kode_obat_yelo === kodeObat)
          .map((m) => {
            const pl = plLookup.get(`${m.pricelist_pbf_id}::${m.pricelist_kode_pbf}`);
            const sup = m.supplier;
            return {
              matching_id: m.id,
              pricelist_pbf_id: m.pricelist_pbf_id,
              pricelist_kode_pbf: m.pricelist_kode_pbf,
              inisial: sup?.inisial || null,
              nama_barang: pl?.nama_barang || m.pricelist_kode_pbf,
              satuan: pl?.satuan || null,
              qty: pl?.qty ?? null,
              harga_dasar: pl?.harga_dasar ?? null,
              catatan_kondisi: pl?.catatan_kondisi || null,
            };
          });

        const stok = stokMap.get(kodeObat) || null;
        matchCards.push({
          kind: 'match',
          board_key: `match:${kodeObat}`,
          status: 'terverifikasi',
          obat: {
            ...obat,
            golongan: obat.golongan || null,
            harga_1: stok?.harga_1 ?? null,
            harga_3: stok?.harga_3 ?? null,
          },
          pricelist_rows: lines,
        });
      }
    }

    // --- Action cards: shell dulu (tanpa kandidat), hydrate hanya untuk halaman ---
    const pendingCards = [];
    const unmatchedCards = [];
    const rejectedCards = [];

    if (needActionCards) {
      for (const row of latest) {
        const m = byKode.get(row.kode_pbf);
        if (m?.status === 'terverifikasi') continue;

        if (m?.status === 'menunggu_verifikasi') {
          if (needPending) {
            pendingCards.push({
              kind: 'pending',
              board_key: `pending:${row.kode_pbf}`,
              status: 'menunggu_verifikasi',
              matching_id: m.id,
              pricelist: { ...row, pbf_id: pbfId },
              selected_obat: m.obat || null,
              kode_obat_yelo: m.kode_obat_yelo,
              kandidat: null,
            });
          }
          continue;
        }

        if (m?.status === 'ditolak' && !m.kode_obat_yelo) {
          if (needRejected) {
            rejectedCards.push({
              kind: 'rejected',
              board_key: `rejected:${row.kode_pbf}`,
              status: 'ditolak',
              matching_id: m.id,
              pricelist: { ...row, pbf_id: pbfId },
              selected_obat: null,
              kode_obat_yelo: null,
              kandidat: null,
            });
          }
          continue;
        }

        if (needUnmatched) {
          unmatchedCards.push({
            kind: 'unmatched',
            board_key: `unmatched:${row.kode_pbf}`,
            status: 'belum',
            matching_id: m?.status === 'ditolak' ? m.id : null,
            pricelist: { ...row, pbf_id: pbfId },
            selected_obat: null,
            kode_obat_yelo: null,
            kandidat: null,
          });
        }
      }
    }

    function matchesQuery(card) {
      if (!q) return true;
      if (card.kind === 'match') {
        const name = String(card.obat?.nama_obat || '').toLowerCase();
        const kode = String(card.obat?.kode_obat || '').toLowerCase();
        if (name.includes(q) || kode.includes(q)) return true;
        return (card.pricelist_rows || []).some((r) =>
          String(r.nama_barang || '').toLowerCase().includes(q)
        );
      }
      const nama = String(card.pricelist?.nama_barang || '').toLowerCase();
      const kode = String(card.pricelist?.kode_pbf || '').toLowerCase();
      return nama.includes(q) || kode.includes(q);
    }

    let cards = [];
    if (needMatch) cards.push(...matchCards);
    if (needPending) cards.push(...pendingCards);
    if (needUnmatched) cards.push(...unmatchedCards);
    if (needRejected) cards.push(...rejectedCards);

    cards = cards.filter(matchesQuery);

    // Sort: match A-Z obat, then pending/unmatched/rejected A-Z nama barang
    cards.sort((a, b) => {
      const rank = (c) =>
        c.kind === 'match' ? 0 : c.kind === 'pending' ? 1 : c.kind === 'unmatched' ? 2 : 3;
      const dr = rank(a) - rank(b);
      if (dr !== 0) return dr;
      const na =
        a.kind === 'match'
          ? a.obat?.nama_obat
          : a.pricelist?.nama_barang;
      const nb =
        b.kind === 'match'
          ? b.obat?.nama_obat
          : b.pricelist?.nama_barang;
      return String(na || '').localeCompare(String(nb || ''), 'id', {
        sensitivity: 'base',
      });
    });

    const total = cards.length;
    const page = cards.slice(offset, offset + limit);

    // Scoring kandidat hanya untuk baris di halaman ini (bukan seluruh pricelist)
    let obatListForScore = null;
    async function kandidatFor(row) {
      const cached = cacheInfo.map.get(row.kode_pbf);
      if (cached?.kandidat?.length) return cached.kandidat;
      if (!obatListForScore) obatListForScore = await fetchAllObatYeloLight();
      return scoreCandidates(row.nama_barang, obatListForScore);
    }

    await Promise.all(
      page.map(async (card) => {
        if (card.kind === 'match' || !card.pricelist) return;
        card.kandidat = await kandidatFor(card.pricelist);
      })
    );

    return res.json({
      supplier,
      filter: statusFilter,
      q: q || null,
      counts,
      total,
      offset,
      limit,
      cache_dihitung_pada: cacheInfo.newest,
      cards: page,
    });
  } catch (err) {
    console.error('[GET /matching/board]', err);
    return res.status(500).json({ error: err.message || 'Gagal mengambil board matching' });
  }
});

// GET /api/matching/menunggu-verifikasi
router.get('/menunggu-verifikasi', requireMenuAksi('matching', 'lihat'), async (_req, res) => {
  try {
    const rows = await fetchAllRows(() =>
      supabase
        .from('matching')
        .select(SELECT_MATCHING)
        .eq('status', 'menunggu_verifikasi')
        .order('tanggal_dipilih', { ascending: true })
    );

    // Enrich pricelist fields in bulk (hindari N+1 per baris).
    const byPbf = new Map();
    for (const row of rows) {
      if (!row.pricelist_pbf_id || !row.pricelist_kode_pbf) continue;
      if (!byPbf.has(row.pricelist_pbf_id)) {
        byPbf.set(row.pricelist_pbf_id, new Set());
      }
      byPbf.get(row.pricelist_pbf_id).add(row.pricelist_kode_pbf);
    }

    const plMap = new Map();
    await Promise.all(
      [...byPbf.entries()].map(async ([pbfId, kodeSet]) => {
        const plRows = await fetchAllRows(() =>
          supabase
            .from('pricelist')
            .select('kode_pbf, nama_barang, harga_dasar, satuan, catatan_kondisi, tanggal_upload, id')
            .eq('pbf_id', pbfId)
            .order('tanggal_upload', { ascending: false })
            .order('id', { ascending: false })
        );
        const seen = new Set();
        for (const pl of plRows) {
          if (!kodeSet.has(pl.kode_pbf) || seen.has(pl.kode_pbf)) continue;
          seen.add(pl.kode_pbf);
          plMap.set(`${pbfId}::${pl.kode_pbf}`, pl);
        }
      })
    );

    const enriched = rows.map((row) => {
      const pl = plMap.get(`${row.pricelist_pbf_id}::${row.pricelist_kode_pbf}`);
      return {
        ...row,
        pricelist_nama_barang: pl?.nama_barang || null,
        pricelist_harga_dasar: pl?.harga_dasar ?? null,
        pricelist_satuan: pl?.satuan || null,
        pricelist_catatan_kondisi: pl?.catatan_kondisi || null,
      };
    });

    return res.json(enriched);
  } catch (err) {
    console.error('[GET /matching/menunggu-verifikasi]', err);
    return res.status(500).json({ error: 'Gagal mengambil daftar menunggu verifikasi' });
  }
});

// GET /api/matching/unmatched
router.get('/unmatched', requireMenuAksi('matching', 'lihat'), async (req, res) => {
  try {
    const pbfFilter = normalizeText(req.query.pbf_id);

    const matchingRows = await fetchAllRows(() =>
      supabase
        .from('matching')
        .select('kode_obat_yelo, pricelist_pbf_id, pricelist_kode_pbf, status')
    );

    const matchedObat = new Set();
    const matchedPbfKey = new Set();
    const ditolakSkipKey = new Set();

    for (const r of matchingRows) {
      if (r.status === 'terverifikasi') {
        if (r.kode_obat_yelo) matchedObat.add(r.kode_obat_yelo);
        matchedPbfKey.add(`${r.pricelist_pbf_id}::${r.pricelist_kode_pbf}`);
      }
      if (r.status === 'ditolak' && !r.kode_obat_yelo) {
        ditolakSkipKey.add(`${r.pricelist_pbf_id}::${r.pricelist_kode_pbf}`);
      }
    }

    const obatList = await fetchAllRows(() =>
      supabase
        .from('obat_yelo')
        .select('kode_obat, nama_obat, golongan:ref_golongan(nama)')
        .order('nama_obat', { ascending: true })
    );

    const obatBelum = obatList
      .filter((o) => !matchedObat.has(o.kode_obat))
      .sort((a, b) =>
        String(a.nama_obat || '').localeCompare(String(b.nama_obat || ''), 'id', {
          sensitivity: 'base',
        })
      );

    let pbfQuery = supabase.from('supplier').select('id, nama, inisial').order('nama');
    if (pbfFilter) pbfQuery = pbfQuery.eq('id', pbfFilter);
    const { data: suppliers, error: supplierError } = await pbfQuery;
    if (supplierError) throw supplierError;

    const itemPbfBelum = [];
    for (const supplier of suppliers || []) {
      const latest = await fetchLatestPricelistByPbf(supplier.id);
      for (const row of latest) {
        const key = `${supplier.id}::${row.kode_pbf}`;
        if (matchedPbfKey.has(key)) continue;
        itemPbfBelum.push({
          pbf_id: supplier.id,
          pbf_nama: supplier.nama,
          pbf_inisial: supplier.inisial,
          kode_pbf: row.kode_pbf,
          nama_barang: row.nama_barang,
          harga_dasar: row.harga_dasar,
          satuan: row.satuan,
          ditandai_tidak_cocok: ditolakSkipKey.has(key),
        });
      }
    }

    itemPbfBelum.sort((a, b) =>
      String(a.nama_barang || '').localeCompare(String(b.nama_barang || ''), 'id', {
        sensitivity: 'base',
      })
    );

    return res.json({
      obat_yelo_belum: obatBelum,
      item_pbf_belum: itemPbfBelum,
    });
  } catch (err) {
    console.error('[GET /matching/unmatched]', err);
    return res.status(500).json({ error: 'Gagal mengambil data belum matching' });
  }
});

// GET /api/matching/supplier-map-aktif
// Map kode_obat_yelo -> [{ id, nama, inisial }] dari matching aktif.
router.get('/supplier-map-aktif', requireMenuAksi('matching', 'lihat'), async (_req, res) => {
  try {
    const rows = await fetchAllRows(() =>
      supabase
        .from('matching')
        .select(
          'id, kode_obat_yelo, pricelist_kode_pbf, status, supplier:supplier ( id, nama, inisial )'
        )
        .in('status', HIDDEN_FROM_KANDIDAT)
        .not('kode_obat_yelo', 'is', null)
    );

    /** @type {Record<string, Array<{ id: string, nama: string | null, inisial: string | null, pricelist_kode_pbf: string | null, matching_id: string }>>} */
    const map = {};
    for (const row of rows) {
      const kode = row.kode_obat_yelo;
      const supplier = row.supplier;
      if (!kode || !supplier?.id) continue;
      if (!map[kode]) map[kode] = [];
      // Satu pill per supplier; simpan kode_pbf pertama yang aktif
      const existing = map[kode].find((s) => s.id === supplier.id);
      if (existing) continue;
      map[kode].push({
        id: supplier.id,
        nama: supplier.nama || null,
        inisial: supplier.inisial || null,
        pricelist_kode_pbf: row.pricelist_kode_pbf || null,
        matching_id: row.id,
      });
    }

    for (const kode of Object.keys(map)) {
      map[kode].sort((a, b) =>
        String(a.inisial || a.nama || '').localeCompare(
          String(b.inisial || b.nama || ''),
          'id'
        )
      );
    }

    return res.json(map);
  } catch (err) {
    console.error('[GET /matching/supplier-map-aktif]', err);
    return res.status(500).json({ error: 'Gagal mengambil peta supplier matching' });
  }
});

// GET /api/matching/obat/:kodeObatYelo
router.get('/obat/:kodeObatYelo', requireMenuAksi('matching', 'lihat'), async (req, res) => {
  try {
    const kode = decodeURIComponent(req.params.kodeObatYelo);
    const { data, error } = await supabase
      .from('matching')
      .select(SELECT_MATCHING)
      .eq('kode_obat_yelo', kode)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('[GET /matching/obat]', err);
    return res.status(500).json({ error: 'Gagal mengambil matching obat' });
  }
});

/**
 * PUT /api/matching/obat/:kodeObatYelo/suppliers
 * Owner-only: sync supplier matching (bypass usul/verifikasi).
 * - add: insert matching status=terverifikasi
 * - remove_pbf_ids: set matching aktif → ditolak (riwayat tetap)
 */
router.put(
  '/obat/:kodeObatYelo/suppliers',
  requireOwner,
  async (req, res) => {
  try {
    const kodeObat = decodeURIComponent(req.params.kodeObatYelo);
    const actor = actorFromReq(req);
    const addList = Array.isArray(req.body?.add) ? req.body.add : [];
    const removeIds = Array.isArray(req.body?.remove_pbf_ids)
      ? req.body.remove_pbf_ids
      : [];

    const { data: obat, error: obatError } = await supabase
      .from('obat_yelo')
      .select('kode_obat')
      .eq('kode_obat', kodeObat)
      .maybeSingle();
    if (obatError) throw obatError;
    if (!obat) {
      return res.status(404).json({ error: 'Obat Yelo tidak ditemukan' });
    }

    const now = new Date().toISOString();
    const results = { added: [], rejected: [], skipped: [] };

    for (const pbfIdRaw of removeIds) {
      const pbfId = normalizeText(pbfIdRaw);
      if (!pbfId) continue;

      const { data: activeRows, error: findErr } = await supabase
        .from('matching')
        .select('id, status')
        .eq('kode_obat_yelo', kodeObat)
        .eq('pricelist_pbf_id', pbfId)
        .in('status', HIDDEN_FROM_KANDIDAT);

      if (findErr) throw findErr;

      for (const row of activeRows || []) {
        const { error: updErr } = await supabase
          .from('matching')
          .update({
            status: 'ditolak',
            diverifikasi_oleh: actor,
            tanggal_diverifikasi: now,
          })
          .eq('id', row.id);
        if (updErr) throw updErr;
        results.rejected.push({ id: row.id, pricelist_pbf_id: pbfId });
      }
    }

    for (const item of addList) {
      const pbfId = normalizeText(item?.pricelist_pbf_id);
      const kodePbf = normalizeText(item?.pricelist_kode_pbf);
      if (!pbfId || !kodePbf) {
        results.skipped.push({
          reason: 'pricelist_pbf_id dan pricelist_kode_pbf wajib',
          item,
        });
        continue;
      }

      const { data: existingActive, error: existErr } = await supabase
        .from('matching')
        .select('id, status')
        .eq('kode_obat_yelo', kodeObat)
        .eq('pricelist_pbf_id', pbfId)
        .eq('pricelist_kode_pbf', kodePbf)
        .in('status', HIDDEN_FROM_KANDIDAT)
        .maybeSingle();
      if (existErr) throw existErr;

      if (existingActive) {
        results.skipped.push({
          reason: `Sudah aktif (${existingActive.status})`,
          pricelist_pbf_id: pbfId,
          pricelist_kode_pbf: kodePbf,
        });
        continue;
      }

      const { data: pl, error: plErr } = await supabase
        .from('pricelist')
        .select('kode_pbf')
        .eq('pbf_id', pbfId)
        .eq('kode_pbf', kodePbf)
        .limit(1)
        .maybeSingle();
      if (plErr) throw plErr;
      if (!pl) {
        results.skipped.push({
          reason: 'Item pricelist tidak ditemukan untuk supplier ini',
          pricelist_pbf_id: pbfId,
          pricelist_kode_pbf: kodePbf,
        });
        continue;
      }

      const { data: created, error: insErr } = await supabase
        .from('matching')
        .insert({
          kode_obat_yelo: kodeObat,
          pricelist_pbf_id: pbfId,
          pricelist_kode_pbf: kodePbf,
          status: 'terverifikasi',
          diusulkan_oleh: actor,
          tanggal_diusulkan: now,
          dipilih_oleh: actor,
          tanggal_dipilih: now,
          diverifikasi_oleh: actor,
          tanggal_diverifikasi: now,
        })
        .select('id, pricelist_pbf_id, pricelist_kode_pbf, status')
        .single();

      if (insErr) throw insErr;
      results.added.push(created);
    }

    // Refresh map slice for this obat
    const { data: activeAfter, error: afterErr } = await supabase
      .from('matching')
      .select(
        'id, pricelist_pbf_id, pricelist_kode_pbf, status, supplier:supplier ( id, nama, inisial )'
      )
      .eq('kode_obat_yelo', kodeObat)
      .in('status', HIDDEN_FROM_KANDIDAT);

    if (afterErr) throw afterErr;

    const suppliers = [];
    for (const row of activeAfter || []) {
      if (!row.supplier?.id) continue;
      if (suppliers.some((s) => s.id === row.supplier.id)) continue;
      suppliers.push({
        id: row.supplier.id,
        nama: row.supplier.nama || null,
        inisial: row.supplier.inisial || null,
        pricelist_kode_pbf: row.pricelist_kode_pbf || null,
        matching_id: row.id,
      });
    }
    suppliers.sort((a, b) =>
      String(a.inisial || a.nama || '').localeCompare(
        String(b.inisial || b.nama || ''),
        'id'
      )
    );

    return res.json({
      kode_obat_yelo: kodeObat,
      suppliers,
      results,
    });
  } catch (err) {
    console.error('[PUT /matching/obat/:kode/suppliers]', err);
    return res.status(500).json({
      error: err.message || 'Gagal menyimpan supplier matching',
    });
  }
});

// POST /api/matching/tidak-cocok — staf tandai "Tidak Ada yang Cocok" (permanen)
router.post('/tidak-cocok', requireMenuAksi('matching', 'usulkan'), async (req, res) => {
  try {
    const pbfId = normalizeText(req.body?.pricelist_pbf_id);
    const kodePbf = normalizeText(req.body?.pricelist_kode_pbf);
    const actor = actorFromReq(req);

    if (!pbfId || !kodePbf) {
      return res.status(400).json({
        error: 'pricelist_pbf_id dan pricelist_kode_pbf wajib diisi',
      });
    }

    const { data: existingSkip, error: existError } = await supabase
      .from('matching')
      .select('id, status')
      .eq('pricelist_pbf_id', pbfId)
      .eq('pricelist_kode_pbf', kodePbf)
      .eq('status', 'ditolak')
      .is('kode_obat_yelo', null)
      .maybeSingle();

    if (existError) throw existError;
    if (existingSkip) {
      return res.status(200).json(existingSkip);
    }

    const { data: active, error: activeError } = await supabase
      .from('matching')
      .select('id, status')
      .eq('pricelist_pbf_id', pbfId)
      .eq('pricelist_kode_pbf', kodePbf)
      .in('status', HIDDEN_FROM_KANDIDAT)
      .limit(1)
      .maybeSingle();

    if (activeError) throw activeError;
    if (active) {
      return res.status(409).json({
        error: `Kode PBF ini sudah punya matching aktif (${active.status})`,
      });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('matching')
      .insert({
        kode_obat_yelo: null,
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: kodePbf,
        status: 'ditolak',
        dipilih_oleh: actor,
        tanggal_dipilih: now,
        diusulkan_oleh: actor,
        tanggal_diusulkan: now,
      })
      .select(SELECT_MATCHING)
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error('[POST /matching/tidak-cocok]', err);
    return res.status(500).json({ error: err.message || 'Gagal menandai tidak cocok' });
  }
});

// POST /api/matching
router.post('/', requireMenuAksi('matching', 'usulkan'), async (req, res) => {
  try {
    const kodeObat = normalizeText(req.body?.kode_obat_yelo);
    const pbfId = normalizeText(req.body?.pricelist_pbf_id);
    const kodePbf = normalizeText(req.body?.pricelist_kode_pbf);
    const actor = actorFromReq(req);

    if (!kodeObat || !pbfId || !kodePbf) {
      return res.status(400).json({
        error: 'kode_obat_yelo, pricelist_pbf_id, dan pricelist_kode_pbf wajib diisi',
      });
    }

    const { data: obat, error: obatError } = await supabase
      .from('obat_yelo')
      .select('kode_obat')
      .eq('kode_obat', kodeObat)
      .maybeSingle();
    if (obatError) throw obatError;
    if (!obat) {
      return res.status(404).json({ error: 'Obat Yelo tidak ditemukan' });
    }

    const { data: existingActive, error: existError } = await supabase
      .from('matching')
      .select('id, status')
      .eq('pricelist_pbf_id', pbfId)
      .eq('pricelist_kode_pbf', kodePbf)
      .eq('kode_obat_yelo', kodeObat)
      .in('status', HIDDEN_FROM_KANDIDAT)
      .maybeSingle();

    if (existError) throw existError;
    if (existingActive) {
      return res.status(409).json({
        error: `Pasangan ini sudah ada dengan status ${existingActive.status}`,
      });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('matching')
      .insert({
        kode_obat_yelo: kodeObat,
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: kodePbf,
        status: 'menunggu_verifikasi',
        dipilih_oleh: actor,
        tanggal_dipilih: now,
        diusulkan_oleh: normalizeText(req.body?.diusulkan_oleh) || 'sistem',
        tanggal_diusulkan: now,
      })
      .select(SELECT_MATCHING)
      .single();

    if (error) throw error;
    return res.status(201).json(data);
  } catch (err) {
    console.error('[POST /matching]', err);
    return res.status(500).json({ error: err.message || 'Gagal menyimpan matching' });
  }
});

// PUT /api/matching/:id/verifikasi
router.put(
  '/:id/verifikasi',
  requireMenuAksi('matching', 'verifikasi'),
  async (req, res) => {
  try {
    const { id } = req.params;
    const keputusan = normalizeText(req.body?.keputusan)?.toLowerCase();
    if (keputusan !== 'setuju' && keputusan !== 'tolak') {
      return res.status(400).json({ error: "keputusan harus 'setuju' atau 'tolak'" });
    }

    const { data: existing, error: findError } = await supabase
      .from('matching')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw findError;
    if (!existing) {
      return res.status(404).json({ error: 'Matching tidak ditemukan' });
    }
    if (existing.status !== 'menunggu_verifikasi') {
      return res.status(400).json({
        error: `Status saat ini '${existing.status}' — hanya menunggu_verifikasi yang bisa diverifikasi`,
      });
    }

    const actor = actorFromReq(req);
    const now = new Date().toISOString();
    const payload = {
      status: keputusan === 'setuju' ? 'terverifikasi' : 'ditolak',
      diverifikasi_oleh: actor,
      tanggal_diverifikasi: now,
    };

    const { data, error } = await supabase
      .from('matching')
      .update(payload)
      .eq('id', id)
      .select(SELECT_MATCHING)
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error('[PUT /matching/:id/verifikasi]', err);
    return res.status(500).json({ error: 'Gagal memverifikasi matching' });
  }
});

/**
 * DELETE /api/matching/:id/batal
 * Batalkan pengajuan menunggu_verifikasi → item kembali ke antrean belum match.
 */
router.delete('/:id/batal', requireMenuAksi('matching', 'usulkan'), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: findError } = await supabase
      .from('matching')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw findError;
    if (!existing) {
      return res.status(404).json({ error: 'Matching tidak ditemukan' });
    }
    if (existing.status !== 'menunggu_verifikasi') {
      return res.status(400).json({
        error: 'Hanya pengajuan menunggu verifikasi yang bisa dibatalkan',
      });
    }

    const { error } = await supabase.from('matching').delete().eq('id', id);
    if (error) throw error;
    return res.status(204).send();
  } catch (err) {
    console.error('[DELETE /matching/:id/batal]', err);
    return res.status(500).json({ error: err.message || 'Gagal membatalkan matching' });
  }
});

// PUT /api/matching/:id
router.put('/:id', requireMenuAksi('matching', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: findError } = await supabase
      .from('matching')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (findError) throw findError;
    if (!existing) {
      return res.status(404).json({ error: 'Matching tidak ditemukan' });
    }

    if (existing.status === 'terverifikasi' && req.user?.is_owner !== true) {
      return res.status(403).json({
        error:
          'Matching sudah terverifikasi dan terkunci, hanya owner yang bisa ubah',
      });
    }

    const payload = {};
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'kode_obat_yelo')) {
      payload.kode_obat_yelo = normalizeText(req.body.kode_obat_yelo);
    }
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'status')) {
      const status = normalizeText(req.body.status);
      if (
        !['usulan', 'menunggu_verifikasi', 'terverifikasi', 'ditolak'].includes(status)
      ) {
        return res.status(400).json({ error: 'status tidak valid' });
      }
      payload.status = status;
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: 'Tidak ada field untuk diubah' });
    }

    const { data, error } = await supabase
      .from('matching')
      .update(payload)
      .eq('id', id)
      .select(SELECT_MATCHING)
      .single();

    if (error) throw error;
    return res.json(data);
  } catch (err) {
    console.error('[PUT /matching/:id]', err);
    return res.status(500).json({ error: 'Gagal memperbarui matching' });
  }
});

module.exports = router;
