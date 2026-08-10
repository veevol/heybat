const express = require('express');
const { supabase } = require('../db');
const { normalizeText } = require('../lib/penjualanExcel');
const {
  requireAuth,
  requireApproved,
  requireMenuAksi,
} = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireApproved);

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

function coerceAngka(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
}

function coerceDateOnly(value) {
  const text = normalizeText(value);
  if (!text) return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeStatus(totalTransaksi, totalBayar, lunasManual) {
  const total = Number(totalTransaksi) || 0;
  const bayar = Number(totalBayar) || 0;
  const sisa = total - bayar;
  if (lunasManual || sisa <= 0) return 'lunas';
  if (bayar > 0) return 'cicilan';
  return 'belum_bayar';
}

async function loadPaymentAggByFakturIds(fakturIds) {
  const map = new Map();
  if (!fakturIds.length) return map;

  const chunkSize = 100;
  for (let i = 0; i < fakturIds.length; i += chunkSize) {
    const chunk = fakturIds.slice(i, i + chunkSize);
    const rows = await fetchAllRows(() =>
      supabase
        .from('pembayaran_hutang')
        .select('faktur_id, nominal, ditandai_lunas_manual')
        .in('faktur_id', chunk)
    );
    for (const row of rows) {
      const id = row.faktur_id;
      let agg = map.get(id);
      if (!agg) {
        agg = { total_bayar: 0, lunas_manual: false, jumlah_bayar: 0 };
        map.set(id, agg);
      }
      agg.total_bayar += Number(row.nominal) || 0;
      agg.jumlah_bayar += 1;
      if (row.ditandai_lunas_manual) agg.lunas_manual = true;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// GET /faktur-hutang
// ---------------------------------------------------------------------------
router.get(
  '/faktur-hutang',
  requireMenuAksi('pembelian', 'lihat'),
  async (req, res) => {
    try {
      const limitRaw = parseInt(String(req.query.limit || '20'), 10);
      const offsetRaw = parseInt(String(req.query.offset || '0'), 10);
      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(1, limitRaw), 50)
        : 20;
      const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;
      const statusFilter = String(req.query.status || 'semua')
        .trim()
        .toLowerCase();
      const q = normalizeText(req.query.q) || '';

      const fakturRows = await fetchAllRows(() => {
        let query = supabase
          .from('pembelian_faktur')
          .select(
            'id, no_faktur, nama_supplier, tanggal_faktur, jatuh_tempo, total_transaksi, jenis_bayar'
          )
          .ilike('jenis_bayar', 'HUTANG')
          .order('tanggal_faktur', { ascending: false, nullsFirst: false })
          .order('id', { ascending: false });
        if (q) {
          const safe = String(q)
            .replace(/[%_,.()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (safe) {
            query = query.or(
              `no_faktur.ilike.%${safe}%,nama_supplier.ilike.%${safe}%`
            );
          }
        }
        return query;
      });

      const ids = fakturRows.map((f) => f.id);
      const payMap = await loadPaymentAggByFakturIds(ids);

      let enriched = fakturRows.map((f) => {
        const agg = payMap.get(f.id) || {
          total_bayar: 0,
          lunas_manual: false,
          jumlah_bayar: 0,
        };
        const total = Number(f.total_transaksi) || 0;
        const sisa = total - agg.total_bayar;
        const status = computeStatus(
          total,
          agg.total_bayar,
          agg.lunas_manual
        );
        return {
          id: f.id,
          no_faktur: f.no_faktur,
          nama_supplier: f.nama_supplier,
          tanggal_faktur: f.tanggal_faktur,
          jatuh_tempo: f.jatuh_tempo,
          total_transaksi: f.total_transaksi,
          total_bayar: agg.total_bayar,
          sisa_hutang: sisa < 0 ? 0 : sisa,
          status,
          lunas_manual: agg.lunas_manual,
          jumlah_pembayaran: agg.jumlah_bayar,
        };
      });

      if (
        statusFilter === 'lunas' ||
        statusFilter === 'cicilan' ||
        statusFilter === 'belum_bayar'
      ) {
        enriched = enriched.filter((row) => row.status === statusFilter);
      }

      const total = enriched.length;
      const page = enriched.slice(offset, offset + limit);

      return res.json({
        items: page,
        total,
        limit,
        offset,
        has_more: offset + page.length < total,
        status_filter: statusFilter || 'semua',
      });
    } catch (err) {
      console.error('[GET /pembelian/faktur-hutang]', err);
      return res.status(500).json({
        error: err.message || 'Gagal memuat faktur hutang',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /faktur-hutang/:id/pembayaran
// ---------------------------------------------------------------------------
router.get(
  '/faktur-hutang/:id/pembayaran',
  requireMenuAksi('pembelian', 'lihat'),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ error: 'id faktur tidak valid' });
      }

      const { data: faktur, error: fakturErr } = await supabase
        .from('pembelian_faktur')
        .select(
          'id, no_faktur, nama_supplier, tanggal_faktur, jatuh_tempo, total_transaksi, jenis_bayar'
        )
        .eq('id', id)
        .maybeSingle();
      if (fakturErr) throw fakturErr;
      if (!faktur) {
        return res.status(404).json({ error: 'Faktur tidak ditemukan' });
      }

      const { data, error } = await supabase
        .from('pembayaran_hutang')
        .select(
          'id, faktur_id, tanggal_bayar, nominal, metode_bayar, catatan, ditandai_lunas_manual, diinput_oleh, tanggal_input, diedit_oleh, tanggal_edit'
        )
        .eq('faktur_id', id)
        .order('tanggal_bayar', { ascending: false })
        .order('id', { ascending: false });
      if (error) throw error;

      const items = data || [];
      const totalBayar = items.reduce(
        (n, row) => n + (Number(row.nominal) || 0),
        0
      );
      const lunasManual = items.some((row) => row.ditandai_lunas_manual);
      const total = Number(faktur.total_transaksi) || 0;
      const sisa = total - totalBayar;

      return res.json({
        faktur: {
          id: faktur.id,
          no_faktur: faktur.no_faktur,
          nama_supplier: faktur.nama_supplier,
          tanggal_faktur: faktur.tanggal_faktur,
          jatuh_tempo: faktur.jatuh_tempo,
          total_transaksi: faktur.total_transaksi,
          sisa_hutang: sisa < 0 ? 0 : sisa,
          status: computeStatus(total, totalBayar, lunasManual),
        },
        items,
        total_bayar: totalBayar,
      });
    } catch (err) {
      console.error('[GET /pembelian/faktur-hutang/:id/pembayaran]', err);
      return res.status(500).json({
        error: err.message || 'Gagal memuat riwayat pembayaran',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /faktur-hutang/:id/pembayaran
// ---------------------------------------------------------------------------
router.post(
  '/faktur-hutang/:id/pembayaran',
  requireMenuAksi('pembelian', 'tambah'),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ error: 'id faktur tidak valid' });
      }

      const { data: faktur, error: fakturErr } = await supabase
        .from('pembelian_faktur')
        .select('id, jenis_bayar')
        .eq('id', id)
        .maybeSingle();
      if (fakturErr) throw fakturErr;
      if (!faktur) {
        return res.status(404).json({ error: 'Faktur tidak ditemukan' });
      }
      if (String(faktur.jenis_bayar || '').toUpperCase() !== 'HUTANG') {
        return res.status(400).json({
          error: 'Pembayaran hanya untuk faktur jenis HUTANG',
        });
      }

      const tanggalBayar = coerceDateOnly(req.body?.tanggal_bayar);
      const nominal = coerceAngka(req.body?.nominal);
      if (!tanggalBayar) {
        return res.status(400).json({ error: 'tanggal_bayar wajib diisi' });
      }
      if (nominal === null || nominal < 0) {
        return res.status(400).json({ error: 'nominal tidak valid' });
      }

      const row = {
        faktur_id: id,
        tanggal_bayar: tanggalBayar,
        nominal,
        metode_bayar: normalizeText(req.body?.metode_bayar),
        catatan: normalizeText(req.body?.catatan),
        ditandai_lunas_manual: Boolean(req.body?.ditandai_lunas_manual),
        diinput_oleh: actorFromReq(req),
        tanggal_input: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('pembayaran_hutang')
        .insert(row)
        .select(
          'id, faktur_id, tanggal_bayar, nominal, metode_bayar, catatan, ditandai_lunas_manual, diinput_oleh, tanggal_input, diedit_oleh, tanggal_edit'
        )
        .single();
      if (error) throw error;

      return res.status(201).json({ item: data });
    } catch (err) {
      console.error('[POST /pembelian/faktur-hutang/:id/pembayaran]', err);
      return res.status(500).json({
        error: err.message || 'Gagal menambah pembayaran',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /pembayaran/:id
// ---------------------------------------------------------------------------
router.put(
  '/pembayaran/:id',
  requireMenuAksi('pembelian', 'edit'),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ error: 'id pembayaran tidak valid' });
      }

      const tanggalBayar = coerceDateOnly(req.body?.tanggal_bayar);
      const nominal = coerceAngka(req.body?.nominal);
      if (!tanggalBayar) {
        return res.status(400).json({ error: 'tanggal_bayar wajib diisi' });
      }
      if (nominal === null || nominal < 0) {
        return res.status(400).json({ error: 'nominal tidak valid' });
      }

      const patch = {
        tanggal_bayar: tanggalBayar,
        nominal,
        metode_bayar: normalizeText(req.body?.metode_bayar),
        catatan: normalizeText(req.body?.catatan),
        ditandai_lunas_manual: Boolean(req.body?.ditandai_lunas_manual),
        diedit_oleh: actorFromReq(req),
        tanggal_edit: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('pembayaran_hutang')
        .update(patch)
        .eq('id', id)
        .select(
          'id, faktur_id, tanggal_bayar, nominal, metode_bayar, catatan, ditandai_lunas_manual, diinput_oleh, tanggal_input, diedit_oleh, tanggal_edit'
        )
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
      }

      return res.json({ item: data });
    } catch (err) {
      console.error('[PUT /pembelian/pembayaran/:id]', err);
      return res.status(500).json({
        error: err.message || 'Gagal mengedit pembayaran',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /pembayaran/:id
// ---------------------------------------------------------------------------
router.delete(
  '/pembayaran/:id',
  requireMenuAksi('pembelian', 'hapus'),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ error: 'id pembayaran tidak valid' });
      }

      const { data, error } = await supabase
        .from('pembayaran_hutang')
        .delete()
        .eq('id', id)
        .select('id, faktur_id')
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return res.status(404).json({ error: 'Pembayaran tidak ditemukan' });
      }

      return res.json({ deleted: true, id: data.id, faktur_id: data.faktur_id });
    } catch (err) {
      console.error('[DELETE /pembelian/pembayaran/:id]', err);
      return res.status(500).json({
        error: err.message || 'Gagal menghapus pembayaran',
      });
    }
  }
);

module.exports = router;
