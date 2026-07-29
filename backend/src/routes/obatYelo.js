const express = require('express');
const { supabase } = require('../db');
const {
  requireAuth,
  requireApproved,
  requireMenuAksi,
} = require('../middleware/auth');
const {
  fetchAllRows: fetchAllObatRows,
  loadLatestStokRingkasanMap,
} = require('../lib/stokRingkasan');

const router = express.Router();

router.use(requireAuth, requireApproved);

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
  asal_input,
  sudah_ditambah_vmedis,
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

function actorFromReq(req) {
  return (
    normalizeText(req.user?.nick_nama) ||
    normalizeText(req.user?.nama) ||
    normalizeText(req.user?.email) ||
    normalizeText(req.headers['x-heybat-actor']) ||
    normalizeText(req.body?.actor) ||
    'staf'
  );
}

/** YYMMDD in Asia/Jakarta (WIB). */
function todayYymmddWib(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA with 2-digit year → "YY-MM-DD"
  const parts = fmt.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}${get('month')}${get('day')}`;
}

function appKodePrefix(yymmdd = todayYymmddWib()) {
  return `APP${yymmdd}`;
}

/**
 * Next APP{YYMMDD}{XXXX}: XXXX = max urutan numerik hari ini + 1
 * (lebih aman dari count murni jika ada kode yang dihapus/diedit manual).
 */
async function nextAppKodeObat() {
  const prefix = appKodePrefix();
  const rows = [];
  let from = 0;
  const pageSize = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from('obat_yelo')
      .select('kode_obat')
      .like('kode_obat', `${prefix}%`)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  let maxSeq = 0;
  for (const row of rows) {
    const kode = String(row.kode_obat || '');
    if (!kode.startsWith(prefix)) continue;
    const suffix = kode.slice(prefix.length);
    if (/^\d{1,4}$/.test(suffix)) {
      maxSeq = Math.max(maxSeq, parseInt(suffix, 10));
    }
  }

  const seq = maxSeq + 1;
  if (seq > 9999) {
    throw new Error('Kuota kode obat APP hari ini penuh (9999)');
  }
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

/**
 * Set kode_obat yang punya penandaan stok masih terbuka (status='terbuka'),
 * baik yang tertaut langsung via kode_obat (mis. tambah_ke_obat_yelo) maupun
 * via stok_obat_id (karantina/jual_prioritas/lainnya). Jumlah penandaan
 * terbuka biasanya kecil, jadi ini tidak N+1 terhadap daftar obat_yelo.
 */
async function loadOpenPenandaanKodeSet() {
  const result = new Set();

  const kodeOnlyRows = await fetchAllObatRows(() =>
    supabase
      .from('stok_obat_penandaan')
      .select('kode_obat')
      .eq('status', 'terbuka')
      .not('kode_obat', 'is', null)
  );
  for (const row of kodeOnlyRows) {
    if (row.kode_obat) result.add(row.kode_obat);
  }

  const viaStokRows = await fetchAllObatRows(() =>
    supabase
      .from('stok_obat_penandaan')
      .select('stok_obat_id')
      .eq('status', 'terbuka')
      .not('stok_obat_id', 'is', null)
  );
  const stokIds = [...new Set(viaStokRows.map((r) => r.stok_obat_id).filter(Boolean))];
  const chunk = 200;
  for (let i = 0; i < stokIds.length; i += chunk) {
    const slice = stokIds.slice(i, i + chunk);
    const { data, error } = await supabase
      .from('stok_obat')
      .select('id, kode_obat')
      .in('id', slice);
    if (error) throw error;
    for (const row of data || []) {
      if (row.kode_obat) result.add(row.kode_obat);
    }
  }

  return result;
}

function attachStokRingkasan(rows, stokMap, openPenandaanKodeSet) {
  return (rows || []).map((obat) => {
    const stok = stokMap.get(obat.kode_obat) || null;
    return {
      ...obat,
      stok_ringkasan: {
        stok_total: stok ? stok.stok_total : null,
        satuan: stok ? stok.satuan : null,
        harga_1: stok ? stok.harga_1 : null,
        harga_2: stok ? stok.harga_2 : null,
        harga_3: stok ? stok.harga_3 : null,
        gudang_list: stok ? stok.gudang_list : [],
        ada_penandaan_terbuka: openPenandaanKodeSet.has(obat.kode_obat),
      },
    };
  });
}

function buildPayload(body, { requireKode = false, allowAsalInput = false } = {}) {
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

  if (allowAsalInput) {
    const asal = normalizeText(body?.asal_input)?.toLowerCase();
    if (asal === 'app') {
      payload.asal_input = 'app';
      payload.sudah_ditambah_vmedis = false;
    } else if (asal === 'vmedis') {
      payload.asal_input = 'vmedis';
    } else if (asal) {
      return { error: "asal_input harus 'vmedis' atau 'app'" };
    }
  }

  return { payload };
}

async function fetchObatByKode(kodeObat) {
  const { data, error } = await supabase
    .from('obat_yelo')
    .select(OBAT_SELECT)
    .eq('kode_obat', kodeObat)
    .maybeSingle();
  if (error || !data) return { data, error };

  try {
    const [stokMap, openPenandaanKodeSet] = await Promise.all([
      loadLatestStokRingkasanMap(),
      loadOpenPenandaanKodeSet(),
    ]);
    const [enriched] = attachStokRingkasan(
      [data],
      stokMap,
      openPenandaanKodeSet
    );
    return { data: enriched, error: null };
  } catch (enrichErr) {
    console.error('[fetchObatByKode] enrich stok', enrichErr);
    return { data, error: null };
  }
}

// GET /api/obat-yelo?page=1&limit=50&search=  |  ?all=1 untuk tarik semua
router.get('/', requireMenuAksi('data-obat-yelo', 'lihat'), async (req, res) => {
  try {
    const wantAll =
      String(req.query.all || '').toLowerCase() === '1' ||
      String(req.query.all || '').toLowerCase() === 'true';
    const search = normalizeText(req.query.search);

    if (wantAll) {
      const data = await fetchAllObatRows(() => {
        let q = supabase
          .from('obat_yelo')
          .select(OBAT_SELECT)
          .order('nama_obat', { ascending: true });
        if (search) {
          const escaped = search.replace(/[%_]/g, '\\$&');
          q = q.or(
            `nama_obat.ilike.%${escaped}%,kode_obat.ilike.%${escaped}%`
          );
        }
        return q;
      });
      const [stokMap, openPenandaanKodeSet] = await Promise.all([
        loadLatestStokRingkasanMap(),
        loadOpenPenandaanKodeSet(),
      ]);
      const enriched = attachStokRingkasan(data, stokMap, openPenandaanKodeSet);
      return res.json({
        data: enriched,
        page: 1,
        limit: enriched.length,
        total: enriched.length,
        totalPages: 1,
      });
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limitRaw = parseInt(String(req.query.limit || '50'), 10) || 50;
    const limit = Math.min(100, Math.max(1, limitRaw));
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

    const [stokMap, openPenandaanKodeSet] = await Promise.all([
      loadLatestStokRingkasanMap(),
      loadOpenPenandaanKodeSet(),
    ]);
    const enrichedData = attachStokRingkasan(data ?? [], stokMap, openPenandaanKodeSet);

    const total = count ?? 0;
    return res.json({
      data: enrichedData,
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
// GET /api/obat-yelo/next-kode-app — harus sebelum /:kodeObat
router.get('/next-kode-app', requireMenuAksi('data-obat-yelo', 'lihat'), async (req, res) => {
  try {
    const kode_obat = await nextAppKodeObat();
    return res.json({
      kode_obat,
      prefix: appKodePrefix(),
      yymmdd: todayYymmddWib(),
    });
  } catch (err) {
    console.error('[GET /obat-yelo/next-kode-app]', err);
    return res.status(500).json({ error: err.message || 'Gagal membuat kode obat' });
  }
});

// GET /api/obat-yelo/laporan-baru?status=belum|sudah
router.get('/laporan-baru', requireMenuAksi('data-obat-yelo', 'lihat'), async (req, res) => {
  try {
    const status = String(req.query.status || 'belum').toLowerCase();
    if (status !== 'belum' && status !== 'sudah') {
      return res.status(400).json({ error: "status harus 'belum' atau 'sudah'" });
    }

    const sudah = status === 'sudah';
    const { data, error } = await supabase
      .from('obat_yelo')
      .select(OBAT_SELECT)
      .eq('asal_input', 'app')
      .eq('sudah_ditambah_vmedis', sudah)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /obat-yelo/laporan-baru]', error);
      return res.status(500).json({ error: 'Gagal mengambil laporan obat baru' });
    }

    return res.json({ data: data ?? [], status });
  } catch (err) {
    console.error('[GET /obat-yelo/laporan-baru]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// GET /api/obat-yelo/:kodeObat
router.get('/:kodeObat', requireMenuAksi('data-obat-yelo', 'lihat'), async (req, res) => {
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
router.post('/', requireMenuAksi('data-obat-yelo', 'tambah'), async (req, res) => {
  try {
    const built = buildPayload(req.body, {
      requireKode: true,
      allowAsalInput: true,
    });
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

/**
 * POST /api/obat-yelo/dari-matching
 * Buat obat baru (asal_input=app) + matching menunggu_verifikasi dalam satu aksi.
 */
router.post('/dari-matching', requireMenuAksi('data-obat-yelo', 'tambah'), async (req, res) => {
  try {
    const pbfId = normalizeText(req.body?.pricelist_pbf_id);
    const kodePbf = normalizeText(req.body?.pricelist_kode_pbf);
    const actor = actorFromReq(req);

    if (!pbfId || !kodePbf) {
      return res.status(400).json({
        error: 'pricelist_pbf_id dan pricelist_kode_pbf wajib diisi',
      });
    }

    const built = buildPayload(req.body, { requireKode: true });
    if (built.error) {
      return res.status(400).json({ error: built.error });
    }

    const obatPayload = {
      ...built.payload,
      asal_input: 'app',
      sudah_ditambah_vmedis: false,
    };

    const { data: created, error: insertError } = await supabase
      .from('obat_yelo')
      .insert(obatPayload)
      .select('kode_obat')
      .single();

    if (insertError) {
      if (isUniqueViolation(insertError)) {
        return res.status(409).json({ error: 'Kode obat sudah dipakai' });
      }
      console.error('[POST /obat-yelo/dari-matching] insert obat', insertError);
      return res.status(500).json({ error: 'Gagal membuat obat' });
    }

    const kodeObat = created.kode_obat;
    const now = new Date().toISOString();

    const { data: existingActive, error: existError } = await supabase
      .from('matching')
      .select('id, status')
      .eq('pricelist_pbf_id', pbfId)
      .eq('pricelist_kode_pbf', kodePbf)
      .eq('kode_obat_yelo', kodeObat)
      .in('status', ['menunggu_verifikasi', 'terverifikasi'])
      .maybeSingle();

    if (existError) {
      console.error('[POST /obat-yelo/dari-matching] check matching', existError);
      return res.status(500).json({
        error: 'Obat dibuat, gagal cek matching — lengkapi matching manual',
        obat: { kode_obat: kodeObat },
      });
    }

    if (existingActive) {
      const { data: obat } = await fetchObatByKode(kodeObat);
      return res.status(201).json({
        obat,
        matching: null,
        warning: `Pasangan matching sudah ada dengan status ${existingActive.status}`,
      });
    }

    const { data: matching, error: matchError } = await supabase
      .from('matching')
      .insert({
        kode_obat_yelo: kodeObat,
        pricelist_pbf_id: pbfId,
        pricelist_kode_pbf: kodePbf,
        status: 'menunggu_verifikasi',
        dipilih_oleh: actor,
        tanggal_dipilih: now,
        diusulkan_oleh: 'sistem',
        tanggal_diusulkan: now,
      })
      .select('id, kode_obat_yelo, pricelist_pbf_id, pricelist_kode_pbf, status, dipilih_oleh')
      .single();

    if (matchError) {
      console.error('[POST /obat-yelo/dari-matching] insert matching', matchError);
      const { data: obat } = await fetchObatByKode(kodeObat);
      return res.status(500).json({
        error: 'Obat dibuat, gagal membuat matching — ajukan matching manual',
        obat,
      });
    }

    const { data: obat, error: fetchError } = await fetchObatByKode(kodeObat);
    if (fetchError) {
      console.error('[POST /obat-yelo/dari-matching] fetch', fetchError);
      return res.status(201).json({ obat: { kode_obat: kodeObat }, matching });
    }

    return res.status(201).json({ obat, matching });
  } catch (err) {
    console.error('[POST /obat-yelo/dari-matching]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/obat-yelo/:kodeObat/status-vmedis
router.put('/:kodeObat/status-vmedis', requireMenuAksi('data-obat-yelo', 'edit'), async (req, res) => {
  try {
    const kodeObat = decodeURIComponent(req.params.kodeObat);
    if (typeof req.body?.sudah_ditambah_vmedis !== 'boolean') {
      return res.status(400).json({
        error: 'sudah_ditambah_vmedis harus boolean',
      });
    }

    const { data: existing, error: findError } = await supabase
      .from('obat_yelo')
      .select('kode_obat, asal_input')
      .eq('kode_obat', kodeObat)
      .maybeSingle();

    if (findError) {
      console.error('[PUT /obat-yelo/status-vmedis] find', findError);
      return res.status(500).json({ error: 'Gagal mengambil data obat' });
    }
    if (!existing) {
      return res.status(404).json({ error: 'Obat tidak ditemukan' });
    }
    if (existing.asal_input !== 'app') {
      return res.status(400).json({
        error: 'Status Vmedis hanya untuk obat yang dibuat dari app',
      });
    }

    const { error } = await supabase
      .from('obat_yelo')
      .update({ sudah_ditambah_vmedis: req.body.sudah_ditambah_vmedis })
      .eq('kode_obat', kodeObat);

    if (error) {
      console.error('[PUT /obat-yelo/status-vmedis]', error);
      return res.status(500).json({ error: 'Gagal memperbarui status Vmedis' });
    }

    const { data, error: fetchError } = await fetchObatByKode(kodeObat);
    if (fetchError) {
      console.error('[PUT /obat-yelo/status-vmedis] fetch', fetchError);
      return res.status(500).json({ error: 'Update berhasil, gagal memuat ulang data' });
    }
    return res.json(data);
  } catch (err) {
    console.error('[PUT /obat-yelo/status-vmedis]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan server' });
  }
});

// PUT /api/obat-yelo/:kodeObat
router.put('/:kodeObat', requireMenuAksi('data-obat-yelo', 'edit'), async (req, res) => {
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
router.delete('/:kodeObat', requireMenuAksi('data-obat-yelo', 'hapus'), async (req, res) => {
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
