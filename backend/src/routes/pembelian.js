const express = require('express');
const multer = require('multer');
const { supabase } = require('../db');
const {
  createUploadSession,
  consumeUploadSession,
} = require('../lib/uploadSessions');
const { parsePembelianExcel, fakturKey } = require('../lib/pembelianExcel');
const { normalizeText } = require('../lib/penjualanExcel');
const {
  requireAuth,
  requireApproved,
  requireMenuAksi,
} = require('../middleware/auth');

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

/** Cek pasangan (no_faktur, nama_supplier) yang sudah ada di DB */
async function findExistingFakturKeys(fakturList) {
  const existingKeys = new Set();
  if (!fakturList.length) return existingKeys;

  const noFakturSet = [...new Set(fakturList.map((f) => f.no_faktur))];
  const chunkSize = 100;
  for (let i = 0; i < noFakturSet.length; i += chunkSize) {
    const chunk = noFakturSet.slice(i, i + chunkSize);
    const rows = await fetchAllRows(() =>
      supabase
        .from('pembelian_faktur')
        .select('no_faktur, nama_supplier')
        .in('no_faktur', chunk)
    );
    for (const row of rows) {
      existingKeys.add(fakturKey(row.no_faktur, row.nama_supplier));
    }
  }
  return existingKeys;
}

function stripInternalItemFields(item) {
  const { _total_mismatch, ...rest } = item;
  return rest;
}

function stripInternalFakturFields(faktur) {
  const { _baris_header, items, ...rest } = faktur;
  return {
    ...rest,
    items: (items || []).map(stripInternalItemFields),
  };
}

