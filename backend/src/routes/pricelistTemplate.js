const express = require('express');
const { supabase } = require('../db');

const router = express.Router();

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

// GET /api/pricelist-template/:pbfId
router.get('/:pbfId', async (req, res) => {
  try {
    const { pbfId } = req.params;
    const { data, error } = await supabase
      .from('pricelist_template_mapping')
      .select('*')
      .eq('pbf_id', pbfId)
      .maybeSingle();

    if (error) {
      console.error('[GET template]', error);
      return res.status(500).json({ error: 'Gagal mengambil template mapping' });
    }
    if (!data) {
      return res.status(404).json({ error: 'Template belum ada untuk PBF ini' });
    }
    return res.json(data);
  } catch (err) {
    console.error('[GET template]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /api/pricelist-template
router.post('/', async (req, res) => {
  try {
    const pbfId = normalizeText(req.body?.pbf_id);
    const namaKolomBarang = normalizeText(req.body?.nama_kolom_barang);
    const barisMulai = normalizeBaris(req.body?.baris_mulai_data ?? 2);

    if (!pbfId || !namaKolomBarang || !barisMulai) {
      return res.status(400).json({
        error: 'pbf_id, nama_kolom_barang, dan baris_mulai_data wajib diisi',
      });
    }

    const payload = {
      pbf_id: pbfId,
      nama_kolom_barang: namaKolomBarang,
      nama_kolom_qty: normalizeText(req.body?.nama_kolom_qty),
      nama_kolom_harga: normalizeText(req.body?.nama_kolom_harga),
      nama_kolom_satuan: normalizeText(req.body?.nama_kolom_satuan),
      baris_mulai_data: barisMulai,
    };

    const { data, error } = await supabase
      .from('pricelist_template_mapping')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Template untuk PBF ini sudah ada' });
      }
      console.error('[POST template]', error);
      return res.status(500).json({ error: 'Gagal membuat template' });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('[POST template]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/pricelist-template/:pbfId
router.put('/:pbfId', async (req, res) => {
  try {
    const { pbfId } = req.params;
    const namaKolomBarang = normalizeText(req.body?.nama_kolom_barang);
    const barisMulai = normalizeBaris(req.body?.baris_mulai_data);

    if (!namaKolomBarang || !barisMulai) {
      return res.status(400).json({
        error: 'nama_kolom_barang dan baris_mulai_data wajib diisi',
      });
    }

    const payload = {
      nama_kolom_barang: namaKolomBarang,
      nama_kolom_qty: normalizeText(req.body?.nama_kolom_qty),
      nama_kolom_harga: normalizeText(req.body?.nama_kolom_harga),
      nama_kolom_satuan: normalizeText(req.body?.nama_kolom_satuan),
      baris_mulai_data: barisMulai,
    };

    const { data, error } = await supabase
      .from('pricelist_template_mapping')
      .update(payload)
      .eq('pbf_id', pbfId)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[PUT template]', error);
      return res.status(500).json({ error: 'Gagal memperbarui template' });
    }
    if (!data) {
      return res.status(404).json({ error: 'Template tidak ditemukan' });
    }

    return res.json(data);
  } catch (err) {
    console.error('[PUT template]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
