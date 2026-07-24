const express = require('express');
const multer = require('multer');
const { supabase } = require('../db');
const { parseWorkbook, detectHeaders, extractMappedRows } = require('../lib/excel');
const {
  extractPdfPages,
  buildMappingPreviewRows,
  extractMappedPdfRows,
  normalizeKolomPosisi,
  normalizeFormatAngka,
  sampleFromItems,
} = require('../lib/pdf');
const {
  createUploadSession,
  getUploadSession,
  updateUploadSession,
  consumeUploadSession,
} = require('../lib/uploadSessions');
const {
  requireAuth,
  requireApproved,
  requireMenuAksi,
} = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireApproved);

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

/** PDF→Excel misread thousand separator: multiply harga & qty by 1000. Null stays null. */
function scaleNumericField(value, factor) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return num * factor;
}

function applyScaleBy1000(items, enabled) {
  if (!enabled) return items;
  return (items || []).map((item) => ({
    ...item,
    // Jangan kalikan qty simbol/estimasi SBS (*, **, blank→999)
    qty: item.qty_estimasi ? item.qty : scaleNumericField(item.qty, 1000),
    harga_dasar: scaleNumericField(item.harga_dasar, 1000),
  }));
}

function parseScaleBy1000(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'true') return true;
  return false;
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
  const tipeSumber = mapping.tipe_sumber === 'pdf' ? 'pdf' : 'excel';
  const payload =
    tipeSumber === 'pdf'
      ? {
          pbf_id: pbfId,
          tipe_sumber: 'pdf',
          kolom_posisi: mapping.kolom_posisi,
          format_angka: normalizeFormatAngka(mapping.format_angka),
          nama_kolom_barang: null,
          nama_kolom_qty: null,
          nama_kolom_harga: null,
          nama_kolom_satuan: null,
          baris_mulai_data: mapping.baris_mulai_data || 1,
        }
      : {
          pbf_id: pbfId,
          tipe_sumber: 'excel',
          kolom_posisi: null,
          format_angka: 'id',
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

function buildPreviewSessionPayload({
  pbfId,
  supplier,
  mapping,
  items,
  diuploadOleh,
  pages = null,
}) {
  return {
    kind: 'preview',
    pbfId,
    mapping,
    items: items.map(({ __flags, ...rest }) => rest),
    diuploadOleh,
    supplierInisial: supplier.inisial,
    scaleBy1000: false,
    pages,
  };
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
      qty_estimasi: Boolean(item.qty_estimasi),
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
      qty_estimasi: false,
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
router.get('/', requireMenuAksi('pricelist-pbf', 'lihat'), async (req, res) => {
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
router.post('/preview', requireMenuAksi('pricelist-pbf', 'tambah'), upload.single('file'), async (req, res) => {
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
router.post('/parse-preview', requireMenuAksi('pricelist-pbf', 'tambah'), upload.single('file'), async (req, res) => {
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
    const excelTemplate =
      existingTemplate && (existingTemplate.tipe_sumber || 'excel') === 'excel'
        ? existingTemplate
        : null;

    let mapping = null;
    if (bodyMapping.nama_kolom_barang) {
      if (!bodyMapping.baris_mulai_data) {
        return res.status(400).json({ error: 'baris_mulai_data wajib diisi' });
      }
      mapping = { ...bodyMapping, tipe_sumber: 'excel' };
    } else if (excelTemplate) {
      mapping = {
        tipe_sumber: 'excel',
        nama_kolom_barang: excelTemplate.nama_kolom_barang,
        nama_kolom_qty: excelTemplate.nama_kolom_qty,
        nama_kolom_harga: excelTemplate.nama_kolom_harga,
        nama_kolom_satuan: excelTemplate.nama_kolom_satuan,
        baris_mulai_data: excelTemplate.baris_mulai_data,
      };
    } else {
      return res.status(400).json({
        error:
          existingTemplate?.tipe_sumber === 'pdf'
            ? 'Template PBF ini untuk PDF — kirim mapping Excel baru atau upload PDF'
            : 'Template belum ada — kirim mapping kolom terlebih dahulu',
      });
    }

    const { rows } = parseWorkbook(req.file.buffer);
    const { items, warnings } = extractMappedRows(rows, mapping);

    if (!items.length && !(warnings?.total_baris_terdeteksi > 0)) {
      return res.status(400).json({ error: 'Tidak ada baris data yang bisa diproses dari file' });
    }

    const sample = sampleFromItems(items);
    const diuploadOleh = normalizeText(req.body?.diupload_oleh);
    const sessionId = createUploadSession(
      buildPreviewSessionPayload({
        pbfId,
        supplier,
        mapping,
        items,
        diuploadOleh,
      })
    );

    return res.json({
      session_id: sessionId,
      pbf_id: pbfId,
      mapping,
      sample,
      warnings,
      baris_valid: items.length,
      scale_by_1000: false,
      sumber: 'excel',
    });
  } catch (err) {
    console.error('[POST /pricelist/parse-preview]', err);
    return res.status(400).json({ error: err.message || 'Gagal parse preview' });
  }
});

// PATCH /api/pricelist/session-scale — simpan pilihan toggle ×1000 ke sesi preview
router.patch('/session-scale', requireMenuAksi('pricelist-pbf', 'edit'), async (req, res) => {
  try {
    const sessionId = normalizeText(req.body?.session_id);
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id wajib diisi' });
    }

    const scaleBy1000 = parseScaleBy1000(req.body?.scale_by_1000);
    const session = updateUploadSession(sessionId, { scaleBy1000 });
    if (!session) {
      return res.status(410).json({
        error: 'Sesi preview sudah habis atau tidak valid — upload ulang file',
      });
    }

    return res.json({
      session_id: sessionId,
      scale_by_1000: session.scaleBy1000,
    });
  } catch (err) {
    console.error('[PATCH /pricelist/session-scale]', err);
    return res.status(500).json({ error: 'Gagal menyimpan opsi skala' });
  }
});

// POST /api/pricelist/parse-pdf-preview — native PDF extract + preview/mapping
router.post('/parse-pdf-preview', requireMenuAksi('pricelist-pbf', 'tambah'), upload.single('file'), async (req, res) => {
  try {
    const pbfId = normalizeText(req.body?.pbf_id);
    if (!pbfId) {
      return res.status(400).json({ error: 'pbf_id wajib diisi' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'File PDF wajib diupload' });
    }
    const mime = String(req.file.mimetype || '');
    const name = String(req.file.originalname || '').toLowerCase();
    if (!mime.includes('pdf') && !name.endsWith('.pdf')) {
      return res.status(400).json({ error: 'File harus berformat PDF' });
    }

    const supplier = await getSupplier(pbfId);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier/PBF tidak ditemukan' });
    }

    const forceMapping =
      req.body?.force_mapping === true ||
      req.body?.force_mapping === '1' ||
      req.body?.force_mapping === 'true';

    const diuploadOleh = normalizeText(req.body?.diupload_oleh);
    const extracted = await extractPdfPages(req.file.buffer);
    if (!extracted.pages.length) {
      return res.status(400).json({ error: 'PDF tidak berisi teks yang bisa dibaca (mungkin hasil scan/OCR belum)' });
    }

    const existingTemplate = await getTemplate(pbfId);
    const pdfTemplate =
      !forceMapping &&
      existingTemplate &&
      existingTemplate.tipe_sumber === 'pdf' &&
      existingTemplate.kolom_posisi
        ? existingTemplate
        : null;

    if (!pdfTemplate) {
      const sessionId = createUploadSession({
        kind: 'pdf_raw',
        pbfId,
        pages: extracted.pages,
        numPages: extracted.numPages,
        diuploadOleh,
        supplierInisial: supplier.inisial,
      });

      return res.json({
        needs_mapping: true,
        session_id: sessionId,
        pbf_id: pbfId,
        num_pages: extracted.numPages,
        mapping_rows: buildMappingPreviewRows(extracted.pages),
        existing_kolom_posisi: existingTemplate?.tipe_sumber === 'pdf'
          ? existingTemplate.kolom_posisi
          : null,
        format_angka: normalizeFormatAngka(
          existingTemplate?.tipe_sumber === 'pdf'
            ? existingTemplate.format_angka
            : 'id'
        ),
        baris_mulai_data: existingTemplate?.baris_mulai_data || 1,
        sumber: 'pdf',
      });
    }

    const kolomPosisi = normalizeKolomPosisi(pdfTemplate.kolom_posisi);
    const formatAngka = normalizeFormatAngka(pdfTemplate.format_angka);
    const mapping = {
      tipe_sumber: 'pdf',
      kolom_posisi: kolomPosisi,
      format_angka: formatAngka,
      baris_mulai_data: pdfTemplate.baris_mulai_data || 1,
    };
    const { items, warnings } = extractMappedPdfRows(extracted.pages, kolomPosisi, {
      baris_mulai_data: mapping.baris_mulai_data,
      format_angka: formatAngka,
    });

    if (!items.length && !(warnings?.total_baris_terdeteksi > 0)) {
      return res.status(400).json({ error: 'Tidak ada baris data yang bisa diproses dari PDF' });
    }

    const sessionId = createUploadSession(
      buildPreviewSessionPayload({
        pbfId,
        supplier,
        mapping,
        items,
        diuploadOleh,
        pages: extracted.pages,
      })
    );

    return res.json({
      needs_mapping: false,
      session_id: sessionId,
      pbf_id: pbfId,
      mapping,
      sample: sampleFromItems(items),
      warnings,
      baris_valid: items.length,
      scale_by_1000: false,
      sumber: 'pdf',
    });
  } catch (err) {
    console.error('[POST /pricelist/parse-pdf-preview]', err);
    return res.status(400).json({ error: err.message || 'Gagal memproses PDF' });
  }
});

// POST /api/pricelist/save-pdf-mapping — simpan template PDF + parse ulang → preview session
router.post('/save-pdf-mapping', requireMenuAksi('pricelist-pbf', 'edit'), async (req, res) => {
  try {
    const pbfId = normalizeText(req.body?.pbf_id);
    const sessionId = normalizeText(req.body?.session_id);
    if (!pbfId) {
      return res.status(400).json({ error: 'pbf_id wajib diisi' });
    }
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id wajib diisi' });
    }

    const rawSession = getUploadSession(sessionId);
    if (!rawSession || rawSession.kind !== 'pdf_raw' || rawSession.pbfId !== pbfId) {
      return res.status(410).json({
        error: 'Sesi PDF sudah habis atau tidak valid — upload ulang file',
      });
    }

    const supplier = await getSupplier(pbfId);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier/PBF tidak ditemukan' });
    }

    let kolomPosisi;
    try {
      kolomPosisi = normalizeKolomPosisi(req.body?.kolom_posisi);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const barisMulai = normalizeBaris(req.body?.baris_mulai_data) || 1;
    const formatAngka = normalizeFormatAngka(req.body?.format_angka);
    const mapping = {
      tipe_sumber: 'pdf',
      kolom_posisi: kolomPosisi,
      format_angka: formatAngka,
      baris_mulai_data: barisMulai,
    };

    const template = await upsertTemplate(pbfId, mapping);
    const { items, warnings } = extractMappedPdfRows(rawSession.pages, kolomPosisi, {
      baris_mulai_data: barisMulai,
      format_angka: formatAngka,
    });

    if (!items.length && !(warnings?.total_baris_terdeteksi > 0)) {
      return res.status(400).json({ error: 'Tidak ada baris data yang bisa diproses dengan mapping ini' });
    }

    // Ganti sesi raw → preview (hapus raw)
    consumeUploadSession(sessionId);
    const previewSessionId = createUploadSession(
      buildPreviewSessionPayload({
        pbfId,
        supplier,
        mapping,
        items,
        diuploadOleh: rawSession.diuploadOleh,
        pages: rawSession.pages,
      })
    );

    return res.json({
      needs_mapping: false,
      session_id: previewSessionId,
      pbf_id: pbfId,
      template_id: template.id,
      mapping,
      sample: sampleFromItems(items),
      warnings,
      baris_valid: items.length,
      scale_by_1000: false,
      sumber: 'pdf',
    });
  } catch (err) {
    console.error('[POST /pricelist/save-pdf-mapping]', err);
    return res.status(500).json({ error: err.message || 'Gagal menyimpan mapping PDF' });
  }
});

// POST /api/pricelist/confirm — tahap 2: simpan template + insert riwayat
router.post('/confirm', requireMenuAksi('pricelist-pbf', 'tambah'), async (req, res) => {
  try {
    const sessionId = normalizeText(req.body?.session_id);
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id wajib diisi' });
    }

    // Prefer flag dari body (UI terbaru); fallback ke nilai yang tersimpan di sesi
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'scale_by_1000')) {
      const updated = updateUploadSession(sessionId, {
        scaleBy1000: parseScaleBy1000(req.body.scale_by_1000),
      });
      if (!updated) {
        return res.status(410).json({
          error: 'Sesi preview sudah habis atau tidak valid — upload ulang file',
        });
      }
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

    const items = applyScaleBy1000(session.items, Boolean(session.scaleBy1000));

    const template = await upsertTemplate(session.pbfId, session.mapping);
    const summary = await persistPricelistInserts({
      pbfId: session.pbfId,
      supplier,
      items,
      diuploadOleh: session.diuploadOleh,
    });

    return res.status(201).json({
      pbf_id: session.pbfId,
      template_id: template.id,
      scale_by_1000: Boolean(session.scaleBy1000),
      ...summary,
    });
  } catch (err) {
    console.error('[POST /pricelist/confirm]', err);
    return res.status(500).json({ error: err.message || 'Gagal menyimpan pricelist' });
  }
});

module.exports = router;
