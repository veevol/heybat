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
const { extractTanggalPricelist } = require('../lib/pricelistTanggal');
const {
  isSbsMonthlyPricelistPdf,
  extractSbsMonthlyPricelist,
} = require('../lib/sbsMonthlyPricelist');
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

async function fetchAllPricelistRows(buildQuery, pageSize = 1000) {
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
  tanggalPricelist = null,
  jenisDokumen = null,
}) {
  return {
    kind: 'preview',
    pbfId,
    mapping,
    // Simpan __flags agar sample/Muat lagi tetap bisa tampilkan badge digabung/estimasi
    items,
    diuploadOleh,
    supplierInisial: supplier.inisial,
    scaleBy1000: false,
    pages,
    tanggalPricelist: tanggalPricelist || null,
    jenisDokumen: jenisDokumen || null,
  };
}

/** Skor sumber diskon: utamakan jenis harga + tanggal_pricelist lebih baru. */
function diskonSourceScore(row) {
  if (!row || row.diskon == null || String(row.diskon).trim() === '') return -1;
  const jenisBoost = row.jenis_dokumen === 'harga' ? 1e15 : 0;
  const tPl = row.tanggal_pricelist ? Date.parse(`${row.tanggal_pricelist}T00:00:00Z`) : 0;
  const tUp = row.tanggal_upload ? Date.parse(row.tanggal_upload) : 0;
  return jenisBoost + (Number.isFinite(tPl) ? tPl : 0) * 1000 + (Number.isFinite(tUp) ? tUp : 0);
}

async function fetchLatestDiskonByKode(pbfId) {
  let data;
  try {
    data = await fetchAllPricelistRows(() =>
      supabase
        .from('pricelist')
        .select(
          'kode_pbf, diskon, catatan_kondisi, tanggal_pricelist, tanggal_upload, jenis_dokumen, dihapus_pada'
        )
        .eq('pbf_id', pbfId)
    );
  } catch (err) {
    if (/diskon|jenis_dokumen/i.test(err.message || '')) {
      return new Map();
    }
    throw err;
  }

  const map = new Map();
  for (const row of data || []) {
    if (row.dihapus_pada) continue;
    const score = diskonSourceScore(row);
    if (score < 0) continue;
    const prev = map.get(row.kode_pbf);
    if (!prev || score > prev.__score) {
      map.set(row.kode_pbf, { ...row, __score: score });
    }
  }
  return map;
}

async function fetchLatestByKode(pbfId) {
  const data = await fetchAllPricelistRows(() =>
    supabase
      .from('pricelist')
      .select('*')
      .eq('pbf_id', pbfId)
      .order('tanggal_upload', { ascending: false })
      .order('id', { ascending: false })
  );

  const map = new Map();
  for (const row of data || []) {
    if (row.dihapus_pada) continue;
    if (!map.has(row.kode_pbf)) map.set(row.kode_pbf, row);
  }
  return map;
}

async function fetchNamaToKode(pbfId) {
  const data = await fetchAllPricelistRows(() =>
    supabase
      .from('pricelist')
      .select('nama_barang, kode_pbf, tanggal_upload')
      .eq('pbf_id', pbfId)
      .order('tanggal_upload', { ascending: false })
      .order('id', { ascending: false })
  );

  const map = new Map();
  for (const row of data || []) {
    const key = String(row.nama_barang || '').trim().toLowerCase();
    if (!key || map.has(key)) continue;
    map.set(key, row.kode_pbf);
  }
  return map;
}

async function nextSeq(pbfId, inisial) {
  const data = await fetchAllPricelistRows(() =>
    supabase.from('pricelist').select('kode_pbf').eq('pbf_id', pbfId)
  );

  let max = 0;
  for (const row of data || []) {
    max = Math.max(max, parseKodeSeq(row.kode_pbf, inisial));
  }
  return max + 1;
}

