const express = require('express');
const multer = require('multer');
const { supabase } = require('../db');
const {
  createUploadSession,
  getUploadSession,
  updateUploadSession,
  consumeUploadSession,
} = require('../lib/uploadSessions');
const { parseStokExcel, buildStokWarningInfo } = require('../lib/stokExcel');
const { normalizeText } = require('../lib/penjualanExcel');
const {
  requireAuth,
  requireApproved,
  requireOwner,
  requireMenuAksi,
  listUserPermissions,
} = require('../middleware/auth');

const JENIS_TINDAKAN_STOK = new Set(['karantina', 'jual_prioritas', 'lainnya']);
const JENIS_TINDAKAN_ALL = new Set([
  ...JENIS_TINDAKAN_STOK,
  'tambah_ke_obat_yelo',
]);
const AUTO_DITANDAI_OLEH = 'sistem (auto dari upload)';

const router = express.Router();
router.use(requireAuth, requireApproved);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

function actorFromReq(req) {
  return (
    normalizeText(req.user?.nama) ||
    normalizeText(req.user?.email) ||
    normalizeText(req.headers['x-heybat-actor']) ||
    normalizeText(req.body?.actor) ||
    'staf'
  );
}

function stokLogicalKey(item) {
  const ed = item?.tanggal_expired
    ? String(item.tanggal_expired).slice(0, 10)
    : '';
  return [
    item?.kode_obat || '',
    item?.gudang || 'Retail',
    item?.no_batch || '',
    ed,
  ].join('\u0000');
}

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

async function loadKnownKodeSet() {
  const rows = await fetchAllRows(() =>
    supabase.from('obat_yelo').select('kode_obat')
  );
  return new Set(rows.map((r) => r.kode_obat).filter(Boolean));
}

/** Kode yang sudah punya penandaan terbuka tambah_ke_obat_yelo */
async function loadOpenTambahKodeSet() {
  const rows = await fetchAllRows(() =>
    supabase
      .from('stok_obat_penandaan')
      .select('kode_obat')
      .eq('status', 'terbuka')
      .eq('jenis_tindakan', 'tambah_ke_obat_yelo')
  );
  return new Set(rows.map((r) => r.kode_obat).filter(Boolean));
}

/** Key logis (kode|gudang|batch|ed) dari penandaan stok yang masih terbuka */
async function loadOpenStokLogicalKeySet() {
  const pens = await fetchAllRows(() =>
    supabase
      .from('stok_obat_penandaan')
      .select('stok_obat_id')
      .eq('status', 'terbuka')
      .not('stok_obat_id', 'is', null)
  );
  const stokIds = [...new Set(pens.map((p) => p.stok_obat_id).filter(Boolean))];
  const keys = new Set();
  const chunk = 200;
  for (let i = 0; i < stokIds.length; i += chunk) {
    const slice = stokIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from('stok_obat')
      .select('kode_obat, gudang, no_batch, tanggal_expired')
      .in('id', slice);
    if (error) throw error;
    for (const s of data || []) keys.add(stokLogicalKey(s));
  }
  return keys;
}

async function insertPenandaanChunked(rows) {
  if (!rows.length) return 0;
  let masuk = 0;
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from('stok_obat_penandaan').insert(chunk);
    if (error) throw error;
    masuk += chunk.length;
  }
  return masuk;
}

async function insertStokRows(items, { uploadBatchId, diuploadOleh, tanggalUpload }) {
  const toInsert = items.map((item) => ({
    upload_batch_id: uploadBatchId,
    kode_obat: item.kode_obat,
    gudang: item.gudang || 'Retail',
    nama_obat: item.nama_obat,
    nama_obat_asli: item.nama_obat_asli,
    no_batch: item.no_batch,
    tanggal_expired: item.tanggal_expired,
    stok_qty: item.stok_qty,
    satuan: item.satuan,
    harga_1: item.harga_1,
    harga_2: item.harga_2,
    harga_3: item.harga_3,
    golongan_vmedis: item.golongan_vmedis,
    kategori_vmedis: item.kategori_vmedis,
    lokasi: item.lokasi,
    status: item.status,
    tanggal_upload: tanggalUpload,
    diupload_oleh: diuploadOleh,
  }));

  const ids = [];
  const chunkSize = 200;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('stok_obat')
      .insert(chunk)
      .select('id');
    if (error) throw error;
    for (const row of data || []) ids.push(row.id);
  }
  return { masuk: ids.length, ids };
}

function sessionInfoPayload(session) {
  return buildStokWarningInfo(session.items || [], session.knownKodeSet || null, {
    pendingPenandaan: session.pendingPenandaan || [],
  });
}

function cutoffThreeMonths() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString();
}

