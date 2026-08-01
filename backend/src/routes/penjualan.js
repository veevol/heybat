const express = require('express');
const multer = require('multer');
const { supabase } = require('../db');
const {
  createUploadSession,
  consumeUploadSession,
} = require('../lib/uploadSessions');
const {
  parsePenjualanExcel,
  normalizeText,
  pairKey,
} = require('../lib/penjualanExcel');
const {
  requireAuth,
  requireApproved,
  requireOwner,
  requireMenuAksi,
} = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireApproved);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
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

/** Cek berapa pasangan (no_faktur, kode_obat) sudah ada di DB */
async function countExistingPairs(items) {
  if (!items.length) return { existingKeys: new Set(), jumlah_sudah_ada: 0 };

  const fakturSet = [...new Set(items.map((i) => i.no_faktur))];
  const existingKeys = new Set();

  const chunkSize = 100;
  for (let i = 0; i < fakturSet.length; i += chunkSize) {
    const fakturChunk = fakturSet.slice(i, i + chunkSize);
    const rows = await fetchAllRows(() =>
      supabase
        .from('penjualan_obat')
        .select('no_faktur, kode_obat')
        .in('no_faktur', fakturChunk)
    );
    for (const row of rows) {
      existingKeys.add(pairKey(row.no_faktur, row.kode_obat));
    }
  }

  let jumlahSudahAda = 0;
  for (const item of items) {
    if (existingKeys.has(pairKey(item.no_faktur, item.kode_obat))) {
      jumlahSudahAda += 1;
    }
  }

  return { existingKeys, jumlah_sudah_ada: jumlahSudahAda };
}

async function insertPenjualanRows(
  items,
  { diuploadOleh, existingKeys, uploadBatchId }
) {
  const uploadAt = new Date().toISOString();
  const toInsert = [];
  let skipped = 0;
  let perluCekBaru = 0;

  for (const item of items) {
    const key = pairKey(item.no_faktur, item.kode_obat);
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    existingKeys.add(key);
    if (item.kategori_pelanggan === 'perlu_cek') perluCekBaru += 1;
    toInsert.push({
      no_faktur: item.no_faktur,
      kode_obat: item.kode_obat,
      tanggal_transaksi: item.tanggal_transaksi,
      nama_obat: item.nama_obat,
      jumlah: item.jumlah,
      satuan: item.satuan,
      harga_jual_label: item.harga_jual_label,
      harga: item.harga,
      subtotal: item.subtotal,
      nama_dokter: item.nama_dokter,
      kategori_pelanggan: item.kategori_pelanggan,
      no_batch_ed: item.no_batch_ed,
      supplier: item.supplier,
      kasir: item.kasir,
      shift: item.shift,
      tanggal_upload: uploadAt,
      diupload_oleh: diuploadOleh,
      upload_batch_id: uploadBatchId || null,
    });
  }

  let masuk = 0;
  const chunkSize = 200;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { error } = await supabase.from('penjualan_obat').insert(chunk);
    if (!error) {
      masuk += chunk.length;
      continue;
    }
    if (error.code !== '23505') throw error;
    for (const row of chunk) {
      const { error: oneErr } = await supabase.from('penjualan_obat').insert(row);
      if (!oneErr) {
        masuk += 1;
      } else if (oneErr.code === '23505') {
        skipped += 1;
      } else {
        throw oneErr;
      }
    }
  }

  return {
    masuk,
    di_skip: skipped,
    perlu_cek: perluCekBaru,
    total_file: items.length,
  };
}