// ---------------------------------------------------------------------------
// GET /api/pembelian/faktur — list paginated (tanpa item)
// ---------------------------------------------------------------------------
router.get('/faktur', requireMenuAksi('pembelian', 'lihat'), async (req, res) => {
  try {
    const limitRaw = parseInt(String(req.query.limit || '20'), 10);
    const offsetRaw = parseInt(String(req.query.offset || '0'), 10);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(1, limitRaw), 50)
      : 20;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
    const q = normalizeText(req.query.q) || '';

    let matchingIdsFromItems = null;
    if (q) {
      // Faktur yang punya item nama_obat cocok (paginated lookup via distinct ids)
      const itemRows = await fetchAllRows(() =>
        supabase
          .from('pembelian_item')
          .select('faktur_id')
          .ilike('nama_obat', `%${q}%`)
      );
      matchingIdsFromItems = [
        ...new Set(
          (itemRows || [])
            .map((r) => r.faktur_id)
            .filter((id) => id != null)
        ),
      ];
    }

    let query = supabase
      .from('pembelian_faktur')
      .select(
        'id, no_faktur, nama_supplier, no_po, jenis_po, status_faktur, tanggal_faktur, tanggal_input, gudang, petugas, jenis_bayar, jatuh_tempo, no_faktur_pajak, subtotal, diskon_tunai, diskon, pajak, biaya, total_transaksi, diupload_oleh, tanggal_upload, nama_file_asal, pembelian_item(count)',
        { count: 'exact' }
      )
      .order('tanggal_faktur', { ascending: true, nullsFirst: false })
      .order('nama_supplier', { ascending: true })
      .order('no_faktur', { ascending: true })
      .range(offset, offset + limit - 1);

    if (q) {
      // Escape karakter khusus filter PostgREST di dalam .or()
      const safe = String(q).replace(/[%_,.()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (safe) {
        const parts = [
          `no_faktur.ilike.%${safe}%`,
          `nama_supplier.ilike.%${safe}%`,
        ];
        if (matchingIdsFromItems?.length) {
          parts.push(`id.in.(${matchingIdsFromItems.join(',')})`);
        }
        query = query.or(parts.join(','));
      }
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const items = (data || []).map((row) => {
      const { pembelian_item: itemAgg, ...rest } = row;
      const jumlahItem = Array.isArray(itemAgg)
        ? Number(itemAgg[0]?.count) || 0
        : Number(itemAgg?.count) || 0;
      return { ...rest, jumlah_item: jumlahItem };
    });

    return res.json({
      items,
      total: count ?? items.length,
      limit,
      offset,
      has_more: offset + items.length < (count ?? 0),
    });
  } catch (err) {
    console.error('[GET /pembelian/faktur]', err);
    return res.status(500).json({
      error: err.message || 'Gagal memuat daftar faktur',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/pembelian/faktur/:id/items — lazy load item per faktur
// ---------------------------------------------------------------------------
router.get(
  '/faktur/:id/items',
  requireMenuAksi('pembelian', 'lihat'),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ error: 'id faktur tidak valid' });
      }

      const limitRaw = parseInt(String(req.query.limit || '100'), 10);
      const offsetRaw = parseInt(String(req.query.offset || '0'), 10);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(1, limitRaw), 200)
        : 100;
      const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

      const { data: faktur, error: fakturErr } = await supabase
        .from('pembelian_faktur')
        .select('id, no_faktur, nama_supplier')
        .eq('id', id)
        .maybeSingle();
      if (fakturErr) throw fakturErr;
      if (!faktur) {
        return res.status(404).json({ error: 'Faktur tidak ditemukan' });
      }

      const { data, error, count } = await supabase
        .from('pembelian_item')
        .select(
          'id, kode_obat, nama_obat, satuan, harga, jumlah, diskon_1, diskon_2, diskon_3, hpp, hna_ppn, tanggal_exp, no_batch, ketentuan_retur, maks_bln_sblm_ed, total',
          { count: 'exact' }
        )
        .eq('faktur_id', id)
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return res.json({
        faktur_id: id,
        no_faktur: faktur.no_faktur,
        nama_supplier: faktur.nama_supplier,
        items: data || [],
        total: count ?? (data || []).length,
        limit,
        offset,
        has_more: offset + (data || []).length < (count ?? 0),
      });
    } catch (err) {
      console.error('[GET /pembelian/faktur/:id/items]', err);
      return res.status(500).json({
        error: err.message || 'Gagal memuat item faktur',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/pembelian/parse-preview — tahap 1: parse saja
// ---------------------------------------------------------------------------
router.post(
  '/parse-preview',
  requireMenuAksi('pembelian', 'tambah'),
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'File Excel (.xlsx) wajib diupload' });
      }

      const originalName = String(req.file.originalname || 'upload.xlsx');
      const nameLower = originalName.toLowerCase();
      if (
        nameLower &&
        !nameLower.endsWith('.xlsx') &&
        !nameLower.endsWith('.xls')
      ) {
        return res.status(400).json({
          error: 'Hanya file Excel (.xlsx) yang diterima',
        });
      }

      let parsed;
      try {
        parsed = parsePembelianExcel(req.file.buffer);
      } catch (parseErr) {
        const msg = parseErr?.message || '';
        if (msg.includes('tidak bisa dibaca') || msg.includes('bukan Excel')) {
          return res.status(400).json({ error: msg });
        }
        throw parseErr;
      }

      if (!parsed.faktur.length) {
        return res.status(400).json({
          error: 'Tidak ada faktur valid dari file Excel',
          warnings: parsed.warnings,
        });
      }

      const existingKeys = await findExistingFakturKeys(parsed.faktur);
      const fakturBaru = [];
      const fakturDilewati = [];

      for (const f of parsed.faktur) {
        const key = fakturKey(f.no_faktur, f.nama_supplier);
        if (existingKeys.has(key)) {
          fakturDilewati.push({
            no_faktur: f.no_faktur,
            nama_supplier: f.nama_supplier,
            tanggal_faktur: f.tanggal_faktur,
            total_transaksi: f.total_transaksi,
            jumlah_item: f.items.length,
          });
        } else {
          fakturBaru.push(f);
        }
      }

      const diuploadOleh = actorFromReq(req);
      const sessionId = createUploadSession({
        type: 'pembelian',
        fakturBaru: fakturBaru.map(stripInternalFakturFields),
        diuploadOleh,
        namaFile: originalName,
      });

      const totalItemBaru = fakturBaru.reduce(
        (n, f) => n + (f.items?.length || 0),
        0
      );

      return res.json({
        session_id: sessionId,
        nama_file: originalName,
        jumlah_faktur_baru: fakturBaru.length,
        jumlah_faktur_dilewati: fakturDilewati.length,
        jumlah_item_baru: totalItemBaru,
        total_faktur_file: parsed.total_faktur,
        total_item_file: parsed.total_item,
        faktur_baru_preview: fakturBaru.slice(0, 50).map((f) => ({
          no_faktur: f.no_faktur,
          nama_supplier: f.nama_supplier,
          tanggal_faktur: f.tanggal_faktur,
          jenis_bayar: f.jenis_bayar,
          total_transaksi: f.total_transaksi,
          jumlah_item: f.items.length,
        })),
        faktur_dilewati: fakturDilewati.slice(0, 100),
        sample: parsed.sample,
        warnings: parsed.warnings,
        repaired: Boolean(parsed.repaired),
        style_replacements: parsed.style_replacements || 0,
      });
    } catch (err) {
      console.error('[POST /pembelian/parse-preview]', err);
      return res.status(400).json({ error: err.message || 'Gagal parse Excel' });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /api/pembelian/confirm — tahap 2: insert faktur_baru + items
// ---------------------------------------------------------------------------
router.post('/confirm', requireMenuAksi('pembelian', 'tambah'), async (req, res) => {
  try {
    const sessionId = normalizeText(req.body?.session_id);
    if (!sessionId) {
      return res.status(400).json({ error: 'session_id wajib diisi' });
    }

    const session = consumeUploadSession(sessionId);
    if (!session || session.type !== 'pembelian') {
      return res.status(410).json({
        error: 'Sesi preview sudah habis atau tidak valid — upload ulang file',
      });
    }

    const fakturBaru = Array.isArray(session.fakturBaru) ? session.fakturBaru : [];
    if (!fakturBaru.length) {
      return res.status(400).json({ error: 'Tidak ada faktur baru untuk disimpan' });
    }

    // Re-check duplikat (race-safe)
    const existingKeys = await findExistingFakturKeys(fakturBaru);
    const toSave = fakturBaru.filter(
      (f) => !existingKeys.has(fakturKey(f.no_faktur, f.nama_supplier))
    );

    if (!toSave.length) {
      return res.json({
        faktur_tersimpan: 0,
        item_tersimpan: 0,
        faktur_dilewati: fakturBaru.length,
        message: 'Semua faktur sudah ada di database',
      });
    }

    const diuploadOleh = session.diuploadOleh || actorFromReq(req);
    const namaFile = normalizeText(session.namaFile) || 'upload.xlsx';
    const uploadAt = new Date().toISOString();

    let fakturTersimpan = 0;
    let itemTersimpan = 0;
    let fakturDilewati = fakturBaru.length - toSave.length;

    for (const f of toSave) {
      const items = (f.items || []).filter((it) => normalizeText(it.kode_obat));
      const header = {
        no_faktur: f.no_faktur,
        nama_supplier: f.nama_supplier,
        no_po: f.no_po || null,
        jenis_po: f.jenis_po || null,
        status_faktur: f.status_faktur || null,
        tanggal_faktur: f.tanggal_faktur || null,
        tanggal_input: f.tanggal_input || null,
        gudang: f.gudang || null,
        petugas: f.petugas || null,
        jenis_bayar: f.jenis_bayar || null,
        jatuh_tempo: f.jatuh_tempo || null,
        no_faktur_pajak: f.no_faktur_pajak || null,
        subtotal: f.subtotal,
        diskon_tunai: f.diskon_tunai,
        diskon: f.diskon,
        pajak: f.pajak,
        biaya: f.biaya,
        total_transaksi: f.total_transaksi,
        diupload_oleh: diuploadOleh,
        tanggal_upload: uploadAt,
        nama_file_asal: namaFile,
      };

      const { data: inserted, error: insertErr } = await supabase
        .from('pembelian_faktur')
        .insert(header)
        .select('id')
        .single();

      if (insertErr) {
        if (insertErr.code === '23505') {
          fakturDilewati += 1;
          continue;
        }
        throw insertErr;
      }

      fakturTersimpan += 1;
      const fakturId = inserted.id;

      if (!items.length) continue;

      const itemRows = items.map((it) => ({
        faktur_id: fakturId,
        kode_obat: it.kode_obat,
        nama_obat: it.nama_obat || null,
        satuan: it.satuan || null,
        harga: it.harga,
        jumlah: it.jumlah,
        diskon_1: it.diskon_1 ?? 0,
        diskon_2: it.diskon_2 ?? 0,
        diskon_3: it.diskon_3 ?? 0,
        hpp: it.hpp,
        hna_ppn: it.hna_ppn,
        tanggal_exp: it.tanggal_exp || null,
        no_batch: it.no_batch || null,
        ketentuan_retur: it.ketentuan_retur || null,
        maks_bln_sblm_ed: it.maks_bln_sblm_ed,
        total: it.total,
      }));

      const chunkSize = 200;
      for (let i = 0; i < itemRows.length; i += chunkSize) {
        const chunk = itemRows.slice(i, i + chunkSize);
        const { error: itemErr } = await supabase
          .from('pembelian_item')
          .insert(chunk);
        if (itemErr) throw itemErr;
        itemTersimpan += chunk.length;
      }
    }

    return res.json({
      faktur_tersimpan: fakturTersimpan,
      item_tersimpan: itemTersimpan,
      faktur_dilewati: fakturDilewati,
      nama_file: namaFile,
      diupload_oleh: diuploadOleh,
      tanggal_upload: uploadAt,
    });
  } catch (err) {
    console.error('[POST /pembelian/confirm]', err);
    return res.status(500).json({
      error: err.message || 'Gagal menyimpan pembelian',
    });
  }
});

module.exports = router;
