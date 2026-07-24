const express = require('express');
const { supabase } = require('../db');
const {
  requireAuth,
  requireApproved,
  requireMenuAksi,
} = require('../middleware/auth');
const {
  SELECT_WITH_JADWAL,
  normalizeText,
  normalizeGender,
  normalizeJenisPbf,
  withSortedJadwal,
  normalizeJadwalPayload,
} = require('./supplierHelpers');

const router = express.Router();

router.use(requireAuth, requireApproved);

function isUniqueViolation(error) {
  if (!error) return false;
  return (
    error.code === '23505' ||
    /duplicate key|unique constraint|supplier_inisial_unique/i.test(error.message || '')
  );
}

async function fetchSupplierById(id) {
  const { data, error } = await supabase
    .from('supplier')
    .select(SELECT_WITH_JADWAL)
    .eq('id', id)
    .maybeSingle();
  return { data: withSortedJadwal(data), error };
}

async function applyJadwalUpdates(supplierId, jadwalRows) {
  for (const row of jadwalRows) {
    const { error } = await supabase
      .from('supplier_jadwal')
      .update({
        bisa_order: row.bisa_order,
        bisa_kirim: row.bisa_kirim,
        jam_cutoff: row.jam_cutoff,
      })
      .eq('supplier_id', supplierId)
      .eq('hari', row.hari);

    if (error) return error;
  }
  return null;
}