async function persistPricelistInserts({
  pbfId,
  supplier,
  items,
  diuploadOleh,
  tanggalPricelist = null,
  jenisDokumen = null,
}) {
  const namaToKode = await fetchNamaToKode(pbfId);
  const latestBefore = await fetchLatestByKode(pbfId);
  const latestDiskon = await fetchLatestDiskonByKode(pbfId);
  let seq = await nextSeq(pbfId, supplier.inisial);

  // Semua kode yang sudah pernah dipakai (hindari reuse bentrok)
  const usedKodes = new Set([
    ...namaToKode.values(),
    ...latestBefore.keys(),
  ]);
  const existingKodeRows = await fetchAllPricelistRows(() =>
    supabase.from('pricelist').select('kode_pbf').eq('pbf_id', pbfId)
  );
  for (const row of existingKodeRows || []) {
    if (row.kode_pbf) usedKodes.add(row.kode_pbf);
  }

  function allocKode() {
    let kode = formatKode(supplier.inisial, seq);
    while (usedKodes.has(kode)) {
      seq += 1;
      kode = formatKode(supplier.inisial, seq);
    }
    seq += 1;
    usedKodes.add(kode);
    return kode;
  }

  const uploadAt = new Date().toISOString();
  const inserts = [];
  const kodeInUpload = new Set();
  const kodeOwnerInUpload = new Map(); // kode → nama key
  let barangBaru = 0;
  const jenis =
    jenisDokumen === 'harga' || jenisDokumen === 'stok' ? jenisDokumen : null;

  for (const item of items) {
    const key = item.nama_barang.trim().toLowerCase();
    let kode = namaToKode.get(key) || null;
    // Kode dari history sudah dipakai nama lain di upload ini → alokasi baru
    if (kode && kodeOwnerInUpload.has(kode) && kodeOwnerInUpload.get(kode) !== key) {
      kode = null;
    }
    if (!kode) {
      kode = allocKode();
      namaToKode.set(key, kode);
      barangBaru += 1;
    }
    kodeInUpload.add(kode);
    kodeOwnerInUpload.set(kode, key);

    const prev = latestBefore.get(kode) || null;
    const discPrev = latestDiskon.get(kode) || prev;

    let qty = item.qty;
    let qtyEstimasi = Boolean(item.qty_estimasi);
    let harga = item.harga_dasar;
    let diskon =
      item.diskon != null && String(item.diskon).trim() !== ''
        ? String(item.diskon).trim()
        : null;
    let catatan = item.catatan_kondisi ?? null;

    if (jenis === 'harga') {
      // Harga+diskon dari PL bulanan.
      // Qty: "*" (qty < 10) → estimasi dari file; tanpa bintang → warisi stok terakhir.
      if (qty == null && prev) {
        qty = prev.qty;
        qtyEstimasi = Boolean(prev.qty_estimasi);
      }
      if (!catatan && diskon) catatan = diskon;
    } else if (jenis === 'stok') {
      // Qty+harga dari stok harian; diskon warisi PL harga terbaru
      if (!diskon && discPrev?.diskon) {
        diskon = String(discPrev.diskon).trim();
        catatan = discPrev.catatan_kondisi || diskon;
      } else if (!catatan && prev?.catatan_kondisi) {
        // Fallback tanpa kolom diskon: warisi catatan (skema disc) dari baris terakhir
        catatan = prev.catatan_kondisi;
      }
    } else if (!diskon && discPrev?.diskon) {
      diskon = String(discPrev.diskon).trim();
    } else if (!catatan && prev?.catatan_kondisi && !item.catatan_kondisi) {
      catatan = prev.catatan_kondisi;
    }

    inserts.push({
      pbf_id: pbfId,
      kode_pbf: kode,
      nama_barang: item.nama_barang.trim(),
      satuan: item.satuan || null,
      qty,
      qty_estimasi: qtyEstimasi,
      harga_dasar: harga,
      catatan_kondisi: catatan,
      diskon,
      jenis_dokumen: jenis,
      tanggal_upload: uploadAt,
      tanggal_pricelist: tanggalPricelist || null,
      diupload_oleh: diuploadOleh,
      auto_kosong: false,
    });
  }

  let autoKosong = 0;
  // Daftar harga bulanan tidak menandai barang hilang (bukan stok); jangan qty=0
  if (jenis !== 'harga') {
    for (const [kode, last] of latestBefore.entries()) {
      if (kodeInUpload.has(kode)) continue;
      const discPrev = latestDiskon.get(kode) || last;
      const diskon = discPrev?.diskon ?? last.diskon ?? null;
      inserts.push({
        pbf_id: pbfId,
        kode_pbf: kode,
        nama_barang: last.nama_barang,
        satuan: last.satuan,
        qty: 0,
        qty_estimasi: false,
        harga_dasar: last.harga_dasar,
        catatan_kondisi: discPrev?.catatan_kondisi || last.catatan_kondisi,
        diskon,
        jenis_dokumen: jenis,
        tanggal_upload: uploadAt,
        tanggal_pricelist: tanggalPricelist || null,
        diupload_oleh: diuploadOleh,
        auto_kosong: true,
      });
      autoKosong += 1;
    }
  }

  const chunkSize = 200;
  for (let i = 0; i < inserts.length; i += chunkSize) {
    const chunk = inserts.slice(i, i + chunkSize);
    let { error } = await supabase.from('pricelist').insert(chunk);
    if (error && /tanggal_pricelist|diskon|jenis_dokumen/i.test(error.message || '')) {
      // Migrasi kolom baru belum dijalankan — strip bertahap
      const stripped = chunk.map((row) => {
        const next = { ...row };
        if (/tanggal_pricelist/i.test(error.message || '')) delete next.tanggal_pricelist;
        if (/diskon/i.test(error.message || '')) delete next.diskon;
        if (/jenis_dokumen/i.test(error.message || '')) delete next.jenis_dokumen;
        return next;
      });
      ({ error } = await supabase.from('pricelist').insert(stripped));
      if (error && /tanggal_pricelist|diskon|jenis_dokumen/i.test(error.message || '')) {
        const stripped2 = chunk.map(
          ({ tanggal_pricelist: _t, diskon: _d, jenis_dokumen: _j, ...rest }) => rest
        );
        ({ error } = await supabase.from('pricelist').insert(stripped2));
      }
    }
    if (error) throw error;
  }

  return {
    baris_diproses: items.length,
    barang_baru: barangBaru,
    auto_kosong: autoKosong,
    tanggal_pricelist: tanggalPricelist || null,
    jenis_dokumen: jenis,
  };
}

