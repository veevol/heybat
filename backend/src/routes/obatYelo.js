const express = require('express');
const { supabase } = require('../db');

const router = express.Router();

const OBAT_SELECT = `
  kode_obat,
  nama_obat,
  kandungan_id,
  golongan_id,
  satuan_1_id,
  konversi,
  satuan_2_id,
  min_jual,
  grup_substitusi_id,
  created_at,
  updated_at,
  kandungan:ref_kandungan ( id, nama ),
  golongan:ref_golongan ( id, nama ),
  satuan_1:ref_satuan!obat_yelo_satuan_1_id_fkey ( id, nama ),
  satuan_2:ref_satuan!obat_yelo_satuan_2_id_fkey ( id, nama ),
  grup_substitusi:ref_grup_substitusi ( id, nama )
`;

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function parseOptionalNumber(value, fieldLabel) {
  if (value === undefined || value === null || value === '') {
    return { value: null };
  }
  const num = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(num)) {
    return { error: `${fieldLabel} harus berupa angka` };
  }
  return { value: num };
}

function isUniqueViolation(error) {
  if (!error) return false;
  return (
    error.code === '23505' ||
    /duplicate key|unique constraint/i.test(error.message || '')
  );
}

function isCheckViolation(error) {
  if (!error) return false;
  return (
    error.code === '23514' ||
    /tidak bisa diubah|check_violation/i.test(error.message || '')
  );
}

function buildPayload(body, { requireKode = false } = {}) {
  const nama_obat = normalizeText(body?.nama_obat);
  if (!nama_obat) {
    return { error: 'Nama obat wajib diisi' };
  }

  let kode_obat = undefined;
  if (requireKode) {
    kode_obat = normalizeText(body?.kode_obat);
    if (!kode_obat) {
      return { error: 'Kode obat wajib diisi' };
    }
  }

  const konversi = parseOptionalNumber(body?.konversi, 'Konversi');
  if (konversi.error) return { error: konversi.error };
  const min_jual = parseOptionalNumber(body?.min_jual, 'Min jual');
  if (min_jual.error) return { error: min_jual.error };

  const payload = {
    nama_obat,
    kandungan_id: normalizeText(body?.kandungan_id),
    golongan_id: normalizeText(body?.golongan_id),
    satuan_1_id: normalizeText(body?.satuan_1_id),
    satuan_2_id: normalizeText(body?.satuan_2_id),
    grup_substitusi_id: normalizeText(body?.grup_substitusi_id),
    konversi: konversi.value,
    min_jual: min_jual.value,
  };

  if (requireKode) {
    payload.kode_obat = kode_obat;
  }

  return { payload };
}

async function fetchObatByKode(kodeObat) {
  const { data, error } = await supabase
    .from('obat_yelo')
    .select(OBAT_SELECT)
    .eq('kode_obat', kodeObat)
    .maybeSingle();
  return { data, error };
}

// GET /api/obat-yelo?page=1&limit=50&search=
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limitRaw = parseInt(String(req.query.limit || '50'), 10) || 50;
    const limit = Math.min(100, Math.max(1, limitRaw));
    const search = normalizeText(req.query.search);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from('obat_yelo')
      .select(OBAT_SELECT, { count: 'exact' })
      .order('nama_obat', { ascending: true })
      .range(from, to);

    if (search) {
      const escaped = search.replace(/[%_]/g, '\\$&');
      query = query.or(
        `nama_obat.ilike.%${escaped}%,kode_obat.ilike.%${escaped}%`
      );
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('[GET /obat-yelo]', error);
      return res.status(500).json({ error: 'Gagal mengambil data obat' });
    }

    const total = count ?? 0;
    return res.json({
      data: data ?? [],
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    console.error('[GET /obat-yelo]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// GET /api/obat-yelo/:kodeObat
router.get('/:kodeObat', async (req, res) => {
  try {
    const kodeObat = decodeURIComponent(req.params.kodeObat);
    const { data, error } = await fetchObatByKode(kodeObat);
    if (error) {
      console.error('[GET /obat-yelo/:kode]', error);
      return res.status(500).json({ error: 'Gagal mengambil data obat' });
    }
    if (!data) {
      return res.status(404).json({ error: 'Obat tidak ditemukan' });
    }
    return res.json(data);
  } catch (err) {
    console.error('[GET /obat-yelo/:kode]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /api/obat-yelo
router.post('/', async (req, res) => {
  try {
    const built = buildPayload(req.body, { requireKode: true });
    if (built.error) {
      return res.status(400).json({ error: built.error });
    }

    const { data: created, error } = await supabase
      .from('obat_yelo')
      .insert(built.payload)
      .select('kode_obat')
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: 'Kode obat sudah dipakai' });
      }
      console.error('[POST /obat-yelo]', error);
      return res.status(500).json({ error: 'Gagal membuat obat' });
    }

    const { data, error: fetchError } = await fetchObatByKode(created.kode_obat);
    if (fetchError) {
      console.error('[POST /obat-yelo] fetch', fetchError);
      return res.status(500).json({ error: 'Obat dibuat, gagal memuat ulang data' });
    }
    return res.status(201).json(data);
  } catch (err) {
    console.error('[POST /obat-yelo]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/obat-yelo/:kodeObat
router.put('/:kodeObat', async (req, res) => {
  try {
    const kodeObat = decodeURIComponent(req.params.kodeObat);

    const { data: existing, error: findError } = await supabase
      .from('obat_yelo')
      .select('kode_obat')
      .eq('kode_obat', kodeObat)
      .maybeSingle();

    if (findError) {
      console.error('[PUT /obat-yelo] find', findError);
      return res.status(500).json({ error: 'Gagal mengambil data obat' });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Obat tidak ditemukan' });
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'kode_obat') &&
      normalizeText(req.body.kode_obat) !== kodeObat
    ) {
      return res.status(400).json({
        error: 'Kode obat tidak bisa diubah setelah dibuat',
      });
    }

    const built = buildPayload(req.body, { requireKode: false });
    if (built.error) {
      return res.status(400).json({ error: built.error });
    }

    const { error } = await supabase
      .from('obat_yelo')
      .update(built.payload)
      .eq('kode_obat', kodeObat);

    if (error) {
      if (isCheckViolation(error)) {
        return res.status(400).json({
          error: 'Kode obat tidak bisa diubah setelah dibuat',
        });
      }
      console.error('[PUT /obat-yelo]', error);
      return res.status(500).json({ error: 'Gagal memperbarui obat' });
    }

    const { data, error: fetchError } = await fetchObatByKode(kodeObat);
    if (fetchError) {
      console.error('[PUT /obat-yelo] fetch', fetchError);
      return res.status(500).json({ error: 'Update berhasil, gagal memuat ulang data' });
    }
    return res.json(data);
  } catch (err) {
    console.error('[PUT /obat-yelo]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// DELETE /api/obat-yelo/:kodeObat
router.delete('/:kodeObat', async (req, res) => {
  try {
    const kodeObat = decodeURIComponent(req.params.kodeObat);
    const { data, error } = await supabase
      .from('obat_yelo')
      .delete()
      .eq('kode_obat', kodeObat)
      .select('kode_obat')
      .maybeSingle();

    if (error) {
      console.error('[DELETE /obat-yelo]', error);
      return res.status(500).json({ error: 'Gagal menghapus obat' });
    }
    if (!data) {
      return res.status(404).json({ error: 'Obat tidak ditemukan' });
    }
    return res.status(204).send();
  } catch (err) {
    console.error('[DELETE /obat-yelo]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
