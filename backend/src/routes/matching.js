const express = require('express');
const stringSimilarity = require('string-similarity');
const { supabase } = require('../db');

const router = express.Router();

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
  obat:obat_yelo ( kode_obat, nama_obat ),
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
    normalizeText(req.headers['x-heybat-actor']) ||
    normalizeText(req.body?.actor) ||
    'staf'
  );
}

/**
 * TODO: batasi akses ke owner/is_owner setelah sistem akses (Group) dibangun.
 * MATCHING_OPEN_VERIFY default true — tetap terbuka untuk sekarang.
 * Sementara: izinkan jika header x-heybat-is-owner=1 ATAU env MATCHING_OPEN_VERIFY=true.
 */
function canVerifyMatching(req) {
  const open =
    String(process.env.MATCHING_OPEN_VERIFY ?? 'true').toLowerCase() !== 'false';
  const headerOwner = String(req.headers['x-heybat-is-owner'] || '') === '1';
  return open || headerOwner;
}

async function fetchLatestPricelistByPbf(pbfId) {
  const data = await fetchAllRows(() =>
    supabase
      .from('pricelist')
      .select('kode_pbf, nama_barang, satuan, qty, harga_dasar, tanggal_upload, id')
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
    supabase.from('obat_yelo').select('kode_obat, nama_obat').order('nama_obat')
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
router.get('/katalog-obat', async (_req, res) => {
  try {
    const data = await fetchAllObatYeloLight();
    return res.json(data);
  } catch (err) {
    console.error('[GET /matching/katalog-obat]', err);
    return res.status(500).json({ error: 'Gagal mengambil katalog obat' });
  }
});

// GET /api/matching/refresh-kandidat/:pbfId/status
router.get('/refresh-kandidat/:pbfId/status', (req, res) => {
  const pbfId = normalizeText(req.params.pbfId);
  const job = refreshJobs.get(pbfId);
  if (!job) {
    return res.json({ pbf_id: pbfId, status: 'idle' });
  }
  return res.json(jobPublicView(job));
});

// POST /api/matching/refresh-kandidat/:pbfId — hitung ulang cache (async)
router.post('/refresh-kandidat/:pbfId', async (req, res) => {
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
router.get('/kandidat/:pbfId', async (req, res) => {
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

    // Prioritas: yang punya cache skor tinggi / exact name di cache, lalu abjad
    unmatched.sort((a, b) => {
      const ca = cacheInfo.map.get(a.kode_pbf);
      const cb = cacheInfo.map.get(b.kode_pbf);
      const sa = ca?.kandidat?.[0]?.skor_kemiripan || 0;
      const sb = cb?.kandidat?.[0]?.skor_kemiripan || 0;
      if (sa !== sb) return sb - sa;
      return String(a.nama_barang || '').localeCompare(String(b.nama_barang || ''), 'id');
    });

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

// GET /api/matching/menunggu-verifikasi
router.get('/menunggu-verifikasi', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('matching')
      .select(SELECT_MATCHING)
      .eq('status', 'menunggu_verifikasi')
      .order('tanggal_dipilih', { ascending: true });

    if (error) throw error;

    const rows = data || [];
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const { data: pl } = await supabase
          .from('pricelist')
          .select('nama_barang, harga_dasar, satuan')
          .eq('pbf_id', row.pricelist_pbf_id)
          .eq('kode_pbf', row.pricelist_kode_pbf)
          .order('tanggal_upload', { ascending: false })
          .limit(1)
          .maybeSingle();
        return {
          ...row,
          pricelist_nama_barang: pl?.nama_barang || null,
          pricelist_harga_dasar: pl?.harga_dasar ?? null,
          pricelist_satuan: pl?.satuan || null,
        };
      })
    );

    return res.json(enriched);
  } catch (err) {
    console.error('[GET /matching/menunggu-verifikasi]', err);
    return res.status(500).json({ error: 'Gagal mengambil daftar menunggu verifikasi' });
  }
});

// GET /api/matching/unmatched
router.get('/unmatched', async (req, res) => {
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
        .order('nama_obat')
    );

    const obatBelum = obatList.filter((o) => !matchedObat.has(o.kode_obat));

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

    return res.json({
      obat_yelo_belum: obatBelum,
      item_pbf_belum: itemPbfBelum,
    });
  } catch (err) {
    console.error('[GET /matching/unmatched]', err);
    return res.status(500).json({ error: 'Gagal mengambil data belum matching' });
  }
});

// GET /api/matching/obat/:kodeObatYelo
router.get('/obat/:kodeObatYelo', async (req, res) => {
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

// POST /api/matching/tidak-cocok — staf tandai "Tidak Ada yang Cocok" (permanen)
router.post('/tidak-cocok', async (req, res) => {
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
router.post('/', async (req, res) => {
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
router.put('/:id/verifikasi', async (req, res) => {
  try {
    // TODO: batasi akses ke owner/is_owner setelah sistem akses (Group) dibangun.
    // MATCHING_OPEN_VERIFY default true — tetap terbuka untuk sekarang.
    if (!canVerifyMatching(req)) {
      return res.status(403).json({
        error: 'Hanya owner yang dapat memverifikasi matching',
      });
    }

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

// PUT /api/matching/:id
router.put('/:id', async (req, res) => {
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

    // TODO: batasi edit matching terverifikasi ke owner setelah sistem akses dibangun
    if (existing.status === 'terverifikasi' && !canVerifyMatching(req)) {
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