/**
 * GET /api/pricelist/uploads
 * Riwayat batch: { pbf_id, inisial, nama, tanggal_upload, tanggal_pricelist, item_count }
 * Urut: tanggal_pricelist (fallback tanggal upload) DESC, lalu inisial A-Z.
 */
router.get('/uploads', requireMenuAksi('pricelist-pbf', 'lihat'), async (_req, res) => {
  try {
    let rows;
    try {
      rows = await fetchAllPricelistRows(() =>
        supabase
          .from('pricelist')
          .select('pbf_id, tanggal_upload, tanggal_pricelist, auto_kosong, dihapus_pada')
      );
    } catch (colErr) {
      const msg = colErr.message || '';
      if (/dihapus_pada/i.test(msg) && /tanggal_pricelist/i.test(msg)) {
        rows = await fetchAllPricelistRows(() =>
          supabase.from('pricelist').select('pbf_id, tanggal_upload, auto_kosong')
        );
      } else if (/dihapus_pada/i.test(msg)) {
        try {
          rows = await fetchAllPricelistRows(() =>
            supabase
              .from('pricelist')
              .select('pbf_id, tanggal_upload, tanggal_pricelist, auto_kosong')
          );
        } catch (colErr2) {
          if (!/tanggal_pricelist/i.test(colErr2.message || '')) throw colErr2;
          rows = await fetchAllPricelistRows(() =>
            supabase.from('pricelist').select('pbf_id, tanggal_upload, auto_kosong')
          );
        }
      } else if (/tanggal_pricelist/i.test(msg)) {
        rows = await fetchAllPricelistRows(() =>
          supabase
            .from('pricelist')
            .select('pbf_id, tanggal_upload, auto_kosong, dihapus_pada')
        );
      } else {
        throw colErr;
      }
    }

    const counts = new Map(); // `${pbfId}::${tanggal}` -> batch
    for (const row of rows) {
      if (!row?.pbf_id || !row?.tanggal_upload) continue;
      if (row.dihapus_pada) continue;
      const key = `${row.pbf_id}::${row.tanggal_upload}`;
      let slot = counts.get(key);
      if (!slot) {
        slot = {
          pbf_id: row.pbf_id,
          tanggal_upload: row.tanggal_upload,
          tanggal_pricelist: row.tanggal_pricelist || null,
          item_count: 0,
          file_count: 0,
        };
        counts.set(key, slot);
      }
      slot.item_count += 1;
      if (!row.auto_kosong) slot.file_count += 1;
      if (!slot.tanggal_pricelist && row.tanggal_pricelist) {
        slot.tanggal_pricelist = row.tanggal_pricelist;
      }
    }

    const { data: suppliers, error: supErr } = await supabase
      .from('supplier')
      .select('id, nama, inisial');
    if (supErr) throw supErr;
    const byId = new Map((suppliers || []).map((s) => [s.id, s]));

    function sortDateKey(batch) {
      if (batch.tanggal_pricelist) return String(batch.tanggal_pricelist).slice(0, 10);
      // Fallback data lama: pakai tanggal kalender dari waktu upload (UTC)
      const raw = String(batch.tanggal_upload || '');
      if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
      try {
        return new Date(raw).toISOString().slice(0, 10);
      } catch {
        return '';
      }
    }

    const list = [...counts.values()].map((batch) => {
      const sup = byId.get(batch.pbf_id);
      const tanggalPricelist = batch.tanggal_pricelist
        ? String(batch.tanggal_pricelist).slice(0, 10)
        : null;
      return {
        pbf_id: batch.pbf_id,
        nama: sup?.nama || null,
        inisial: sup?.inisial || '—',
        tanggal_upload: batch.tanggal_upload,
        tanggal_pricelist: tanggalPricelist,
        // Item dari file (bukan baris auto kosong)
        item_count: batch.file_count > 0 ? batch.file_count : batch.item_count,
        _sort_date: sortDateKey(batch),
      };
    });

    list.sort((a, b) => {
      const ta = a._sort_date || '';
      const tb = b._sort_date || '';
      if (ta !== tb) return tb.localeCompare(ta);
      return String(a.inisial || '').localeCompare(String(b.inisial || ''), 'id', {
        sensitivity: 'base',
      });
    });

    return res.json(list.map(({ _sort_date, ...rest }) => rest));
  } catch (err) {
    console.error('[GET /pricelist/uploads]', err);
    return res.status(500).json({ error: 'Gagal mengambil riwayat upload pricelist' });
  }
});

