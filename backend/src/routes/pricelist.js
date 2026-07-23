const express = require('express');
const multer = require('multer');
const { supabase } = require('../db');
const { parseWorkbook, detectHeaders, extractMappedRows } = require('../lib/excel');
const {
  createUploadSession,
  consumeUploadSession,
} = require('../lib/uploadSessions');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeBaris(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) return null;
  return num;
}

function formatKode(inisial, seq) {
  return `${inisial}-${String(seq).padStart(5, '0')}`;
}

function parseKodeSeq(kodePbf, inisial) {
  const prefix = `${inisial}-`;
  if (!kodePbf?.startsWith(prefix)) return 0;
  const n = Number(kodePbf.slice(prefix.length));
  return Number.isFinite(n) ? n : 0;
}

function mappingFromBody(body) {
  return {
    nama_kolom_barang: normalizeText(body?.nama_kolom_barang),
    nama_kolom_qty: normalizeText(body?.nama_kolom_qty),
    nama_kolom_harga: normalizeText(body?.nama_kolom_harga),
    nama_kolom_satuan: normalizeText(body?.nama_kolom_satuan),
    baris_mulai_data: normalizeBaris(body?.baris_mulai_data),
  };
}

async function getSupplier(pbfId) {
  const { data, error } = await supabase
    .from('supplier')
    .select('id, nama, inisial')
    .eq('id', pbfId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getTemplate(pbfId) {
  const { data, error } = await supabase
    .from('pricelist_template_mapping')
    .select('*')
    .eq('pbf_id', pbfId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function upsertTemplate(pbfId, mapping) {
  const existing = await getTemplate(pbfId);
  const payload = {
    pbf_id: pbfId,
    nama_kolom_barang: mapping.nama_kolom_barang,
    nama_kolom_qty: mapping.nama_kolom_qty,
    nama_kolom_harga: mapping.nama_kolom_harga,
    nama_kolom_satuan: mapping.nama_kolom_satuan,
    baris_mulai_data: mapping.baris_mulai_data,
  };

  if (existing) {
    const { data, error } = await supabase
      .from('pricelist_template_mapping')
      .update(payload)
      .eq('pbf_id', pbfId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('pricelist_template_mapping')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

async function fetchLatestByKode(pbfId) {
  const { data, error } = await supabase
    .from('pricelist')
    .select('*')
    .eq('pbf_id', pbfId)
    .order('tanggal_upload', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.kode_pbf)) map.set(row.kode_pbf, row);
  }
  return map;
}

async function fetchNamaToKode(pbfId) {
  const { data, error } = await supabase
    .from('pricelist')
    .select('nama_barang, kode_pbf, tanggal_upload')
    .eq('pbf_id', pbfId)
    .order('tanggal_upload', { ascending: false });

  if (error) throw error;

  const map = new Map();
  for (const row of data || []) {
    const key = String(row.nama_barang || '').trim().toLowerCase();
    if (!key || map.has(key)) continue;
    map.set(key, row.kode_pbf);
  }
  return map;
}

async function nextSeq(pbfId, inisial) {
  const { data, error } = await supabase
    .from('pricelist')
    .select('kode_pbf')
    .eq('pbf_id', pbfId);

  if (error) throw error;

  let max = 0;
  for (const row of data || []) {
    max = Math.max(max, parseKodeSeq(row.kode_pbf, inisial));
  }
  return max + 1;
}

async function persistPricelistInserts({ pbfId, supplier, items, diuploadOleh }) {
  const namaToKode = await fetchNamaToKode(pbfId);
  const latestBefore = await fetchLatestByKode(pbfId);
  let seq = await nextSeq(pbfId, supplier.inisial);

  const uploadAt = new Date().toISOString();
  const inserts = [];
  const kodeInUpload = new Set();
  let barangBaru = 0;

  for (const item of items) {
    const key = item.nama_barang.trim().toLowerCase();
    let kode = namaToKode.get(key);
    if (!kode) {
      kode = formatKode(supplier.inisial, seq);
      seq += 1;
      namaToKode.set(key, kode);
      barangBaru += 1;
    }
    kodeInUpload.add(kode);

    inserts.push({
      pbf_id: pbfId,
      kode_pbf: kode,
      nama_barang: item.nama_barang.trim(),
      satuan: item.satuan || null,
      qty: item.qty,
      harga_dasar: item.harga_dasar,
      catatan_kondisi: item.catatan_kondisi,
      tanggal_upload: uploadAt,
      diupload_oleh: diuploadOleh,
      auto_kosong: false,
    });
  }

  let autoKosong = 0;
  for (const [kode, last] of latestBefore.entries()) {
    if (kodeInUpload.has(kode)) continue;
    inserts.push({
      pbf_id: pbfId,
      kode_pbf: kode,
      nama_barang: last.nama_barang,
      satuan: last.satuan,
      qty: 0,
      harga_dasar: last.harga_dasar,
      catatan_kondisi: last.catatan_kondisi,
      tanggal_upload: uploadAt,
      diupload_oleh: diuploadOleh,
      auto_kosong: true,
    });
    autoKosong += 1;
  }

  const chunkSize = 200;
  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    const { error } = await supabase.from('pricelist').insert(chunk);
    if (error) throw error;
  }

  return {
    baris_diproses: items.length,
    barang_baru: barangBaru,
    auto_kosong: autoKosong,
  };
}

// GET /api/pricelist?pbf_id=
router.get('/', async (req, res) => {
  try {
    const pbfId = normalizeText(req.query.pbf_id);
    if (!pbfId) {
      return res.status(400).json({ error: 'pbf_id wajib diisi' });
    }

    const latestMap = await fetchLatestByKode(pbfId);
    const list = [...latestMap.values()].sort((a, b) =>
      String(a.nama_barang).localeCompare(String(b.nama_barang), 'id')
    );
    return res.json(list);
  } catch (err) {
    console.error('[GET /pricelist]', err);
    return res.status(500).json({ error: 'Gagal mengambil pricelist' });
  }
});

// POST /api/pricelist/preview — headers only (untuk form mapping)
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'File Excel wajib diupload' });
    }

    const barisHint = normalizeBaris(req.body?.baris_mulai_data) || 2;
    const { sheetName, rows } = parseWorkbook(req.file.buffer);
    const { headers, headerRowIndex, previewRows } = detectHeaders(rows, barisHint);

    if (!headers.length) {
      return res.status(400).json({ error: 'Tidak ada header kolom yang terdeteksi' });
    }

    return res.json({
      sheet_name: sheetName,
      headers,
      header_row: headerRowIndex + 1,
      suggested_baris_mulai_data: headerRowIndex + 2,
      preview_rows: previewRows,
    });
  } catch (err) {
    console.error('[POST /pricelist/preview]', err);
    return res.status(400).json({ error: err.message || 'Gagal mem-preview file Excel' });
  }
});