function monthKeyWib(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

// ---------------------------------------------------------------------------
// GET /api/stok — stok terkini (snapshot upload terakhir), per kode × gudang
// ---------------------------------------------------------------------------
router.get('/', requireMenuAksi('stok', 'lihat'), async (_req, res) => {
  try {
    const { data: latestBatch, error: batchErr } = await supabase
      .from('stok_upload_batch')
      .select('id, nama_file, tanggal_upload, diupload_oleh, jumlah_baris_masuk')
      .order('tanggal_upload', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (batchErr) throw batchErr;

    if (!latestBatch) {
      return res.json({ batch: null, items: [], gudang_options: [], total_obat: 0 });
    }

    const rows = await fetchAllRows(() =>
      supabase
        .from('stok_obat')
        .select(
          'id, kode_obat, gudang, nama_obat, stok_qty, satuan, harga_1, harga_2, harga_3, no_batch, tanggal_expired, status'
        )
        .eq('upload_batch_id', latestBatch.id)
    );

    const stokIds = rows.map((r) => r.id).filter(Boolean);
    const penandaanByStokId = new Map();
    const idChunk = 200;
    for (let i = 0; i < stokIds.length; i += idChunk) {
      const slice = stokIds.slice(i, i + idChunk);
      const { data: penRows, error: penErr } = await supabase
        .from('stok_obat_penandaan')
        .select('id, stok_obat_id, jenis_tindakan, status')
        .eq('status', 'terbuka')
        .in('stok_obat_id', slice);
      if (penErr) throw penErr;
      for (const p of penRows || []) {
        penandaanByStokId.set(p.stok_obat_id, p);
      }
    }

    // Agregat per (kode_obat, gudang), lalu grup per kode_obat
    const byKodeGudang = new Map();
    const now = Date.now();
    const soonMs = 90 * 24 * 60 * 60 * 1000;
    const gudangSet = new Set();

    for (const row of rows) {
      const gudang = row.gudang || 'Retail';
      gudangSet.add(gudang);
      const key = `${row.kode_obat}\u0000${gudang}`;
      let slot = byKodeGudang.get(key);
      if (!slot) {
        slot = {
          kode_obat: row.kode_obat,
          gudang,
          nama_obat: row.nama_obat,
          stok_total: 0,
          satuan: row.satuan,
          harga_1: row.harga_1,
          harga_2: row.harga_2,
          harga_3: row.harga_3,
          jumlah_batch: 0,
          expired_lewat: 0,
          expired_segera: 0,
          penandaan_terbuka: 0,
        };
        byKodeGudang.set(key, slot);
      }
      slot.stok_total += Number(row.stok_qty) || 0;
      slot.jumlah_batch += 1;
      if (!slot.nama_obat && row.nama_obat) slot.nama_obat = row.nama_obat;
      if (slot.harga_1 == null && row.harga_1 != null) slot.harga_1 = row.harga_1;
      if (slot.harga_2 == null && row.harga_2 != null) slot.harga_2 = row.harga_2;
      if (slot.harga_3 == null && row.harga_3 != null) slot.harga_3 = row.harga_3;
      if (!slot.satuan && row.satuan) slot.satuan = row.satuan;
      if (penandaanByStokId.has(row.id)) slot.penandaan_terbuka += 1;

      if (row.tanggal_expired) {
        const t = new Date(row.tanggal_expired).getTime();
        if (!Number.isNaN(t)) {
          if (t < now) slot.expired_lewat += 1;
          else if (t - now <= soonMs) slot.expired_segera += 1;
        }
      }
    }

    const byKode = new Map();
    for (const slot of byKodeGudang.values()) {
      let obat = byKode.get(slot.kode_obat);
      if (!obat) {
        obat = {
          kode_obat: slot.kode_obat,
          nama_obat: slot.nama_obat,
          gudang_list: [],
          jumlah_batch: 0,
          expired_lewat: 0,
          expired_segera: 0,
          penandaan_terbuka: 0,
        };
        byKode.set(slot.kode_obat, obat);
      }
      if (!obat.nama_obat && slot.nama_obat) obat.nama_obat = slot.nama_obat;
      obat.gudang_list.push({
        gudang: slot.gudang,
        stok_total: slot.stok_total,
        satuan: slot.satuan,
        harga_1: slot.harga_1,
        harga_2: slot.harga_2,
        harga_3: slot.harga_3,
        jumlah_batch: slot.jumlah_batch,
        expired_lewat: slot.expired_lewat,
        expired_segera: slot.expired_segera,
        penandaan_terbuka: slot.penandaan_terbuka,
      });
      obat.jumlah_batch += slot.jumlah_batch;
      obat.expired_lewat += slot.expired_lewat;
      obat.expired_segera += slot.expired_segera;
      obat.penandaan_terbuka += slot.penandaan_terbuka;
    }

    for (const obat of byKode.values()) {
      obat.gudang_list.sort((a, b) =>
        String(a.gudang).localeCompare(String(b.gudang), 'id')
      );
    }

    const items = [...byKode.values()].sort((a, b) =>
      String(a.nama_obat || a.kode_obat).localeCompare(
        String(b.nama_obat || b.kode_obat),
        'id'
      )
    );

    const gudang_options = [...gudangSet].sort((a, b) => a.localeCompare(b, 'id'));

    return res.json({
      batch: latestBatch,
      items,
      gudang_options,
      total_obat: items.length,
    });
  } catch (err) {
    console.error('[GET /stok]', err);
    return res.status(500).json({ error: err.message || 'Gagal memuat stok' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/stok/upload-batches
// ---------------------------------------------------------------------------
router.get(
  '/upload-batches',
  requireMenuAksi('stok', 'lihat'),
  async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from('stok_upload_batch')
        .select(
          'id, nama_file, jumlah_baris_masuk, jumlah_baris_skip, diupload_oleh, tanggal_upload'
        )
        .order('tanggal_upload', { ascending: false });
      if (error) throw error;
      return res.json({ items: data || [] });
    } catch (err) {
      console.error('[GET /stok/upload-batches]', err);
      return res.status(500).json({ error: err.message || 'Gagal memuat riwayat' });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/stok/upload-batches/:id — owner only
// ---------------------------------------------------------------------------
router.delete('/upload-batches/:id', requireOwner, async (req, res) => {
  try {
    const id = normalizeText(req.params.id);
    if (!id) return res.status(400).json({ error: 'id wajib' });

    const { data: batch, error: findErr } = await supabase
      .from('stok_upload_batch')
      .select('id, nama_file, jumlah_baris_masuk')
      .eq('id', id)
      .maybeSingle();
    if (findErr) throw findErr;
    if (!batch) return res.status(404).json({ error: 'Batch upload tidak ditemukan' });

    // CASCADE menghapus stok_obat; hitung dulu
    const { count, error: countErr } = await supabase
      .from('stok_obat')
      .select('id', { count: 'exact', head: true })
      .eq('upload_batch_id', id);
    if (countErr) throw countErr;

    const { error: delErr } = await supabase
      .from('stok_upload_batch')
      .delete()
      .eq('id', id);
    if (delErr) throw delErr;

    return res.json({
      ok: true,
      id,
      nama_file: batch.nama_file,
      baris_dihapus: count ?? batch.jumlah_baris_masuk ?? 0,
    });
  } catch (err) {
    console.error('[DELETE /stok/upload-batches/:id]', err);
    return res.status(500).json({ error: err.message || 'Gagal menghapus batch' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/stok/ringkas-preview — preview saja (owner)
// ---------------------------------------------------------------------------
router.get('/ringkas-preview', requireOwner, async (_req, res) => {
  try {
    const cutoff = cutoffThreeMonths();
    const rows = await fetchAllRows(() =>
      supabase
        .from('stok_obat')
        .select('id, kode_obat, gudang, tanggal_upload')
        .lt('tanggal_upload', cutoff)
    );

    if (!rows.length) {
      return res.json({
        cutoff,
        baris_detail: 0,
        pasangan_kode_bulan: 0,
        kode_obat: 0,
        bulan_dari: null,
        bulan_sampai: null,
        sudah_ada_ringkasan: 0,
      });
    }

    const existing = await fetchAllRows(() =>
      supabase.from('stok_obat_ringkasan_bulanan').select('kode_obat, gudang, bulan')
    );
    const existingKeys = new Set(
      existing.map((r) => `${r.kode_obat}\u0000${r.gudang || 'Retail'}\u0000${r.bulan}`)
    );

    const pairs = new Map();
    for (const row of rows) {
      const bulan = monthKeyWib(row.tanggal_upload);
      if (!bulan) continue;
      const gudang = row.gudang || 'Retail';
      const key = `${row.kode_obat}\u0000${gudang}\u0000${bulan}`;
      if (existingKeys.has(key)) continue;
      pairs.set(key, (pairs.get(key) || 0) + 1);
    }

    const willSummarizeKeys = new Set(pairs.keys());
    let barisAkanDihapus = 0;
    const bulans = [];
    for (const row of rows) {
      const bulan = monthKeyWib(row.tanggal_upload);
      if (!bulan) continue;
      const gudang = row.gudang || 'Retail';
      const key = `${row.kode_obat}\u0000${gudang}\u0000${bulan}`;
      if (existingKeys.has(key) || willSummarizeKeys.has(key)) {
        barisAkanDihapus += 1;
        bulans.push(bulan);
      }
    }
    bulans.sort();

    return res.json({
      cutoff,
      baris_detail: barisAkanDihapus,
      pasangan_kode_bulan: pairs.size,
      kode_obat: new Set([...pairs.keys()].map((k) => k.split('\u0000')[0])).size,
      bulan_dari: bulans[0] || null,
      bulan_sampai: bulans[bulans.length - 1] || null,
      sudah_ada_ringkasan: existingKeys.size,
    });
  } catch (err) {
    console.error('[GET /stok/ringkas-preview]', err);
    return res.status(500).json({ error: err.message || 'Gagal preview ringkas' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stok/ringkas-lama — eksekusi atomic via RPC (owner)
// ---------------------------------------------------------------------------
router.post('/ringkas-lama', requireOwner, async (_req, res) => {
  try {
    const cutoff = cutoffThreeMonths();
    const { data, error } = await supabase.rpc('ringkas_stok_obat_lama', {
      p_cutoff: cutoff,
    });
    if (error) throw error;
    return res.json(data || {});
  } catch (err) {
    console.error('[POST /stok/ringkas-lama]', err);
    return res.status(500).json({
      error: err.message || 'Gagal meringkas data lama',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stok/parse-preview
// ---------------------------------------------------------------------------
router.post(
  '/parse-preview',
  requireMenuAksi('stok', 'tambah'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'File Excel (.xlsx) wajib diupload' });
      }

      const originalName = String(req.file.originalname || 'upload.xlsx');
      const nameLower = originalName.toLowerCase();
      if (!nameLower.endsWith('.xlsx') && !nameLower.endsWith('.xls')) {
        return res.status(400).json({ error: 'Hanya file Excel (.xlsx) yang diterima' });
      }

      const knownKodeSet = await loadKnownKodeSet();
      let parsed;
      try {
        parsed = parseStokExcel(req.file.buffer, { knownKodeSet });
      } catch (parseErr) {
        const msg = parseErr?.message || '';
        if (msg.includes('tidak bisa dibaca') || msg.includes('bukan Excel')) {
          return res.status(400).json({ error: msg });
        }
        throw parseErr;
      }

      if (!parsed.items.length) {
        return res.status(400).json({
          error: 'Tidak ada baris data valid dari file Excel',
          warnings: parsed.warnings,
        });
      }

      const diuploadOleh = actorFromReq(req);
      const sessionId = createUploadSession({
        type: 'stok',
        items: parsed.items,
        diuploadOleh,
        namaFile: originalName,
        barisSkip: parsed.baris_skip,
        knownKodeSet,
        pendingPenandaan: [],
      });

      return res.json({
        session_id: sessionId,
        nama_file: originalName,
        sample: parsed.sample,
        total_baris: parsed.total_baris_valid,
        total_baris_file: parsed.total_baris_file,
        baris_skip: parsed.baris_skip,
        info: parsed.info,
        warnings: parsed.warnings,
        headers: parsed.headers,
        repaired: Boolean(parsed.repaired),
        style_replacements: parsed.style_replacements || 0,
      });
    } catch (err) {
      console.error('[POST /stok/parse-preview]', err);
      return res.status(400).json({ error: err.message || 'Gagal parse Excel' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/stok/sessions/:sessionId/info — refresh warning (setelah tambah obat)
// ---------------------------------------------------------------------------
router.get(
  '/sessions/:sessionId/info',
  requireMenuAksi('stok', 'tambah'),
  async (req, res) => {
    try {
      const sessionId = normalizeText(req.params.sessionId);
      const session = getUploadSession(sessionId);
      if (!session || session.type !== 'stok') {
        return res.status(410).json({
          error: 'Sesi preview sudah habis atau tidak valid — upload ulang file',
        });
      }
      const knownKodeSet = await loadKnownKodeSet();
      updateUploadSession(sessionId, { knownKodeSet });
      session.knownKodeSet = knownKodeSet;
      return res.json({ info: sessionInfoPayload(session) });
    } catch (err) {
      console.error('[GET /stok/sessions/:id/info]', err);
      return res.status(500).json({ error: err.message || 'Gagal refresh info' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/stok/sessions/:sessionId/tandai — tandai di preview (sebelum confirm)
// ---------------------------------------------------------------------------
router.post(
  '/sessions/:sessionId/tandai',
  requireMenuAksi('stok', 'edit'),
  async (req, res) => {
    try {
      const sessionId = normalizeText(req.params.sessionId);
      const session = getUploadSession(sessionId);
      if (!session || session.type !== 'stok') {
        return res.status(410).json({
          error: 'Sesi preview sudah habis atau tidak valid — upload ulang file',
        });
      }

      const itemIndex = Number(req.body?.item_index);
      const jenis = normalizeText(req.body?.jenis_tindakan);
      const catatan = normalizeText(req.body?.catatan) || null;

      if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= session.items.length) {
        return res.status(400).json({ error: 'item_index tidak valid' });
      }
      if (!JENIS_TINDAKAN_STOK.has(jenis)) {
        return res.status(400).json({
          error: "jenis_tindakan harus 'karantina', 'jual_prioritas', atau 'lainnya'",
        });
      }

      const pending = [...(session.pendingPenandaan || [])];
      const existingIdx = pending.findIndex((p) => p.item_index === itemIndex);
      const entry = {
        item_index: itemIndex,
        jenis_tindakan: jenis,
        catatan,
        ditandai_oleh: actorFromReq(req),
      };
      if (existingIdx >= 0) pending[existingIdx] = entry;
      else pending.push(entry);

      updateUploadSession(sessionId, { pendingPenandaan: pending });
      session.pendingPenandaan = pending;

      return res.json({
        ok: true,
        pending_count: pending.length,
        info: sessionInfoPayload(session),
      });
    } catch (err) {
      console.error('[POST /stok/sessions/:id/tandai]', err);
      return res.status(500).json({ error: err.message || 'Gagal menandai' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/stok/obat/:kodeObat/batches — detail batch ED di snapshot terkini
// ---------------------------------------------------------------------------
router.get(
  '/obat/:kodeObat/batches',
  requireMenuAksi('stok', 'lihat'),
  async (req, res) => {
    try {
      const kodeObat = normalizeText(req.params.kodeObat);
      if (!kodeObat) {
        return res.status(400).json({ error: 'kode_obat wajib' });
      }

      const { data: latestBatch, error: batchErr } = await supabase
        .from('stok_upload_batch')
        .select('id')
        .order('tanggal_upload', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (batchErr) throw batchErr;
      if (!latestBatch) return res.json({ items: [] });

      const { data: rows, error } = await supabase
        .from('stok_obat')
        .select(
          'id, kode_obat, gudang, nama_obat, no_batch, tanggal_expired, stok_qty, satuan, status'
        )
        .eq('upload_batch_id', latestBatch.id)
        .eq('kode_obat', kodeObat)
        .order('gudang', { ascending: true })
        .order('tanggal_expired', { ascending: true });
      if (error) throw error;

      const list = rows || [];
      const ids = list.map((r) => r.id);
      const penMap = new Map();
      if (ids.length) {
        const { data: pens, error: penErr } = await supabase
          .from('stok_obat_penandaan')
          .select('id, stok_obat_id, jenis_tindakan, catatan, status, ditandai_oleh, tanggal_tandai')
          .eq('status', 'terbuka')
          .in('stok_obat_id', ids);
        if (penErr) throw penErr;
        for (const p of pens || []) penMap.set(p.stok_obat_id, p);
      }

      const now = Date.now();
      const soonMs = 90 * 24 * 60 * 60 * 1000;
      const items = list.map((row) => {
        let ed_status = null;
        if (row.tanggal_expired) {
          const t = new Date(row.tanggal_expired).getTime();
          if (!Number.isNaN(t)) {
            if (t < now) ed_status = 'lewat';
            else if (t - now <= soonMs) ed_status = 'mendekati';
          }
        }
        return {
          ...row,
          ed_status,
          penandaan: penMap.get(row.id) || null,
        };
      });

      return res.json({ items });
    } catch (err) {
      console.error('[GET /stok/obat/:kode/batches]', err);
      return res.status(500).json({ error: err.message || 'Gagal memuat batch' });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /api/stok/penandaan — list penandaan (default terbuka)
// ---------------------------------------------------------------------------
router.get('/penandaan', requireMenuAksi('stok', 'lihat'), async (req, res) => {
  try {
    const status = normalizeText(req.query.status) || 'terbuka';
    if (status !== 'terbuka' && status !== 'selesai') {
      return res.status(400).json({ error: "status harus 'terbuka' atau 'selesai'" });
    }

    const jenisFilter = normalizeText(req.query.jenis_tindakan);
    if (jenisFilter && !JENIS_TINDAKAN_ALL.has(jenisFilter)) {
      return res.status(400).json({ error: 'jenis_tindakan tidak valid' });
    }

    let q = supabase
      .from('stok_obat_penandaan')
      .select(
        'id, stok_obat_id, kode_obat, jenis_tindakan, catatan, ditandai_oleh, tanggal_tandai, status, diselesaikan_oleh, tanggal_selesai'
      )
      .eq('status', status)
      .order('tanggal_tandai', { ascending: false });
    if (jenisFilter) q = q.eq('jenis_tindakan', jenisFilter);

    const { data: pens, error } = await q;
    if (error) throw error;

    const list = pens || [];
    const stokIds = [...new Set(list.map((p) => p.stok_obat_id).filter(Boolean))];
    const stokMap = new Map();
    const chunk = 200;
    for (let i = 0; i < stokIds.length; i += chunk) {
      const slice = stokIds.slice(i, i + chunk);
      const { data: stoks, error: stokErr } = await supabase
        .from('stok_obat')
        .select(
          'id, kode_obat, nama_obat, gudang, no_batch, tanggal_expired, stok_qty, satuan, golongan_vmedis, upload_batch_id'
        )
        .in('id', slice);
      if (stokErr) throw stokErr;
      for (const s of stoks || []) stokMap.set(s.id, s);
    }

    // Enrich nama/satuan/golongan untuk penandaan kode-only (tambah_ke_obat_yelo)
    const kodeOnly = [
      ...new Set(
        list
          .filter((p) => !p.stok_obat_id && p.kode_obat)
          .map((p) => p.kode_obat)
      ),
    ];
    const metaByKode = new Map();
    for (let i = 0; i < kodeOnly.length; i += chunk) {
      const slice = kodeOnly.slice(i, i + chunk);
      const { data: stoks, error: stokErr } = await supabase
        .from('stok_obat')
        .select('kode_obat, nama_obat, satuan, golongan_vmedis, tanggal_upload')
        .in('kode_obat', slice)
        .order('tanggal_upload', { ascending: false });
      if (stokErr) throw stokErr;
      for (const s of stoks || []) {
        if (metaByKode.has(s.kode_obat)) continue;
        metaByKode.set(s.kode_obat, {
          nama_obat: s.nama_obat || null,
          satuan: s.satuan || null,
          golongan_vmedis: s.golongan_vmedis || null,
        });
      }
    }

    const items = list.map((p) => {
      const stok = p.stok_obat_id ? stokMap.get(p.stok_obat_id) || null : null;
      const kode = p.kode_obat || stok?.kode_obat || null;
      const meta = kode ? metaByKode.get(kode) : null;
      return {
        ...p,
        kode_obat: kode,
        stok,
        nama_obat: stok?.nama_obat || meta?.nama_obat || null,
        satuan: stok?.satuan || meta?.satuan || null,
        golongan_vmedis: stok?.golongan_vmedis || meta?.golongan_vmedis || null,
        otomatis: p.ditandai_oleh === AUTO_DITANDAI_OLEH,
      };
    });

    return res.json({ items, total: items.length });
  } catch (err) {
    console.error('[GET /stok/penandaan]', err);
    return res.status(500).json({ error: err.message || 'Gagal memuat penandaan' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/stok/penandaan — tandai baris stok tersimpan
// ---------------------------------------------------------------------------
router.post('/penandaan', requireMenuAksi('stok', 'edit'), async (req, res) => {
  try {
    const stokObatId = normalizeText(req.body?.stok_obat_id);
    const jenis = normalizeText(req.body?.jenis_tindakan);
    const catatan = normalizeText(req.body?.catatan) || null;

    if (!stokObatId) {
      return res.status(400).json({ error: 'stok_obat_id wajib diisi' });
    }
    if (!JENIS_TINDAKAN_STOK.has(jenis)) {
      return res.status(400).json({
        error: "jenis_tindakan harus 'karantina', 'jual_prioritas', atau 'lainnya'",
      });
    }

    const { data: stok, error: stokErr } = await supabase
      .from('stok_obat')
      .select('id')
      .eq('id', stokObatId)
      .maybeSingle();
    if (stokErr) throw stokErr;
    if (!stok) return res.status(404).json({ error: 'Baris stok tidak ditemukan' });

    const { data: existing, error: exErr } = await supabase
      .from('stok_obat_penandaan')
      .select('id')
      .eq('stok_obat_id', stokObatId)
      .eq('status', 'terbuka')
      .maybeSingle();
    if (exErr) throw exErr;
    if (existing) {
      return res.status(409).json({
        error: 'Baris ini sudah ditandai dan masih terbuka',
        id: existing.id,
      });
    }

    const { data, error } = await supabase
      .from('stok_obat_penandaan')
      .insert({
        stok_obat_id: stokObatId,
        jenis_tindakan: jenis,
        catatan,
        ditandai_oleh: actorFromReq(req),
        status: 'terbuka',
      })
      .select(
        'id, stok_obat_id, kode_obat, jenis_tindakan, catatan, ditandai_oleh, tanggal_tandai, status'
      )
      .single();
    if (error) throw error;

    return res.status(201).json(data);
  } catch (err) {
    console.error('[POST /stok/penandaan]', err);
    return res.status(500).json({ error: err.message || 'Gagal menandai' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/stok/penandaan/:id — ubah jenis_tindakan (stok only)
// ---------------------------------------------------------------------------
router.patch(
  '/penandaan/:id',
  requireMenuAksi('stok', 'edit'),
  async (req, res) => {
    try {
      const id = normalizeText(req.params.id);
      const jenis = normalizeText(req.body?.jenis_tindakan);
      const catatan =
        req.body?.catatan === undefined
          ? undefined
          : normalizeText(req.body.catatan) || null;

      if (!id) return res.status(400).json({ error: 'id wajib' });
      if (!JENIS_TINDAKAN_STOK.has(jenis)) {
        return res.status(400).json({
          error: "jenis_tindakan harus 'karantina', 'jual_prioritas', atau 'lainnya'",
        });
      }

      const { data: existing, error: exErr } = await supabase
        .from('stok_obat_penandaan')
        .select('id, status, jenis_tindakan, stok_obat_id')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'Penandaan tidak ditemukan' });
      if (existing.status !== 'terbuka') {
        return res.status(400).json({ error: 'Hanya penandaan terbuka yang bisa diubah' });
      }
      if (existing.jenis_tindakan === 'tambah_ke_obat_yelo' || !existing.stok_obat_id) {
        return res.status(400).json({
          error: 'Penandaan tambah ke Obat Yelo tidak bisa diubah jenisnya di sini',
        });
      }

      const patch = { jenis_tindakan: jenis };
      if (catatan !== undefined) patch.catatan = catatan;

      const { data, error } = await supabase
        .from('stok_obat_penandaan')
        .update(patch)
        .eq('id', id)
        .select(
          'id, stok_obat_id, kode_obat, jenis_tindakan, catatan, ditandai_oleh, tanggal_tandai, status'
        )
        .single();
      if (error) throw error;

      return res.json(data);
    } catch (err) {
      console.error('[PATCH /stok/penandaan/:id]', err);
      return res.status(500).json({ error: err.message || 'Gagal mengubah penandaan' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/stok/penandaan/:id/selesai
// ---------------------------------------------------------------------------
router.post(
  '/penandaan/:id/selesai',
  async (req, res) => {
    try {
      const id = normalizeText(req.params.id);
      if (!id) return res.status(400).json({ error: 'id wajib' });

      const { data: existing, error: exErr } = await supabase
        .from('stok_obat_penandaan')
        .select('id, status, jenis_tindakan')
        .eq('id', id)
        .maybeSingle();
      if (exErr) throw exErr;
      if (!existing) return res.status(404).json({ error: 'Penandaan tidak ditemukan' });
      if (existing.status === 'selesai') {
        return res.json({ id, status: 'selesai', already: true });
      }

      const isOwner = req.user?.is_owner === true;
      if (!isOwner) {
        const perms = await listUserPermissions(req.user);
        const has = (menu, aksi) =>
          perms.some((p) => p.menu === menu && p.aksi === aksi);
        const bolehEdit = has('stok', 'edit');
        const bolehTambahObat =
          existing.jenis_tindakan === 'tambah_ke_obat_yelo' &&
          has('data-obat-yelo', 'tambah');
        if (!bolehEdit && !bolehTambahObat) {
          return res.status(403).json({
            error: 'Tidak punya izin menutup penandaan ini',
          });
        }
      }

      const { data, error } = await supabase
        .from('stok_obat_penandaan')
        .update({
          status: 'selesai',
          diselesaikan_oleh: actorFromReq(req),
          tanggal_selesai: new Date().toISOString(),
        })
        .eq('id', id)
        .select(
          'id, stok_obat_id, kode_obat, jenis_tindakan, catatan, status, diselesaikan_oleh, tanggal_selesai'
        )
        .single();
      if (error) throw error;

      return res.json(data);
    } catch (err) {
      console.error('[POST /stok/penandaan/:id/selesai]', err);
      return res.status(500).json({ error: err.message || 'Gagal menutup penandaan' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/stok/confirm — insert + auto-penandaan warning
// ---------------------------------------------------------------------------
router.post('/confirm', requireMenuAksi('stok', 'tambah'), async (req, res) => {
  try {
    const sessionId = normalizeText(req.body?.session_id);
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id wajib diisi' });
    }

    const session = consumeUploadSession(sessionId);
    if (!session || session.type !== 'stok') {
      return res.status(410).json({
        error: 'Sesi preview sudah habis atau tidak valid — upload ulang file',
      });
    }

    if (!session.items?.length) {
      return res.status(400).json({ error: 'Tidak ada baris valid untuk disimpan' });
    }

    const diuploadOleh = session.diuploadOleh || actorFromReq(req);
    const namaFile = normalizeText(session.namaFile) || 'upload.xlsx';
    const tanggalUpload = new Date().toISOString();
    const barisSkip = Number(session.barisSkip) || 0;

    const { data: batch, error: batchErr } = await supabase
      .from('stok_upload_batch')
      .insert({
        nama_file: namaFile,
        jumlah_baris_masuk: session.items.length,
        jumlah_baris_skip: barisSkip,
        diupload_oleh: diuploadOleh,
        tanggal_upload: tanggalUpload,
      })
      .select('id')
      .single();
    if (batchErr) throw batchErr;

    let insertResult;
    try {
      insertResult = await insertStokRows(session.items, {
        uploadBatchId: batch.id,
        diuploadOleh,
        tanggalUpload,
      });
    } catch (insertErr) {
      await supabase.from('stok_upload_batch').delete().eq('id', batch.id);
      throw insertErr;
    }

    const { masuk, ids } = insertResult;
    if (masuk !== session.items.length) {
      await supabase
        .from('stok_upload_batch')
        .update({ jumlah_baris_masuk: masuk })
        .eq('id', batch.id);
    }

    let penandaanMasuk = 0;
    const pending = session.pendingPenandaan || [];
    const markedStokIds = new Set();
    const pendingRows = [];

    for (const p of pending) {
      const idx = p.item_index;
      if (!Number.isInteger(idx) || idx < 0 || idx >= ids.length) continue;
      if (!JENIS_TINDAKAN_STOK.has(p.jenis_tindakan)) continue;
      const stokId = ids[idx];
      if (markedStokIds.has(stokId)) continue;
      markedStokIds.add(stokId);
      pendingRows.push({
        stok_obat_id: stokId,
        jenis_tindakan: p.jenis_tindakan,
        catatan: p.catatan || null,
        ditandai_oleh: p.ditandai_oleh || diuploadOleh,
        status: 'terbuka',
      });
    }

    try {
      penandaanMasuk += await insertPenandaanChunked(pendingRows);
    } catch (penErr) {
      console.error('[confirm] gagal insert penandaan manual:', penErr.message);
    }

    // Auto-tandai dari warning parsing (pakai known set terkini)
    try {
      const knownKodeSet = await loadKnownKodeSet();
      const info = buildStokWarningInfo(session.items, knownKodeSet);
      const openTambahKodes = await loadOpenTambahKodeSet();
      const openLogicalKeys = await loadOpenStokLogicalKeySet();
      const autoRows = [];

      const queuedTambah = new Set();
      for (const row of info.kode_tidak_dikenal || []) {
        const kode = row.kode_obat;
        if (!kode || openTambahKodes.has(kode) || queuedTambah.has(kode)) continue;
        queuedTambah.add(kode);
        autoRows.push({
          stok_obat_id: null,
          kode_obat: kode,
          jenis_tindakan: 'tambah_ke_obat_yelo',
          catatan: 'Otomatis ditandai: kode belum ada di master Obat Yelo saat upload',
          ditandai_oleh: AUTO_DITANDAI_OLEH,
          status: 'terbuka',
        });
      }

      for (const row of info.sudah_lewat_expired || []) {
        const idx = row.item_index;
        if (!Number.isInteger(idx) || idx < 0 || idx >= ids.length) continue;
        const stokId = ids[idx];
        if (markedStokIds.has(stokId)) continue;
        const key = stokLogicalKey(session.items[idx]);
        if (openLogicalKeys.has(key)) continue;
        markedStokIds.add(stokId);
        openLogicalKeys.add(key);
        autoRows.push({
          stok_obat_id: stokId,
          jenis_tindakan: 'karantina',
          catatan:
            'Otomatis ditandai: sudah lewat tanggal expired saat upload',
          ditandai_oleh: AUTO_DITANDAI_OLEH,
          status: 'terbuka',
        });
      }

      for (const row of info.mendekati_expired || []) {
        const idx = row.item_index;
        if (!Number.isInteger(idx) || idx < 0 || idx >= ids.length) continue;
        const stokId = ids[idx];
        if (markedStokIds.has(stokId)) continue;
        const key = stokLogicalKey(session.items[idx]);
        if (openLogicalKeys.has(key)) continue;
        markedStokIds.add(stokId);
        openLogicalKeys.add(key);
        autoRows.push({
          stok_obat_id: stokId,
          jenis_tindakan: 'jual_prioritas',
          catatan:
            'Otomatis ditandai: mendekati expired (≤90 hari) saat upload',
          ditandai_oleh: AUTO_DITANDAI_OLEH,
          status: 'terbuka',
        });
      }

      penandaanMasuk += await insertPenandaanChunked(autoRows);
    } catch (autoErr) {
      console.error('[confirm] gagal auto-penandaan:', autoErr.message || autoErr);
    }

    return res.status(201).json({
      masuk,
      di_skip: barisSkip,
      upload_batch_id: batch.id,
      nama_file: namaFile,
      total_file: session.items.length + barisSkip,
      penandaan_masuk: penandaanMasuk,
    });
  } catch (err) {
    console.error('[POST /stok/confirm]', err);
    return res.status(500).json({ error: err.message || 'Gagal menyimpan stok' });
  }
});

module.exports = router;