/**
 * Soft-delete batch pricelist: kosongkan qty/harga (isi file), set dihapus_pada.
 * Tidak menghapus kode/nama obat PBF (baris tetap) maupun tabel matching.
 * Body: { pbf_id, tanggal_upload }
 * (POST dipakai karena DELETE+body sering bermasalah di proxy/browser.)
 */
async function softDeletePricelistUpload(req, res) {
  try {
    const pbfId = normalizeText(req.body?.pbf_id ?? req.query?.pbf_id);
    const tanggalUpload = normalizeText(
      req.body?.tanggal_upload ?? req.query?.tanggal_upload
    );
    if (!pbfId) {
      return res.status(400).json({ error: 'pbf_id wajib diisi' });
    }
    if (!tanggalUpload) {
      return res.status(400).json({ error: 'tanggal_upload wajib diisi' });
    }

    const waktuVariants = [];
    const pushVariant = (v) => {
      const s = normalizeText(v);
      if (s && !waktuVariants.includes(s)) waktuVariants.push(s);
    };
    pushVariant(tanggalUpload);
    const parsed = Date.parse(tanggalUpload);
    if (Number.isFinite(parsed)) {
      const iso = new Date(parsed).toISOString();
      pushVariant(iso);
      pushVariant(iso.replace(/Z$/, '+00:00'));
    }

    let matchedUpload = null;
    let probeErr = null;
    for (const waktu of waktuVariants) {
      const { data: existing, error: findErr } = await supabase
        .from('pricelist')
        .select('id, tanggal_upload')
        .eq('pbf_id', pbfId)
        .eq('tanggal_upload', waktu)
        .is('dihapus_pada', null)
        .limit(1);
      if (findErr) {
        probeErr = findErr;
        if (/dihapus_pada/i.test(findErr.message || '')) {
          return res.status(503).json({
            error:
              'Kolom dihapus_pada belum ada — jalankan migrasi pricelist_dihapus_pada di Supabase',
          });
        }
        continue;
      }
      if (existing?.length) {
        matchedUpload = existing[0].tanggal_upload || waktu;
        break;
      }
    }

    if (!matchedUpload) {
      if (probeErr) {
        console.error('[softDeletePricelistUpload] probe', probeErr);
        return res.status(500).json({
          error: probeErr.message || 'Gagal mencari batch pricelist',
        });
      }
      return res.status(404).json({
        error: 'Batch pricelist tidak ditemukan atau sudah dihapus',
      });
    }

    const dihapusPada = new Date().toISOString();

    // Ambil semua id (paginated) lalu update per chunk — hindari timeout/max-rows
    const allIds = [];
    {
      const pageSize = 1000;
      let from = 0;
      for (;;) {
        const { data: page, error: pageErr } = await supabase
          .from('pricelist')
          .select('id')
          .eq('pbf_id', pbfId)
          .eq('tanggal_upload', matchedUpload)
          .is('dihapus_pada', null)
          .range(from, from + pageSize - 1);
        if (pageErr) throw pageErr;
        const chunk = page || [];
        for (const row of chunk) allIds.push(row.id);
        if (chunk.length < pageSize) break;
        from += pageSize;
      }
    }

    if (!allIds.length) {
      return res.status(404).json({
        error: 'Batch pricelist tidak ditemukan atau sudah dihapus',
      });
    }

    let updated = 0;
    const chunkSize = 150;
    for (let i = 0; i < allIds.length; i += chunkSize) {
      const ids = allIds.slice(i, i + chunkSize);
      const { error: updErr } = await supabase
        .from('pricelist')
        .update({
          qty: null,
          harga_dasar: null,
          catatan_kondisi: null,
          dihapus_pada: dihapusPada,
        })
        .in('id', ids);
      if (updErr) throw updErr;
      updated += ids.length;
    }

    return res.json({
      ok: true,
      pbf_id: pbfId,
      tanggal_upload: matchedUpload,
      baris_dihapus: updated,
    });
  } catch (err) {
    console.error('[softDeletePricelistUpload]', err);
    return res.status(500).json({
      error: err.message || err.details || 'Gagal menghapus batch pricelist',
    });
  }
}