// POST /api/pricelist/parse-preview — tahap 1: parse + session, NO DB write
router.post('/parse-preview', upload.single('file'), async (req, res) => {
  try {
    const pbfId = normalizeText(req.body?.pbf_id);
    if (!pbfId) {
      return res.status(400).json({ error: 'pbf_id wajib diisi' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'File Excel wajib diupload' });
    }

    const supplier = await getSupplier(pbfId);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier/PBF tidak ditemukan' });
    }

    const bodyMapping = mappingFromBody(req.body);
    const existingTemplate = await getTemplate(pbfId);

    let mapping = null;
    if (bodyMapping.nama_kolom_barang) {
      if (!bodyMapping.baris_mulai_data) {
        return res.status(400).json({ error: 'baris_mulai_data wajib diisi' });
      }
      mapping = bodyMapping;
    } else if (existingTemplate) {
      mapping = {
        nama_kolom_barang: existingTemplate.nama_kolom_barang,
        nama_kolom_qty: existingTemplate.nama_kolom_qty,
        nama_kolom_harga: existingTemplate.nama_kolom_harga,
        nama_kolom_satuan: existingTemplate.nama_kolom_satuan,
        baris_mulai_data: existingTemplate.baris_mulai_data,
      };
    } else {
      return res.status(400).json({
        error: 'Template belum ada — kirim mapping kolom terlebih dahulu',
      });
    }

    const { rows } = parseWorkbook(req.file.buffer);
    const { items, warnings } = extractMappedRows(rows, mapping);

    if (!items.length && !(warnings?.total_baris_terdeteksi > 0)) {
      return res.status(400).json({ error: 'Tidak ada baris data yang bisa diproses dari file' });
    }

    const sample = items.slice(0, 10).map((item) => ({
      nama_barang: item.nama_barang,
      satuan: item.satuan,
      qty: item.qty,
      harga_dasar: item.harga_dasar,
      catatan_kondisi: item.catatan_kondisi,
      __row: item.__row,
      __flags: item.__flags,
    }));

    const sessionId = createUploadSession({
      pbfId,
      mapping,
      items: items.map(({ __flags, ...rest }) => rest),
      diuploadOleh: normalizeText(req.body?.diupload_oleh),
      supplierInisial: supplier.inisial,
    });

    return res.json({
      session_id: sessionId,
      pbf_id: pbfId,
      mapping,
      sample,
      warnings,
      baris_valid: items.length,
    });
  } catch (err) {
    console.error('[POST /pricelist/parse-preview]', err);
    return res.status(400).json({ error: err.message || 'Gagal parse preview' });
  }
});

// POST /api/pricelist/confirm — tahap 2: simpan template + insert riwayat
router.post('/confirm', async (req, res) => {
  try {
    const sessionId = normalizeText(req.body?.session_id);
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id wajib diisi' });
    }

    const session = consumeUploadSession(sessionId);
    if (!session) {
      return res.status(410).json({
        error: 'Sesi preview sudah habis atau tidak valid — upload ulang file',
      });
    }

    const supplier = await getSupplier(session.pbfId);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier/PBF tidak ditemukan' });
    }

    if (!session.items?.length) {
      return res.status(400).json({ error: 'Tidak ada baris valid untuk disimpan' });
    }

    const template = await upsertTemplate(session.pbfId, session.mapping);
    const summary = await persistPricelistInserts({
      pbfId: session.pbfId,
      supplier,
      items: session.items,
      diuploadOleh: session.diuploadOleh,
    });

    return res.status(201).json({
      pbf_id: session.pbfId,
      template_id: template.id,
      ...summary,
    });
  } catch (err) {
    console.error('[POST /pricelist/confirm]', err);
    return res.status(500).json({ error: err.message || 'Gagal menyimpan pricelist' });
  }
});

module.exports = router;