// ---------------------------------------------------------------------------
// GET /api/penjualan/ringkasan — agregat per bulan
// ---------------------------------------------------------------------------
router.get('/ringkasan', requireMenuAksi('penjualan', 'lihat'), async (req, res) => {
  try {
    const rows = await fetchAllRows(() =>
      supabase
        .from('penjualan_obat')
        .select('tanggal_transaksi, subtotal, kategori_pelanggan, no_faktur')
        .order('tanggal_transaksi', { ascending: false })
    );

    const byMonth = new Map();
    let totalPerluCek = 0;

    for (const row of rows) {
      if (row.kategori_pelanggan === 'perlu_cek') totalPerluCek += 1;
      const d = new Date(row.tanggal_transaksi);
      if (Number.isNaN(d.getTime())) continue;
      const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
      const key = `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}`;
      let agg = byMonth.get(key);
      if (!agg) {
        agg = {
          bulan: key,
          jumlah_transaksi: 0,
          total_nominal: 0,
          perlu_cek: 0,
          retail: 0,
          mitra: 0,
          titip: 0,
          retail_nominal: 0,
          mitra_nominal: 0,
          titip_nominal: 0,
          _faktur: {
            retail: new Set(),
            mitra: new Set(),
            titip: new Set(),
          },
        };
        byMonth.set(key, agg);
      }
      const sub = Number(row.subtotal) || 0;
      const faktur = normalizeText(row.no_faktur);
      agg.jumlah_transaksi += 1;
      agg.total_nominal += sub;
      if (row.kategori_pelanggan === 'perlu_cek') {
        agg.perlu_cek += 1;
      } else if (row.kategori_pelanggan === 'mitra') {
        agg.mitra += 1;
        agg.mitra_nominal += sub;
        if (faktur) agg._faktur.mitra.add(faktur);
      } else if (row.kategori_pelanggan === 'titip') {
        agg.titip += 1;
        agg.titip_nominal += sub;
        if (faktur) agg._faktur.titip.add(faktur);
      } else {
        // retail + fallback tanpa kategori
        agg.retail += 1;
        agg.retail_nominal += sub;
        if (faktur) agg._faktur.retail.add(faktur);
      }
    }

    const ringkasan = [...byMonth.values()]
      .map((agg) => {
        const { _faktur, ...rest } = agg;
        return {
          ...rest,
          retail_faktur: _faktur.retail.size,
          mitra_faktur: _faktur.mitra.size,
          titip_faktur: _faktur.titip.size,
        };
      })
      .sort((a, b) => (a.bulan < b.bulan ? 1 : -1));

    return res.json({
      ringkasan,
      total_baris: rows.length,
      total_perlu_cek: totalPerluCek,
    });
  } catch (err) {
    console.error('[GET /penjualan/ringkasan]', err);
    return res.status(500).json({ error: err.message || 'Gagal memuat ringkasan' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/penjualan/perlu-cek
// ---------------------------------------------------------------------------
router.get('/perlu-cek', requireMenuAksi('penjualan', 'lihat'), async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error, count } = await supabase
      .from('penjualan_obat')
      .select(
        'id, no_faktur, kode_obat, nama_obat, tanggal_transaksi, nama_dokter, harga_jual_label, jumlah, satuan, harga, subtotal, kasir, shift',
        { count: 'exact' }
      )
      .eq('kategori_pelanggan', 'perlu_cek')
      .order('tanggal_transaksi', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return res.json({
      items: data || [],
      total: count ?? (data || []).length,
      limit,
      offset,
    });
  } catch (err) {
    console.error('[GET /penjualan/perlu-cek]', err);
    return res.status(500).json({ error: err.message || 'Gagal memuat daftar perlu cek' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/penjualan/upload-batches — riwayat upload
// ---------------------------------------------------------------------------
router.get(
  '/upload-batches',
  requireMenuAksi('penjualan', 'lihat'),
  async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from('penjualan_upload_batch')
        .select(
          'id, nama_file, jumlah_baris_masuk, jumlah_baris_skip_duplikat, diupload_oleh, tanggal_upload'
        )
        .order('tanggal_upload', { ascending: false });

      if (error) throw error;
      return res.json({ items: data || [] });
    } catch (err) {
      console.error('[GET /penjualan/upload-batches]', err);
      return res.status(500).json({ error: err.message || 'Gagal memuat riwayat upload' });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/penjualan/upload-batches/:id — hapus dataset (owner only)
// ---------------------------------------------------------------------------
router.delete('/upload-batches/:id', requireOwner, async (req, res) => {
  try {
    const id = normalizeText(req.params.id);
    if (!id) return res.status(400).json({ error: 'id wajib' });

    const { data: batch, error: findErr } = await supabase
      .from('penjualan_upload_batch')
      .select('id, nama_file, jumlah_baris_masuk')
      .eq('id', id)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!batch) return res.status(404).json({ error: 'Batch upload tidak ditemukan' });

    // Hapus semua baris transaksi batch ini (chunked kalau banyak)
    let deletedRows = 0;
    for (;;) {
      const { data: chunk, error: selErr } = await supabase
        .from('penjualan_obat')
        .select('id')
        .eq('upload_batch_id', id)
        .limit(500);
      if (selErr) throw selErr;
      if (!chunk?.length) break;

      const ids = chunk.map((r) => r.id);
      const { error: delErr } = await supabase
        .from('penjualan_obat')
        .delete()
        .in('id', ids);
      if (delErr) throw delErr;
      deletedRows += ids.length;
    }

    const { error: batchDelErr } = await supabase
      .from('penjualan_upload_batch')
      .delete()
      .eq('id', id);
    if (batchDelErr) throw batchDelErr;

    return res.json({
      ok: true,
      id,
      nama_file: batch.nama_file,
      baris_dihapus: deletedRows,
    });
  } catch (err) {
    console.error('[DELETE /penjualan/upload-batches/:id]', err);
    return res.status(500).json({ error: err.message || 'Gagal menghapus batch upload' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/penjualan/:id/kategori — override retail | mitra | titip
// ---------------------------------------------------------------------------
router.patch('/:id/kategori', requireMenuAksi('penjualan', 'edit'), async (req, res) => {
  try {
    const id = normalizeText(req.params.id);
    const kategori = normalizeText(req.body?.kategori_pelanggan);
    if (!id) return res.status(400).json({ error: 'id wajib' });
    if (kategori !== 'retail' && kategori !== 'mitra' && kategori !== 'titip') {
      return res.status(400).json({
        error: 'kategori_pelanggan harus "retail", "mitra", atau "titip"',
      });
    }

    const { data, error } = await supabase
      .from('penjualan_obat')
      .update({ kategori_pelanggan: kategori })
      .eq('id', id)
      .select(
        'id, no_faktur, kode_obat, nama_obat, kategori_pelanggan, nama_dokter, harga_jual_label'
      )
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Baris tidak ditemukan' });

    return res.json({ item: data, diubah_oleh: actorFromReq(req) });
  } catch (err) {
    console.error('[PATCH /penjualan/:id/kategori]', err);
    return res.status(500).json({ error: err.message || 'Gagal mengubah kategori' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/penjualan/parse-preview — tahap 1: parse saja
// ---------------------------------------------------------------------------
router.post(
  '/parse-preview',
  requireMenuAksi('penjualan', 'tambah'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'File Excel (.xlsx) wajib diupload' });
      }

      const originalName = String(req.file.originalname || 'upload.xlsx');
      const nameLower = originalName.toLowerCase();
      if (nameLower && !nameLower.endsWith('.xlsx') && !nameLower.endsWith('.xls')) {
        return res.status(400).json({
          error: 'Hanya file Excel (.xlsx) yang diterima',
        });
      }

      let parsed;
      try {
        parsed = parsePenjualanExcel(req.file.buffer);
      } catch (parseErr) {
        const msg = parseErr?.message || '';
        if (msg.includes('tidak bisa dibaca') || msg.includes('bukan Excel')) {
          return res.status(400).json({ error: msg });
        }
        throw parseErr;
      }

      if (!parsed.items.length) {
        const gagalTgl = parsed.warnings?.gagal_tanggal || 0;
        const gagalAngka = parsed.warnings?.gagal_angka || 0;
        let error = 'Tidak ada baris data valid dari file Excel';
        if (gagalTgl > 0) {
          error = `Tidak ada baris valid — ${gagalTgl} baris gagal dibaca tanggalnya. Pastikan format tanggal dikenali (mis. 01 Mei 2026 atau 01 May 2026).`;
        } else if (gagalAngka > 0) {
          error = `Tidak ada baris valid — ada masalah parse angka (${gagalAngka} baris).`;
        }
        return res.status(400).json({
          error,
          warnings: parsed.warnings,
        });
      }

      const { existingKeys, jumlah_sudah_ada } = await countExistingPairs(parsed.items);
      const diuploadOleh = actorFromReq(req);

      const sessionId = createUploadSession({
        type: 'penjualan',
        items: parsed.items,
        diuploadOleh,
        existingKeys: [...existingKeys],
        namaFile: originalName,
      });

      return res.json({
        session_id: sessionId,
        nama_file: originalName,
        sample: parsed.sample,
        total_baris: parsed.total_baris_valid,
        total_baris_file: parsed.total_baris_file,
        jumlah_sudah_ada,
        jumlah_baru: parsed.total_baris_valid - jumlah_sudah_ada,
        jumlah_perlu_cek: parsed.perlu_cek.length,
        perlu_cek_sample: parsed.perlu_cek.slice(0, 30),
        warnings: parsed.warnings,
        headers: parsed.headers,
        repaired: Boolean(parsed.repaired),
        style_replacements: parsed.style_replacements || 0,
      });
    } catch (err) {
      console.error('[POST /penjualan/parse-preview]', err);
      return res.status(400).json({ error: err.message || 'Gagal parse Excel' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/penjualan/confirm — tahap 2: buat batch + insert baris baru
// ---------------------------------------------------------------------------
router.post('/confirm', requireMenuAksi('penjualan', 'tambah'), async (req, res) => {
  try {
    const sessionId = normalizeText(req.body?.session_id);
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id wajib diisi' });
    }

    const session = consumeUploadSession(sessionId);
    if (!session || session.type !== 'penjualan') {
      return res.status(410).json({
        error: 'Sesi preview sudah habis atau tidak valid — upload ulang file',
      });
    }

    if (!session.items?.length) {
      return res.status(400).json({ error: 'Tidak ada baris valid untuk disimpan' });
    }

    const { existingKeys } = await countExistingPairs(session.items);
    for (const k of session.existingKeys || []) {
      existingKeys.add(k);
    }

    // Hitung dulu berapa yang akan masuk / skip (sebelum insert)
    let willInsert = 0;
    let willSkip = 0;
    const previewKeys = new Set(existingKeys);
    for (const item of session.items) {
      const key = pairKey(item.no_faktur, item.kode_obat);
      if (previewKeys.has(key)) willSkip += 1;
      else {
        previewKeys.add(key);
        willInsert += 1;
      }
    }

    const diuploadOleh = session.diuploadOleh || actorFromReq(req);
    const namaFile = normalizeText(session.namaFile) || 'upload.xlsx';
    const uploadAt = new Date().toISOString();

    const { data: batch, error: batchErr } = await supabase
      .from('penjualan_upload_batch')
      .insert({
        nama_file: namaFile,
        jumlah_baris_masuk: willInsert,
        jumlah_baris_skip_duplikat: willSkip,
        diupload_oleh: diuploadOleh,
        tanggal_upload: uploadAt,
      })
      .select('id')
      .single();

    if (batchErr) throw batchErr;

    let summary;
    try {
      summary = await insertPenjualanRows(session.items, {
        diuploadOleh,
        existingKeys,
        uploadBatchId: batch.id,
      });
    } catch (insertErr) {
      await supabase.from('penjualan_upload_batch').delete().eq('id', batch.id);
      throw insertErr;
    }

    if (summary.masuk !== willInsert || summary.di_skip !== willSkip) {
      await supabase
        .from('penjualan_upload_batch')
        .update({
          jumlah_baris_masuk: summary.masuk,
          jumlah_baris_skip_duplikat: summary.di_skip,
        })
        .eq('id', batch.id);
    }

    return res.status(201).json({
      ...summary,
      upload_batch_id: batch.id,
      nama_file: namaFile,
    });
  } catch (err) {
    console.error('[POST /penjualan/confirm]', err);
    return res.status(500).json({ error: err.message || 'Gagal menyimpan penjualan' });
  }
});

module.exports = router;