router.post(
  '/uploads/hapus',
  requireMenuAksi('pricelist-pbf', 'hapus'),
  softDeletePricelistUpload
);
router.delete(
  '/uploads',
  requireMenuAksi('pricelist-pbf', 'hapus'),
  softDeletePricelistUpload
);

// GET /api/pricelist?pbf_id=&tanggal_upload=
// tanpa tanggal_upload → snapshot terbaru per kode_pbf
// dengan tanggal_upload → semua baris batch upload itu
router.get('/', requireMenuAksi('pricelist-pbf', 'lihat'), async (req, res) => {
  try {
    const pbfId = normalizeText(req.query.pbf_id);
    if (!pbfId) {
      return res.status(400).json({ error: 'pbf_id wajib diisi' });
    }

    const tanggalUpload = normalizeText(req.query.tanggal_upload);
    if (tanggalUpload) {
      const list = await fetchAllPricelistRows(() =>
        supabase
          .from('pricelist')
          .select('*')
          .eq('pbf_id', pbfId)
          .eq('tanggal_upload', tanggalUpload)
          .order('nama_barang', { ascending: true })
      );
      return res.json((list || []).filter((r) => !r.dihapus_pada));
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

    const tanggalPricelist = extractTanggalPricelist({
      inisial: supplier.inisial,
      excelRows: rows,
    });

    const sample = sampleFromItems(items);
    const diuploadOleh = normalizeText(req.body?.diupload_oleh);
    const sessionId = createUploadSession(
      buildPreviewSessionPayload({
        pbfId,
        supplier,
        mapping,
        items,
        diuploadOleh,
        tanggalPricelist,
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

    const tanggalPricelist = extractTanggalPricelist({
      inisial: supplier.inisial,
      pdfPages: extracted.pages,
    });

    // SBS daftar harga bulanan (dual table + DISC) — mapping khusus, tanpa template x-range stok
    const isSbsHarga =
      String(supplier.inisial || '').trim().toLowerCase() === 'sbs' &&
      isSbsMonthlyPricelistPdf(extracted.pages);

    if (isSbsHarga) {
      const formatAngka = normalizeFormatAngka(
        existingTemplate?.format_angka || 'id'
      );
      const { items, warnings, jenis_dokumen } = extractSbsMonthlyPricelist(
        extracted.pages,
        { format_angka: formatAngka }
      );
      if (!items.length) {
        return res.status(400).json({
          error: 'Tidak ada baris data yang bisa diproses dari daftar harga SBS',
        });
      }
      const mapping = {
        tipe_sumber: 'pdf',
        format_angka: formatAngka,
        baris_mulai_data: 1,
        skema: 'sbs_harga_bulanan',
      };
      const sessionId = createUploadSession(
        buildPreviewSessionPayload({
          pbfId,
          supplier,
          mapping,
          items,
          diuploadOleh,
          pages: extracted.pages,
          tanggalPricelist,
          jenisDokumen: jenis_dokumen || 'harga',
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
        jenis_dokumen: 'harga',
        tanggal_pricelist: tanggalPricelist,
      });
    }

    if (!pdfTemplate) {
      const mappingPreview = buildMappingPreviewRows(extracted.pages);
      const sessionId = createUploadSession({
        kind: 'pdf_raw',
        pbfId,
        pages: extracted.pages,
        numPages: extracted.numPages,
        diuploadOleh,
        supplierInisial: supplier.inisial,
        tanggalPricelist,
      });

      return res.json({
        needs_mapping: true,
        session_id: sessionId,
        pbf_id: pbfId,
        num_pages: extracted.numPages,
        mapping_rows: mappingPreview.rows,
        mapping_total: mappingPreview.total,
        mapping_offset: mappingPreview.offset,
        mapping_limit: mappingPreview.limit,
        mapping_has_more: mappingPreview.has_more,
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
        tanggal_pricelist: tanggalPricelist,
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
        tanggalPricelist,
        jenisDokumen:
          String(supplier.inisial || '').trim().toLowerCase() === 'sbs'
            ? 'stok'
            : null,
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
      jenis_dokumen:
        String(supplier.inisial || '').trim().toLowerCase() === 'sbs'
          ? 'stok'
          : null,
      tanggal_pricelist: tanggalPricelist,
    });
  } catch (err) {
    console.error('[POST /pricelist/parse-pdf-preview]', err);
    return res.status(400).json({ error: err.message || 'Gagal memproses PDF' });
  }
});

// GET /api/pricelist/preview-sample-rows — halaman berikutnya untuk Preview Hasil Mapping
router.get(
  '/preview-sample-rows',
  requireMenuAksi('pricelist-pbf', 'tambah'),
  async (req, res) => {
    try {
      const pbfId = normalizeText(req.query?.pbf_id);
      const sessionId = normalizeText(req.query?.session_id);
      if (!pbfId || !sessionId) {
        return res.status(400).json({ error: 'pbf_id dan session_id wajib' });
      }

      const session = getUploadSession(sessionId);
      if (!session || session.kind !== 'preview' || session.pbfId !== pbfId) {
        return res.status(410).json({
          error: 'Sesi preview sudah habis atau tidak valid — upload ulang file',
        });
      }

      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
      const limitRaw = parseInt(String(req.query.limit || '10'), 10);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(1, limitRaw), 50)
        : 10;
      const items = Array.isArray(session.items) ? session.items : [];
      const sample = sampleFromItems(items, limit, offset);

      return res.json({
        session_id: sessionId,
        pbf_id: pbfId,
        sample,
        sample_total: items.length,
        sample_offset: offset,
        sample_limit: limit,
        sample_has_more: offset + sample.length < items.length,
      });
    } catch (err) {
      console.error('[GET /pricelist/preview-sample-rows]', err);
      return res.status(500).json({
        error: err.message || 'Gagal memuat baris preview',
      });
    }
  }
);

// GET /api/pricelist/pdf-mapping-rows — halaman berikutnya untuk sheet mapping PDF
router.get(
  '/pdf-mapping-rows',
  requireMenuAksi('pricelist-pbf', 'tambah'),
  async (req, res) => {
    try {
      const pbfId = normalizeText(req.query?.pbf_id);
      const sessionId = normalizeText(req.query?.session_id);
      if (!pbfId || !sessionId) {
        return res.status(400).json({ error: 'pbf_id dan session_id wajib' });
      }

      const rawSession = getUploadSession(sessionId);
      if (!rawSession || rawSession.kind !== 'pdf_raw' || rawSession.pbfId !== pbfId) {
        return res.status(410).json({
          error: 'Sesi PDF sudah habis atau tidak valid — upload ulang file',
        });
      }

      const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
      const limitRaw = parseInt(String(req.query.limit || '12'), 10);
      const limit = Number.isFinite(limitRaw) ? limitRaw : 12;

      const mappingPreview = buildMappingPreviewRows(rawSession.pages, {
        offset,
        limit,
      });

      return res.json({
        session_id: sessionId,
        pbf_id: pbfId,
        mapping_rows: mappingPreview.rows,
        mapping_total: mappingPreview.total,
        mapping_offset: mappingPreview.offset,
        mapping_limit: mappingPreview.limit,
        mapping_has_more: mappingPreview.has_more,
      });
    } catch (err) {
      console.error('[GET /pricelist/pdf-mapping-rows]', err);
      return res.status(500).json({
        error: err.message || 'Gagal memuat baris mapping',
      });
    }
  }
);

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

    const tanggalPricelist =
      rawSession.tanggalPricelist ||
      extractTanggalPricelist({
        inisial: supplier.inisial,
        pdfPages: rawSession.pages,
      });

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
        tanggalPricelist,
        jenisDokumen:
          String(supplier.inisial || '').trim().toLowerCase() === 'sbs'
            ? 'stok'
            : null,
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
      jenis_dokumen:
        String(supplier.inisial || '').trim().toLowerCase() === 'sbs'
          ? 'stok'
          : null,
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

    // Jangan timpa template mapping stok SBS saat konfirmasi daftar harga bulanan
    let template = null;
    const skipTemplate =
      session.mapping?.skema === 'sbs_harga_bulanan' ||
      session.jenisDokumen === 'harga';
    if (!skipTemplate) {
      template = await upsertTemplate(session.pbfId, session.mapping);
    } else {
      template = await getTemplate(session.pbfId);
    }

    const summary = await persistPricelistInserts({
      pbfId: session.pbfId,
      supplier,
      items,
      diuploadOleh: session.diuploadOleh,
      tanggalPricelist: session.tanggalPricelist || null,
      jenisDokumen: session.jenisDokumen || null,
    });

    return res.status(201).json({
      pbf_id: session.pbfId,
      template_id: template?.id || null,
      scale_by_1000: Boolean(session.scaleBy1000),
      ...summary,
    });
  } catch (err) {
    console.error('[POST /pricelist/confirm]', err);
    return res.status(500).json({ error: err.message || 'Gagal menyimpan pricelist' });
  }
});

module.exports = router;
