const express = require('express');
const { supabase } = require('../db');
const {
  requireAuth,
  requireApproved,
  requireMenuAksi,
} = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireApproved);

const REF_TABLES = {
  kandungan: 'ref_kandungan',
  golongan: 'ref_golongan',
  satuan: 'ref_satuan',
  'grup-substitusi': 'ref_grup_substitusi',
};

function resolveTable(jenis) {
  return REF_TABLES[jenis] || null;
}

function normalizeNama(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function isUniqueViolation(error) {
  if (!error) return false;
  return (
    error.code === '23505' ||
    /duplicate key|unique constraint/i.test(error.message || '')
  );
}

// GET /api/ref/:jenis
router.get('/:jenis', requireMenuAksi('data-obat-yelo', 'lihat'), async (req, res) => {
  try {
    const table = resolveTable(req.params.jenis);
    if (!table) {
      return res.status(400).json({
        error: 'Jenis referensi tidak valid (kandungan|golongan|satuan|grup-substitusi)',
      });
    }

    const { data, error } = await supabase
      .from(table)
      .select('id, nama')
      .order('nama', { ascending: true });

    if (error) {
      console.error(`[GET /ref/${req.params.jenis}]`, error);
      return res.status(500).json({ error: 'Gagal mengambil data referensi' });
    }
    return res.json(data ?? []);
  } catch (err) {
    console.error(`[GET /ref/${req.params.jenis}]`, err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /api/ref/:jenis
router.post('/:jenis', requireMenuAksi('data-obat-yelo', 'tambah'), async (req, res) => {
  try {
    const table = resolveTable(req.params.jenis);
    if (!table) {
      return res.status(400).json({
        error: 'Jenis referensi tidak valid (kandungan|golongan|satuan|grup-substitusi)',
      });
    }

    const nama = normalizeNama(req.body?.nama);
    if (!nama) {
      return res.status(400).json({ error: 'Nama wajib diisi' });
    }

    const { data: existing, error: findError } = await supabase
      .from(table)
      .select('id, nama')
      .ilike('nama', nama)
      .maybeSingle();

    if (findError) {
      console.error(`[POST /ref/${req.params.jenis}] find`, findError);
      return res.status(500).json({ error: 'Gagal memvalidasi nama referensi' });
    }
    if (existing) {
      return res.status(409).json({
        error: `Nilai "${existing.nama}" sudah ada`,
      });
    }

    const { data, error } = await supabase
      .from(table)
      .insert({ nama })
      .select('id, nama')
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: `Nilai "${nama}" sudah ada` });
      }
      console.error(`[POST /ref/${req.params.jenis}]`, error);
      return res.status(500).json({ error: 'Gagal menambah nilai referensi' });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error(`[POST /ref/${req.params.jenis}]`, err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