// GET /api/suppliers
router.get('/', requireMenuAksi('data-supplier', 'lihat'), async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('supplier')
      .select(SELECT_WITH_JADWAL)
      .order('nama', { ascending: true });

    if (error) {
      console.error('[GET /suppliers]', error);
      return res.status(500).json({ error: 'Gagal mengambil data supplier' });
    }

    return res.json((data ?? []).map(withSortedJadwal));
  } catch (err) {
    console.error('[GET /suppliers]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// POST /api/suppliers
router.post('/', requireMenuAksi('data-supplier', 'tambah'), async (req, res) => {
  try {
    const nama = normalizeText(req.body?.nama);
    const inisial = normalizeText(req.body?.inisial);
    const jenisKelamin = normalizeGender(req.body?.jenis_kelamin_sales);
    const jenisPbf = normalizeJenisPbf(req.body?.jenis_pbf ?? []);

    if (!nama || !inisial) {
      return res.status(400).json({ error: 'Nama dan inisial wajib diisi' });
    }
    if (jenisKelamin === undefined) {
      return res.status(400).json({ error: 'Jenis kelamin sales harus L, P, atau kosong' });
    }
    if (jenisPbf === undefined) {
      return res.status(400).json({ error: 'Jenis PBF tidak valid' });
    }

    let jadwalRows = null;
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'jadwal')) {
      const parsed = normalizeJadwalPayload(req.body.jadwal);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      jadwalRows = parsed.data;
    }

    const payload = {
      nama,
      inisial,
      no_telp_pbf: normalizeText(req.body?.no_telp_pbf),
      nama_sales: normalizeText(req.body?.nama_sales),
      no_wa_sales: normalizeText(req.body?.no_wa_sales),
      jenis_kelamin_sales: jenisKelamin,
      logo_url: normalizeText(req.body?.logo_url),
      jenis_pbf: jenisPbf,
      alamat: normalizeText(req.body?.alamat),
    };

    const { data: created, error } = await supabase
      .from('supplier')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: 'Inisial sudah dipakai' });
      }
      console.error('[POST /suppliers]', error);
      return res.status(500).json({ error: 'Gagal membuat supplier' });
    }

    if (jadwalRows) {
      const jadwalError = await applyJadwalUpdates(created.id, jadwalRows);
      if (jadwalError) {
        console.error('[POST /suppliers] jadwal', jadwalError);
        return res.status(500).json({ error: 'Supplier dibuat, tetapi jadwal gagal disimpan' });
      }
    }

    const { data, error: fetchError } = await fetchSupplierById(created.id);
    if (fetchError) {
      console.error('[POST /suppliers] fetch', fetchError);
      return res.status(500).json({ error: 'Supplier dibuat, gagal memuat ulang data' });
    }

    return res.status(201).json(data);
  } catch (err) {
    console.error('[POST /suppliers]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/suppliers/:id/jadwal  (must be before /:id)
router.put('/:id/jadwal', requireMenuAksi('data-supplier', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = normalizeJadwalPayload(req.body?.jadwal ?? req.body);

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const { data: existing, error: findError } = await supabase
      .from('supplier')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (findError) {
      console.error('[PUT /suppliers/:id/jadwal] find', findError);
      return res.status(500).json({ error: 'Gagal mengambil data supplier' });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    }

    const jadwalError = await applyJadwalUpdates(id, parsed.data);
    if (jadwalError) {
      console.error('[PUT /suppliers/:id/jadwal]', jadwalError);
      return res.status(500).json({ error: 'Gagal memperbarui jadwal' });
    }

    const { data, error } = await fetchSupplierById(id);
    if (error) {
      console.error('[PUT /suppliers/:id/jadwal] fetch', error);
      return res.status(500).json({ error: 'Jadwal tersimpan, gagal memuat ulang data' });
    }

    return res.json(data);
  } catch (err) {
    console.error('[PUT /suppliers/:id/jadwal]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', requireMenuAksi('data-supplier', 'edit'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: findError } = await supabase
      .from('supplier')
      .select('id, inisial')
      .eq('id', id)
      .maybeSingle();

    if (findError) {
      console.error('[PUT /suppliers] find', findError);
      return res.status(500).json({ error: 'Gagal mengambil data supplier' });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body ?? {}, 'inisial') &&
      normalizeText(req.body.inisial) !== existing.inisial
    ) {
      return res.status(400).json({
        error: 'Inisial tidak bisa diubah setelah dibuat',
      });
    }

    const nama = normalizeText(req.body?.nama);
    if (!nama) {
      return res.status(400).json({ error: 'Nama wajib diisi' });
    }

    const jenisKelamin = normalizeGender(req.body?.jenis_kelamin_sales);
    const jenisPbf = normalizeJenisPbf(req.body?.jenis_pbf ?? []);
    if (jenisKelamin === undefined) {
      return res.status(400).json({ error: 'Jenis kelamin sales harus L, P, atau kosong' });
    }
    if (jenisPbf === undefined) {
      return res.status(400).json({ error: 'Jenis PBF tidak valid' });
    }

    let jadwalRows = null;
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'jadwal')) {
      const parsed = normalizeJadwalPayload(req.body.jadwal);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      jadwalRows = parsed.data;
    }

    const payload = {
      nama,
      no_telp_pbf: normalizeText(req.body?.no_telp_pbf),
      nama_sales: normalizeText(req.body?.nama_sales),
      no_wa_sales: normalizeText(req.body?.no_wa_sales),
      jenis_kelamin_sales: jenisKelamin,
      logo_url: normalizeText(req.body?.logo_url),
      jenis_pbf: jenisPbf,
      alamat: normalizeText(req.body?.alamat),
    };

    const { error } = await supabase.from('supplier').update(payload).eq('id', id);
    if (error) {
      console.error('[PUT /suppliers]', error);
      return res.status(500).json({ error: 'Gagal memperbarui supplier' });
    }

    if (jadwalRows) {
      const jadwalError = await applyJadwalUpdates(id, jadwalRows);
      if (jadwalError) {
        console.error('[PUT /suppliers] jadwal', jadwalError);
        return res.status(500).json({ error: 'Data utama tersimpan, jadwal gagal diperbarui' });
      }
    }

    const { data, error: fetchError } = await fetchSupplierById(id);
    if (fetchError) {
      console.error('[PUT /suppliers] fetch', fetchError);
      return res.status(500).json({ error: 'Update berhasil, gagal memuat ulang data' });
    }

    return res.json(data);
  } catch (err) {
    console.error('[PUT /suppliers]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// DELETE /api/suppliers/:id
router.delete('/:id', requireMenuAksi('data-supplier', 'hapus'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('supplier')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[DELETE /suppliers]', error);
      return res.status(500).json({ error: 'Gagal menghapus supplier' });
    }
    if (!data) {
      return res.status(404).json({ error: 'Supplier tidak ditemukan' });
    }

    return res.status(204).send();
  } catch (err) {
    console.error('[DELETE /suppliers]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

module.exports = router;
