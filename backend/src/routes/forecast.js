const express = require('express');
const { supabase } = require('../db');
const {
  requireAuth,
  requireApproved,
  requireOwner,
  requireMenuAksi,
} = require('../middleware/auth');
const {
  fetchAllRows,
  loadLatestStokRingkasanMap,
} = require('../lib/stokRingkasan');
const { resolveHargaNet } = require('../lib/pricelistDiskon');

const router = express.Router();
router.use(requireAuth, requireApproved);

const KATEGORI_VALID = new Set(['retail', 'mitra']);
const TANPA_SUBSTITUSI = 'Tanpa Substitusi';

const PRICELIST_SELECT =
  'id, pbf_id, kode_pbf, nama_barang, satuan, qty, qty_estimasi, harga_dasar, diskon, catatan_kondisi, tanggal_upload';
const PRICELIST_SELECT_LEGACY =
  'id, pbf_id, kode_pbf, nama_barang, satuan, qty, qty_estimasi, harga_dasar, tanggal_upload';

/**
 * Expand pilihan UI (retail/mitra) ke filter DB.
 * retail → retail + titip; mitra → mitra.
 */
function expandKategoriUntukQuery(kategoriDipilih) {
  const set = new Set();
  for (const k of kategoriDipilih) {
    if (k === 'retail') {
      set.add('retail');
      set.add('titip');
    } else if (k === 'mitra') {
      set.add('mitra');
    }
  }
  return [...set];
}

function actorLabel(req) {
  const u = req.user || {};
  return u.nama || u.email || u.id || 'staf';
}

const MATCHING_AKTIF = new Set(['menunggu_verifikasi', 'terverifikasi']);

function isSupplierGlobal(inisial, nama) {
  const blob = `${inisial || ''} ${nama || ''}`.toLowerCase();
  return blob.includes('global');
}

function isSupplierSbs(inisial, nama) {
  const blob = `${inisial || ''} ${nama || ''}`.toLowerCase();
  return /\bsbs\b/.test(blob) || blob.includes('sbs');
}

/**
 * Skor Defekta PBF: harga netto lebih murah = skor lebih tinggi.
 * Global qty < 5 → skor rendah; SBS qty_estimasi + qty <= 5 → skor rendah.
 */
function scoreDefektaPbf({
  harga_dasar,
  harga_net,
  qty,
  qty_estimasi,
  inisial,
  nama,
}) {
  const harga = Number(
    harga_net != null && harga_net !== '' ? harga_net : harga_dasar
  );
  let skor =
    Number.isFinite(harga) && harga > 0 ? 1_000_000 / harga : 1;

  const qtyN =
    qty === null || qty === undefined || qty === '' ? null : Number(qty);
  const hasQty = qtyN != null && Number.isFinite(qtyN);

  if (isSupplierGlobal(inisial, nama) && hasQty && qtyN < 5) {
    skor *= 0.05;
  }
  if (
    isSupplierSbs(inisial, nama) &&
    qty_estimasi === true &&
    hasQty &&
    qtyN <= 5
  ) {
    skor *= 0.05;
  }

  return Number(skor.toFixed(6));
}

async function loadLatestPricelistRow(pbfId, kodePbf) {
  if (!pbfId || !kodePbf) return null;
  try {
    const { data, error } = await supabase
      .from('pricelist')
      .select(PRICELIST_SELECT)
      .eq('pbf_id', pbfId)
      .eq('kode_pbf', kodePbf)
      .order('tanggal_upload', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (err) {
    if (!/diskon|catatan_kondisi/i.test(err.message || '')) throw err;
    const { data, error } = await supabase
      .from('pricelist')
      .select(PRICELIST_SELECT_LEGACY)
      .eq('pbf_id', pbfId)
      .eq('kode_pbf', kodePbf)
      .order('tanggal_upload', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }
}

/**
 * Bulk load latest pricelist per (pbf_id, kode_pbf).
 * @param {Array<{ pbf_id: string, kode_pbf: string }>} pairs
 * @returns {Promise<Map<string, object>>} key = `${pbfId}\0${kodePbf}`
 */
async function loadLatestPricelistMap(pairs) {
  const map = new Map();
  if (!pairs?.length) return map;

  /** @type {Map<string, Set<string>>} */
  const byPbf = new Map();
  for (const p of pairs) {
    if (!p?.pbf_id || !p?.kode_pbf) continue;
    let set = byPbf.get(p.pbf_id);
    if (!set) {
      set = new Set();
      byPbf.set(p.pbf_id, set);
    }
    set.add(p.kode_pbf);
  }

  for (const [pbfId, kodeSet] of byPbf) {
    const kodes = [...kodeSet];
    for (let i = 0; i < kodes.length; i += 150) {
      const chunk = kodes.slice(i, i + 150);
      let rows;
      try {
        rows = await fetchAllRows(() =>
          supabase
            .from('pricelist')
            .select(PRICELIST_SELECT)
            .eq('pbf_id', pbfId)
            .in('kode_pbf', chunk)
        );
      } catch (err) {
        if (!/diskon|catatan_kondisi/i.test(err.message || '')) throw err;
        rows = await fetchAllRows(() =>
          supabase
            .from('pricelist')
            .select(PRICELIST_SELECT_LEGACY)
            .eq('pbf_id', pbfId)
            .in('kode_pbf', chunk)
        );
      }
      for (const row of rows) {
        const key = `${row.pbf_id}\0${row.kode_pbf}`;
        const prev = map.get(key);
        if (
          !prev ||
          String(row.tanggal_upload || '') > String(prev.tanggal_upload || '')
        ) {
          map.set(key, row);
        }
      }
    }
  }
  return map;
}

/**
 * Hitung kandidat skor Defekta untuk banyak obat sekaligus.
 * @param {string[]} kodeList
 * @param {Map<string, number|null>|object} [qtyByKode] qty_order per kode untuk skema bonus
 */
async function buildDefektaScoresByKode(kodeList, qtyByKode = null) {
  const byKode = new Map();
  const uniqueKodes = [...new Set((kodeList || []).filter(Boolean))];
  if (uniqueKodes.length === 0) return { byKode };

  const qtyMap =
    qtyByKode instanceof Map
      ? qtyByKode
      : qtyByKode && typeof qtyByKode === 'object'
        ? new Map(Object.entries(qtyByKode))
        : null;

  const matches = [];
  for (let i = 0; i < uniqueKodes.length; i += 150) {
    const chunk = uniqueKodes.slice(i, i + 150);
    const rows = await fetchAllRows(() =>
      supabase
        .from('matching')
        .select(
          `id, kode_obat_yelo, pricelist_pbf_id, pricelist_kode_pbf, status,
           supplier:supplier ( id, nama, inisial )`
        )
        .in('kode_obat_yelo', chunk)
        .in('status', [...MATCHING_AKTIF])
    );
    matches.push(...rows);
  }

  const pairs = [];
  for (const m of matches) {
    if (m.pricelist_pbf_id && m.pricelist_kode_pbf) {
      pairs.push({
        pbf_id: m.pricelist_pbf_id,
        kode_pbf: m.pricelist_kode_pbf,
      });
    }
  }
  const priceMap = await loadLatestPricelistMap(pairs);

  for (const m of matches) {
    const kode = m.kode_obat_yelo;
    const sid = m.pricelist_pbf_id || m.supplier?.id;
    if (!kode || !sid) continue;

    let list = byKode.get(kode);
    if (!list) {
      list = [];
      byKode.set(kode, list);
    }
    if (list.some((c) => c.supplier_id === sid)) continue;

    const price =
      m.pricelist_pbf_id && m.pricelist_kode_pbf
        ? priceMap.get(`${m.pricelist_pbf_id}\0${m.pricelist_kode_pbf}`) || null
        : null;
    const inisial = m.supplier?.inisial || null;
    const nama = m.supplier?.nama || null;
    const qtyOrder = qtyMap?.get(kode) ?? null;
    const net = resolveHargaNet({
      harga_dasar: price?.harga_dasar,
      diskon: price?.diskon || price?.catatan_kondisi,
      qty_order: qtyOrder,
    });
    const skor = scoreDefektaPbf({
      harga_dasar: price?.harga_dasar,
      harga_net: net.harga_net,
      qty: price?.qty,
      qty_estimasi: price?.qty_estimasi,
      inisial,
      nama,
    });
    list.push({
      supplier_id: sid,
      inisial,
      nama,
      pricelist_kode_pbf: m.pricelist_kode_pbf || null,
      harga_dasar: price?.harga_dasar ?? null,
      harga_net: net.harga_net,
      diskon: net.diskon,
      diskon_keterangan: net.keterangan,
      skor,
    });
  }

  for (const list of byKode.values()) {
    list.sort((a, b) => (b.skor || 0) - (a.skor || 0));
  }
  return { byKode };
}

/**
 * Sumber kebenaran is_disetujui: baris di defekta_pilihan_pbf untuk run.
 * Dipakai bersama oleh GET hasil (badge) dan GET defekta-filter (pill).
 * @returns {Promise<{
 *   pilihanRows: Array<object>,
 *   pilihanListByKode: Map<string, Array<object>>,
 * }>}
 */
async function loadDefektaPilihanForRun(runId) {
  const pilihanRows = await fetchAllRows(() =>
    supabase
      .from('defekta_pilihan_pbf')
      .select('kode_obat, supplier_id, pricelist_kode_pbf, qty_order')
      .eq('forecast_run_id', runId)
  );

  /** @type {Map<string, Array<object>>} */
  const pilihanListByKode = new Map();
  for (const p of pilihanRows) {
    if (!p.kode_obat) continue;
    let list = pilihanListByKode.get(p.kode_obat);
    if (!list) {
      list = [];
      pilihanListByKode.set(p.kode_obat, list);
    }
    list.push(p);
  }
  return { pilihanRows, pilihanListByKode };
}

/**
 * Badge PBF per obat — sama dengan kontrak Tahap 2.
 * is_disetujui = ada baris pilihan untuk supplier itu.
 */
function buildPbfBadges(candidates, recommendedSupplierId, pilihanList) {
  const disetujuiIds = new Set(
    (pilihanList || []).map((p) => p.supplier_id).filter(Boolean)
  );
  return (candidates || []).map((c) => ({
    supplier_id: c.supplier_id,
    inisial: c.inisial || null,
    nama: c.nama || null,
    is_match: true,
    is_terpilih_bobot: c.supplier_id === recommendedSupplierId,
    is_disetujui: disetujuiIds.has(c.supplier_id),
  }));
}

/**
 * Ringkasan pill filter dari hasil run + pilihan (sumber is_disetujui yang sama).
 * Multi-PBF: 1 obat disetujui ke N PBF → +1 di tiap PBF itu.
 */
function buildDefektaFilterRingkasan(hasilKodeList, pilihanRows, supplierById) {
  const kodeSet = new Set((hasilKodeList || []).filter(Boolean));
  const total_semua = kodeSet.size;

  const kodeDenganPilihan = new Set();
  /** @type {Map<string, Set<string>>} supplier_id → set kode_obat */
  const obatPerSupplier = new Map();

  for (const p of pilihanRows || []) {
    if (!p?.kode_obat || !p?.supplier_id) continue;
    if (!kodeSet.has(p.kode_obat)) continue; // hanya obat yang ada di hasil run
    kodeDenganPilihan.add(p.kode_obat);
    let set = obatPerSupplier.get(p.supplier_id);
    if (!set) {
      set = new Set();
      obatPerSupplier.set(p.supplier_id, set);
    }
    set.add(p.kode_obat);
  }

  const pbf_terpilih = [];
  for (const [supplierId, kodeObatSet] of obatPerSupplier) {
    const jumlah = kodeObatSet.size;
    if (jumlah <= 0) continue;
    const s = supplierById?.get(supplierId) || null;
    pbf_terpilih.push({
      supplier_id: supplierId,
      inisial: s?.inisial || null,
      nama: s?.nama || null,
      jumlah_obat: jumlah,
    });
  }

  pbf_terpilih.sort((a, b) => {
    if (b.jumlah_obat !== a.jumlah_obat) return b.jumlah_obat - a.jumlah_obat;
    return String(a.inisial || a.nama || '').localeCompare(
      String(b.inisial || b.nama || ''),
      'id',
      { sensitivity: 'base' }
    );
  });

  return {
    total_semua,
    total_belum_dipilih: total_semua - kodeDenganPilihan.size,
    pbf_terpilih,
  };
}

/**
 * Obat hasil run yang belum punya baris Defekta apapun.
 * Sama definisi dengan total_belum_dipilih di buildDefektaFilterRingkasan.
 * @param {Array<{ kode_obat: string, kebutuhan_beli?: * }>} hasilRows
 * @param {Map<string, Array<object>>} pilihanListByKode
 */
function listObatBelumDipilih(hasilRows, pilihanListByKode) {
  const seen = new Set();
  const out = [];
  for (const row of hasilRows || []) {
    const kode = row?.kode_obat;
    if (!kode || seen.has(kode)) continue;
    seen.add(kode);
    if (pilihanListByKode?.has(kode)) continue;
    out.push(row);
  }
  return out;
}

async function upsertDefektaPilihanBatches(rows, batchSize = 200) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('defekta_pilihan_pbf').upsert(chunk, {
      onConflict: 'forecast_run_id,kode_obat,supplier_id',
    });
    if (error) throw error;
  }
}

/**
 * Qty order Defekta dari kebutuhan_beli (satuan_1):
 * - konversi > 1 → CEIL(kebutuhan / konversi) dalam satuan_2
 * - selain itu → CEIL(kebutuhan) dalam satuan_1
 * @returns {number|null}
 */
function computeQtyOrderDefekta(kebutuhanBeli, konversi) {
  const kebutuhan = Number(kebutuhanBeli);
  if (!Number.isFinite(kebutuhan) || kebutuhan < 0) return null;
  const konv = Number(konversi);
  if (Number.isFinite(konv) && konv > 1) {
    return Math.ceil(kebutuhan / konv);
  }
  return Math.ceil(kebutuhan);
}

/**
 * Label satuan untuk qty_order: satuan_2 jika konversi > 1 & ada nama, else satuan_1.
 */
function qtyOrderSatuanLabel({ konversi, satuan_1, satuan_2 }) {
  const konv = Number(konversi);
  const sat2 =
    (satuan_2 && typeof satuan_2 === 'object' ? satuan_2.nama : satuan_2) ||
    null;
  const sat1 =
    (satuan_1 && typeof satuan_1 === 'object' ? satuan_1.nama : satuan_1) ||
    null;
  if (Number.isFinite(konv) && konv > 1 && sat2) return sat2;
  return sat1 || null;
}

async function getOrCreatePengaturan() {
  const { data, error } = await supabase
    .from('forecast_pengaturan')
    .select('id, periode_histori_hari, diubah_oleh, diubah_saat')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: created, error: insertErr } = await supabase
    .from('forecast_pengaturan')
    .insert({ periode_histori_hari: 90 })
    .select('id, periode_histori_hari, diubah_oleh, diubah_saat')
    .single();
  if (insertErr) throw insertErr;
  return created;
}

async function insertHasilBatches(rows, batchSize = 500) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('forecast_hasil').insert(chunk);
    if (error) throw error;
  }
}

/** GET /api/forecast/pengaturan */
router.get(
  '/pengaturan',
  requireMenuAksi('forecasting', 'lihat'),
  async (_req, res) => {
    try {
      const row = await getOrCreatePengaturan();
      res.json(row);
    } catch (err) {
      console.error('[forecast/pengaturan GET]', err);
      res.status(500).json({ error: err.message || 'Gagal memuat pengaturan' });
    }
  }
);

/** PUT /api/forecast/pengaturan — owner only */
router.put('/pengaturan', requireOwner, async (req, res) => {
  try {
    const raw = req.body?.periode_histori_hari;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      return res
        .status(400)
        .json({ error: 'periode_histori_hari harus bilangan bulat > 0' });
    }

    const current = await getOrCreatePengaturan();
    const { data, error } = await supabase
      .from('forecast_pengaturan')
      .update({
        periode_histori_hari: n,
        diubah_oleh: actorLabel(req),
        diubah_saat: new Date().toISOString(),
      })
      .eq('id', current.id)
      .select('id, periode_histori_hari, diubah_oleh, diubah_saat')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[forecast/pengaturan PUT]', err);
    res.status(500).json({ error: err.message || 'Gagal menyimpan pengaturan' });
  }
});

/**
 * POST /api/forecast/jalankan
 * Body: { periode_forecast_hari, kategori_penjualan: string[], periode_histori_hari?: number }
 */
router.post(
  '/jalankan',
  requireMenuAksi('forecasting', 'tambah'),
  async (req, res) => {
    try {
      const periodeForecast = Number(req.body?.periode_forecast_hari);
      if (
        !Number.isFinite(periodeForecast) ||
        periodeForecast <= 0 ||
        !Number.isInteger(periodeForecast)
      ) {
        return res
          .status(400)
          .json({ error: 'periode_forecast_hari harus bilangan bulat > 0' });
      }

      const rawKat = Array.isArray(req.body?.kategori_penjualan)
        ? req.body.kategori_penjualan
        : [];
      const kategori = [
        ...new Set(
          rawKat
            .map((k) => String(k || '').trim().toLowerCase())
            .filter((k) => KATEGORI_VALID.has(k))
        ),
      ];
      if (kategori.length === 0) {
        return res.status(400).json({
          error: 'Pilih minimal 1 kategori penjualan (retail/mitra)',
        });
      }

      const kategoriQuery = expandKategoriUntukQuery(kategori);

      const pengaturan = await getOrCreatePengaturan();
      let periodeHistori = Number(pengaturan.periode_histori_hari) || 90;
      if (req.body?.periode_histori_hari != null && req.body?.periode_histori_hari !== '') {
        const nHist = Number(req.body.periode_histori_hari);
        if (!Number.isFinite(nHist) || nHist <= 0 || !Number.isInteger(nHist)) {
          return res
            .status(400)
            .json({ error: 'periode_histori_hari harus bilangan bulat > 0' });
        }
        periodeHistori = nHist;
      }

      const since = new Date();
      since.setDate(since.getDate() - periodeHistori);
      const sinceIso = since.toISOString();

      // Parallel: obat list + penjualan aggregate + stok ringkasan
      const [obatRows, penjualanRows, stokMap] = await Promise.all([
        fetchAllRows(() =>
          supabase
            .from('obat_yelo')
            .select(
              'kode_obat, grup_substitusi:ref_grup_substitusi ( id, nama )'
            )
        ),
        fetchAllRows(() =>
          supabase
            .from('penjualan_obat')
            .select('kode_obat, jumlah')
            .in('kategori_pelanggan', kategoriQuery)
            .gte('tanggal_transaksi', sinceIso)
        ),
        loadLatestStokRingkasanMap(),
      ]);

      const qtyByKode = new Map();
      for (const row of penjualanRows) {
        const kode = row.kode_obat;
        if (!kode) continue;
        const qty = Number(row.jumlah) || 0;
        qtyByKode.set(kode, (qtyByKode.get(kode) || 0) + qty);
      }

      const { data: run, error: runErr } = await supabase
        .from('forecast_run')
        .insert({
          periode_forecast_hari: periodeForecast,
          kategori_penjualan: kategori,
          periode_histori_hari: periodeHistori,
          dijalankan_oleh: actorLabel(req),
        })
        .select(
          'id, periode_forecast_hari, kategori_penjualan, periode_histori_hari, dijalankan_oleh, dijalankan_saat'
        )
        .single();
      if (runErr) throw runErr;

      const hasilRows = [];
      let perluBeli = 0;

      for (const obat of obatRows) {
        const kode = obat.kode_obat;
        if (!kode) continue;

        const totalQty = qtyByKode.get(kode) || 0;
        const rataHarian = totalQty / periodeHistori;
        const perkiraan = rataHarian * periodeForecast;
        const stokSekarang = Number(stokMap.get(kode)?.stok_total) || 0;
        const kebutuhan = Math.max(0, perkiraan - stokSekarang);
        if (kebutuhan > 0) perluBeli += 1;

        const grupNama = obat.grup_substitusi?.nama || null;

        hasilRows.push({
          forecast_run_id: run.id,
          kode_obat: kode,
          rata_rata_harian: Number(rataHarian.toFixed(6)),
          perkiraan_terjual: Number(perkiraan.toFixed(4)),
          stok_sekarang: stokSekarang,
          kebutuhan_beli: Number(kebutuhan.toFixed(4)),
          grup_substitusi: grupNama,
        });
      }

      await insertHasilBatches(hasilRows);

      if (periodeHistori !== Number(pengaturan.periode_histori_hari)) {
        const { error: updPengaturanErr } = await supabase
          .from('forecast_pengaturan')
          .update({
            periode_histori_hari: periodeHistori,
            diubah_oleh: actorLabel(req),
            diubah_saat: new Date().toISOString(),
          })
          .eq('id', pengaturan.id);
        if (updPengaturanErr) {
          console.error(
            '[forecast/jalankan] gagal update pengaturan default',
            updPengaturanErr
          );
        }
      }

      res.json({
        forecast_run_id: run.id,
        run,
        ringkasan: {
          total_obat: hasilRows.length,
          perlu_beli: perluBeli,
          periode_forecast_hari: periodeForecast,
          periode_histori_hari: periodeHistori,
          kategori_penjualan: kategori,
        },
      });
    } catch (err) {
      console.error('[forecast/jalankan]', err);
      res.status(500).json({ error: err.message || 'Gagal menjalankan forecast' });
    }
  }
);

/** GET /api/forecast/riwayat */
router.get(
  '/riwayat',
  requireMenuAksi('forecasting', 'lihat'),
  async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from('forecast_run')
        .select(
          'id, periode_forecast_hari, kategori_penjualan, periode_histori_hari, dijalankan_oleh, dijalankan_saat'
        )
        .order('dijalankan_saat', { ascending: false });
      if (error) throw error;
      res.json(data || []);
    } catch (err) {
      console.error('[forecast/riwayat]', err);
      res.status(500).json({ error: err.message || 'Gagal memuat riwayat' });
    }
  }
);

/**
 * GET /api/forecast/hasil/:runId
 * Dikelompokkan per grup_substitusi, urut total kebutuhan DESC.
 */
router.get(
  '/hasil/:runId',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const runId = String(req.params.runId || '').trim();
      if (!runId) {
        return res.status(400).json({ error: 'runId wajib' });
      }

      const { data: run, error: runErr } = await supabase
        .from('forecast_run')
        .select(
          'id, periode_forecast_hari, kategori_penjualan, periode_histori_hari, dijalankan_oleh, dijalankan_saat'
        )
        .eq('id', runId)
        .maybeSingle();
      if (runErr) throw runErr;
      if (!run) {
        return res.status(404).json({ error: 'Forecast run tidak ditemukan' });
      }

      const [hasilRows, obatRows] = await Promise.all([
        fetchAllRows(() =>
          supabase
            .from('forecast_hasil')
            .select(
              'id, kode_obat, rata_rata_harian, perkiraan_terjual, stok_sekarang, kebutuhan_beli, grup_substitusi'
            )
            .eq('forecast_run_id', runId)
        ),
        fetchAllRows(() =>
          supabase
            .from('obat_yelo')
            .select(
              `kode_obat, nama_obat, konversi,
               satuan_1:ref_satuan!obat_yelo_satuan_1_id_fkey ( id, nama ),
               satuan_2:ref_satuan!obat_yelo_satuan_2_id_fkey ( id, nama ),
               golongan:ref_golongan ( id, nama )`
            )
        ),
      ]);

      const obatByKode = new Map();
      for (const o of obatRows) {
        if (o.kode_obat) obatByKode.set(o.kode_obat, o);
      }

      const kodeAll = hasilRows.map((r) => r.kode_obat).filter(Boolean);
      /** @type {Map<string, number|null>} */
      const qtyByKode = new Map();
      for (const row of hasilRows) {
        if (!row.kode_obat) continue;
        const obat = obatByKode.get(row.kode_obat) || {};
        qtyByKode.set(
          row.kode_obat,
          computeQtyOrderDefekta(row.kebutuhan_beli, obat.konversi)
        );
      }
      const [{ byKode: skorByKode }, { pilihanListByKode }] = await Promise.all([
        buildDefektaScoresByKode(kodeAll, qtyByKode),
        loadDefektaPilihanForRun(runId),
      ]);

      const grupMap = new Map();
      for (const row of hasilRows) {
        const grupKey = row.grup_substitusi || TANPA_SUBSTITUSI;
        let slot = grupMap.get(grupKey);
        if (!slot) {
          slot = {
            nama: grupKey,
            tanpa_substitusi: !row.grup_substitusi,
            total_kebutuhan_beli_tab: 0,
            total_stok_sekarang: 0,
            total_perkiraan_terjual: 0,
            obat: [],
          };
          grupMap.set(grupKey, slot);
        }

        const obat = obatByKode.get(row.kode_obat) || {};
        const kebutuhan = Number(row.kebutuhan_beli) || 0;
        const stokSekarang = Number(row.stok_sekarang) || 0;
        const perkiraan = Number(row.perkiraan_terjual) || 0;
        slot.total_kebutuhan_beli_tab += kebutuhan;
        slot.total_stok_sekarang += stokSekarang;
        slot.total_perkiraan_terjual += perkiraan;

        const candidates = skorByKode.get(row.kode_obat) || [];
        const recommended_supplier_id = candidates[0]?.supplier_id || null;
        const pilihanList = pilihanListByKode.get(row.kode_obat) || [];
        const pilihan_tersimpan = pilihanList.length > 0;
        const pbf_badges = buildPbfBadges(
          candidates,
          recommended_supplier_id,
          pilihanList
        );

        // Compat: active = pemenang bobot jika perlu beli; atau PBF disetujui pertama.
        let active_supplier_id = null;
        if (kebutuhan > 0) {
          active_supplier_id =
            recommended_supplier_id ||
            pilihanList[0]?.supplier_id ||
            null;
        }

        slot.obat.push({
          id: row.id,
          kode_obat: row.kode_obat,
          nama_obat: obat.nama_obat || row.kode_obat,
          rata_rata_harian: Number(row.rata_rata_harian) || 0,
          perkiraan_terjual: perkiraan,
          stok_sekarang: stokSekarang,
          kebutuhan_beli: kebutuhan,
          konversi: obat.konversi ?? null,
          satuan_1: obat.satuan_1 || null,
          satuan_2: obat.satuan_2 || null,
          golongan: obat.golongan || null,
          recommended_supplier_id,
          active_supplier_id,
          pilihan_tersimpan,
          pbf_badges,
          pilihan_disetujui: pilihanList.map((p) => ({
            supplier_id: p.supplier_id,
            pricelist_kode_pbf: p.pricelist_kode_pbf || null,
            qty_order:
              p.qty_order === null || p.qty_order === undefined
                ? null
                : Number(p.qty_order),
          })),
        });
      }

      for (const slot of grupMap.values()) {
        slot.obat.sort((a, b) =>
          String(a.nama_obat || '').localeCompare(String(b.nama_obat || ''), 'id', {
            sensitivity: 'base',
          })
        );
        slot.total_kebutuhan_beli_tab = Number(
          slot.total_kebutuhan_beli_tab.toFixed(4)
        );
        slot.total_stok_sekarang = Number(slot.total_stok_sekarang.toFixed(4));
        slot.total_perkiraan_terjual = Number(
          slot.total_perkiraan_terjual.toFixed(4)
        );

        if (!slot.tanpa_substitusi) {
          const satuanNamaSet = new Set(
            slot.obat.map((o) => o.satuan_1?.nama || null)
          );
          if (satuanNamaSet.size === 1 && !satuanNamaSet.has(null)) {
            slot.satuan_seragam = [...satuanNamaSet][0];
          } else {
            slot.satuan_campur = true;
          }

          // Rekomendasi level grup: skor tertinggi di antara SEMUA obat×PBF dalam grup.
          let bestSkor = -Infinity;
          let bestSupplierId = null;
          let bestObat = null;
          for (const o of slot.obat) {
            const candidates = skorByKode.get(o.kode_obat) || [];
            for (const c of candidates) {
              if ((c.skor || 0) > bestSkor) {
                bestSkor = c.skor || 0;
                bestSupplierId = c.supplier_id;
                bestObat = o;
              }
            }
          }
          slot.recommended_grup_supplier_id = bestSupplierId;
          slot.recommended_grup_kode_obat = bestObat?.kode_obat || null;
          slot.recommended_grup_nama_obat = bestObat?.nama_obat || null;
        }
      }

      const grup = [...grupMap.values()].sort((a, b) => {
        if (a.tanpa_substitusi !== b.tanpa_substitusi) {
          return a.tanpa_substitusi ? 1 : -1;
        }
        return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
      });

      res.json({ run, grup });
    } catch (err) {
      console.error('[forecast/hasil]', err);
      res.status(500).json({ error: err.message || 'Gagal memuat hasil' });
    }
  }
);

/**
 * GET /api/forecast/defekta-filter/:runId
 * Ringkasan pill filter Defekta (Semua / Belum Dipilih / per-PBF disetujui).
 * is_disetujui memakai sumber yang sama dengan GET hasil (defekta_pilihan_pbf).
 */
router.get(
  '/defekta-filter/:runId',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const runId = String(req.params.runId || '').trim();
      if (!runId) {
        return res.status(400).json({ error: 'runId wajib' });
      }

      const { data: run, error: runErr } = await supabase
        .from('forecast_run')
        .select('id')
        .eq('id', runId)
        .maybeSingle();
      if (runErr) throw runErr;
      if (!run) {
        return res.status(404).json({ error: 'Forecast run tidak ditemukan' });
      }

      const [hasilRows, { pilihanRows }] = await Promise.all([
        fetchAllRows(() =>
          supabase
            .from('forecast_hasil')
            .select('kode_obat')
            .eq('forecast_run_id', runId)
        ),
        loadDefektaPilihanForRun(runId),
      ]);

      const supplierIds = [
        ...new Set(
          (pilihanRows || []).map((p) => p.supplier_id).filter(Boolean)
        ),
      ];
      /** @type {Map<string, { id: string, inisial: *, nama: * }>} */
      const supplierById = new Map();
      if (supplierIds.length > 0) {
        const { data: suppliers, error: supErr } = await supabase
          .from('supplier')
          .select('id, nama, inisial')
          .in('id', supplierIds);
        if (supErr) throw supErr;
        for (const s of suppliers || []) {
          supplierById.set(s.id, s);
        }
      }

      const ringkasan = buildDefektaFilterRingkasan(
        hasilRows.map((r) => r.kode_obat),
        pilihanRows,
        supplierById
      );

      res.json({
        forecast_run_id: runId,
        ...ringkasan,
      });
    } catch (err) {
      console.error('[forecast/defekta-filter]', err);
      res
        .status(500)
        .json({ error: err.message || 'Gagal memuat filter Defekta' });
    }
  }
);

/**
 * POST /api/forecast/defekta-filter/:runId/setujui-semua
 * Setujui PBF pemenang bobot untuk semua obat yang belum punya pilihan.
 * Idempotent: upsert; panggilan ulang aman (obat yang sudah punya baris dilewati).
 */
router.post(
  '/defekta-filter/:runId/setujui-semua',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const runId = String(req.params.runId || '').trim();
      if (!runId) {
        return res.status(400).json({ error: 'runId wajib' });
      }

      const { data: run, error: runErr } = await supabase
        .from('forecast_run')
        .select('id')
        .eq('id', runId)
        .maybeSingle();
      if (runErr) throw runErr;
      if (!run) {
        return res.status(404).json({ error: 'Forecast run tidak ditemukan' });
      }

      const [hasilRows, { pilihanListByKode }] = await Promise.all([
        fetchAllRows(() =>
          supabase
            .from('forecast_hasil')
            .select('kode_obat, kebutuhan_beli')
            .eq('forecast_run_id', runId)
        ),
        loadDefektaPilihanForRun(runId),
      ]);

      const belumDipilih = listObatBelumDipilih(hasilRows, pilihanListByKode);
      const kodeBelum = belumDipilih.map((r) => r.kode_obat).filter(Boolean);
      const obatKonversiRows = await (async () => {
        const all = [];
        for (let i = 0; i < kodeBelum.length; i += 150) {
          const chunk = kodeBelum.slice(i, i + 150);
          const rows = await fetchAllRows(() =>
            supabase
              .from('obat_yelo')
              .select('kode_obat, konversi')
              .in('kode_obat', chunk)
          );
          all.push(...rows);
        }
        return all;
      })();

      /** @type {Map<string, number|null>} */
      const konversiByKode = new Map();
      for (const o of obatKonversiRows) {
        if (o.kode_obat) konversiByKode.set(o.kode_obat, o.konversi);
      }

      /** @type {Map<string, number|null>} */
      const qtyByKode = new Map();
      for (const row of belumDipilih) {
        if (!row.kode_obat) continue;
        qtyByKode.set(
          row.kode_obat,
          computeQtyOrderDefekta(
            row.kebutuhan_beli,
            konversiByKode.get(row.kode_obat)
          )
        );
      }

      const { byKode } = await buildDefektaScoresByKode(kodeBelum, qtyByKode);

      const actor = actorLabel(req);
      const nowIso = new Date().toISOString();
      const toUpsert = [];
      let jumlah_dilewati = 0;

      for (const row of belumDipilih) {
        const candidates = byKode.get(row.kode_obat) || [];
        // Pemenang bobot = candidates[0] (sudah sort DESC) — sama is_terpilih_bobot
        const winner = candidates[0] || null;
        if (!winner?.supplier_id) {
          jumlah_dilewati += 1;
          continue;
        }
        const qtyOrder = qtyByKode.get(row.kode_obat) ?? null;
        toUpsert.push({
          forecast_run_id: runId,
          kode_obat: row.kode_obat,
          supplier_id: winner.supplier_id,
          pricelist_kode_pbf: winner.pricelist_kode_pbf || null,
          qty_order: qtyOrder,
          dipilih_oleh: actor,
          tanggal_pilih: nowIso,
        });
      }

      await upsertDefektaPilihanBatches(toUpsert);

      res.json({
        jumlah_disetujui: toUpsert.length,
        jumlah_dilewati,
        jumlah_obat_diproses: belumDipilih.length,
      });
    } catch (err) {
      console.error('[forecast/defekta setujui-semua]', err);
      res
        .status(500)
        .json({ error: err.message || 'Gagal Setujui Semua Defekta' });
    }
  }
);

/**
 * GET /api/forecast/defekta/:runId/:kodeObat
 * Kandidat PBF + skor + daftar pilihan tersimpan (multi-PBF).
 */
router.get(
  '/defekta/:runId/:kodeObat',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const runId = String(req.params.runId || '').trim();
      const kodeObat = decodeURIComponent(String(req.params.kodeObat || '').trim());
      if (!runId || !kodeObat) {
        return res.status(400).json({ error: 'runId dan kodeObat wajib' });
      }

      const { data: hasil, error: hasilErr } = await supabase
        .from('forecast_hasil')
        .select(
          'id, kode_obat, rata_rata_harian, perkiraan_terjual, stok_sekarang, kebutuhan_beli, grup_substitusi'
        )
        .eq('forecast_run_id', runId)
        .eq('kode_obat', kodeObat)
        .maybeSingle();
      if (hasilErr) throw hasilErr;
      if (!hasil) {
        return res.status(404).json({ error: 'Hasil forecast obat tidak ditemukan' });
      }

      const { data: obatMeta, error: obatErr } = await supabase
        .from('obat_yelo')
        .select(
          `kode_obat, konversi,
           satuan_1:ref_satuan!obat_yelo_satuan_1_id_fkey ( id, nama ),
           satuan_2:ref_satuan!obat_yelo_satuan_2_id_fkey ( id, nama )`
        )
        .eq('kode_obat', kodeObat)
        .maybeSingle();
      if (obatErr) throw obatErr;

      const defaultQty = computeQtyOrderDefekta(
        hasil.kebutuhan_beli,
        obatMeta?.konversi
      );
      const qtySatuan = qtyOrderSatuanLabel({
        konversi: obatMeta?.konversi,
        satuan_1: obatMeta?.satuan_1,
        satuan_2: obatMeta?.satuan_2,
      });

      const { data: matches, error: matchErr } = await supabase
        .from('matching')
        .select(
          `id, kode_obat_yelo, pricelist_pbf_id, pricelist_kode_pbf, status,
           supplier:supplier ( id, nama, inisial )`
        )
        .eq('kode_obat_yelo', kodeObat)
        .in('status', [...MATCHING_AKTIF]);
      if (matchErr) throw matchErr;

      const bySupplier = new Map();
      for (const m of matches || []) {
        const sid = m.pricelist_pbf_id || m.supplier?.id;
        if (!sid) continue;
        if (bySupplier.has(sid)) continue;
        const price = await loadLatestPricelistRow(
          m.pricelist_pbf_id,
          m.pricelist_kode_pbf
        );
        const inisial = m.supplier?.inisial || null;
        const nama = m.supplier?.nama || null;
        const net = resolveHargaNet({
          harga_dasar: price?.harga_dasar,
          diskon: price?.diskon || price?.catatan_kondisi,
          qty_order: defaultQty,
        });
        const skor = scoreDefektaPbf({
          harga_dasar: price?.harga_dasar,
          harga_net: net.harga_net,
          qty: price?.qty,
          qty_estimasi: price?.qty_estimasi,
          inisial,
          nama,
        });
        bySupplier.set(sid, {
          supplier_id: sid,
          inisial,
          nama,
          matching_id: m.id,
          pricelist_kode_pbf: m.pricelist_kode_pbf || null,
          qty: price?.qty ?? null,
          qty_estimasi: price?.qty_estimasi === true,
          satuan: price?.satuan || null,
          harga_dasar: price?.harga_dasar ?? null,
          harga_net: net.harga_net,
          diskon: net.diskon,
          diskon_keterangan: net.keterangan,
          skor,
        });
      }

      const candidates = [...bySupplier.values()].sort(
        (a, b) => (b.skor || 0) - (a.skor || 0)
      );
      const recommended_supplier_id = candidates[0]?.supplier_id || null;

      const { data: pilihanRows, error: pilErr } = await supabase
        .from('defekta_pilihan_pbf')
        .select(
          'id, kode_obat, supplier_id, pricelist_kode_pbf, qty_order, forecast_run_id, dipilih_oleh, tanggal_pilih'
        )
        .eq('forecast_run_id', runId)
        .eq('kode_obat', kodeObat);
      if (pilErr) throw pilErr;

      const pilihan_list = (pilihanRows || []).map((p) => ({
        ...p,
        qty_order:
          p.qty_order === null || p.qty_order === undefined
            ? null
            : Number(p.qty_order),
      }));
      const disetujuiIds = new Set(
        pilihan_list.map((p) => p.supplier_id).filter(Boolean)
      );

      const candidatesWithFlags = candidates.map((c) => ({
        ...c,
        is_match: true,
        is_terpilih_bobot: c.supplier_id === recommended_supplier_id,
        is_disetujui: disetujuiIds.has(c.supplier_id),
        qty_order_tersimpan:
          pilihan_list.find((p) => p.supplier_id === c.supplier_id)?.qty_order ??
          null,
      }));

      // Compat: pilihan = baris pertama (atau pemenang bobot jika ada)
      const pilihanCompat =
        pilihan_list.find((p) => p.supplier_id === recommended_supplier_id) ||
        pilihan_list[0] ||
        null;

      res.json({
        obat_hasil: hasil,
        obat_meta: {
          konversi: obatMeta?.konversi ?? null,
          satuan_1: obatMeta?.satuan_1 || null,
          satuan_2: obatMeta?.satuan_2 || null,
        },
        candidates: candidatesWithFlags,
        recommended_supplier_id,
        pilihan_list,
        pilihan: pilihanCompat,
        default_qty_order: defaultQty,
        qty_order_satuan: qtySatuan,
        selected_supplier_id:
          pilihanCompat?.supplier_id || recommended_supplier_id || null,
      });
    } catch (err) {
      console.error('[forecast/defekta GET]', err);
      res.status(500).json({ error: err.message || 'Gagal memuat Defekta' });
    }
  }
);

/**
 * PUT /api/forecast/defekta/:runId/:kodeObat
 * Body: { supplier_id, pricelist_kode_pbf?, qty_order? }
 * Upsert 1 baris per (run, obat, supplier) — tidak menghapus PBF lain.
 */
router.put(
  '/defekta/:runId/:kodeObat',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const runId = String(req.params.runId || '').trim();
      const kodeObat = decodeURIComponent(String(req.params.kodeObat || '').trim());
      const supplierId = String(req.body?.supplier_id || '').trim();
      const kodePbf = req.body?.pricelist_kode_pbf
        ? String(req.body.pricelist_kode_pbf).trim()
        : null;

      if (!runId || !kodeObat || !supplierId) {
        return res
          .status(400)
          .json({ error: 'runId, kodeObat, dan supplier_id wajib' });
      }

      let qtyOrder = null;
      if (
        req.body?.qty_order !== undefined &&
        req.body?.qty_order !== null &&
        req.body?.qty_order !== ''
      ) {
        const n = Number(req.body.qty_order);
        if (!Number.isFinite(n) || n < 0) {
          return res.status(400).json({ error: 'qty_order harus angka >= 0' });
        }
        if (!Number.isInteger(n)) {
          return res
            .status(400)
            .json({ error: 'qty_order harus bilangan bulat' });
        }
        qtyOrder = n;
      } else {
        const [{ data: hasil, error: hasilErr }, { data: obatMeta, error: obatErr }] =
          await Promise.all([
            supabase
              .from('forecast_hasil')
              .select('kebutuhan_beli')
              .eq('forecast_run_id', runId)
              .eq('kode_obat', kodeObat)
              .maybeSingle(),
            supabase
              .from('obat_yelo')
              .select('konversi')
              .eq('kode_obat', kodeObat)
              .maybeSingle(),
          ]);
        if (hasilErr) throw hasilErr;
        if (obatErr) throw obatErr;
        qtyOrder = computeQtyOrderDefekta(
          hasil?.kebutuhan_beli,
          obatMeta?.konversi
        );
      }

      const { data, error } = await supabase
        .from('defekta_pilihan_pbf')
        .upsert(
          {
            forecast_run_id: runId,
            kode_obat: kodeObat,
            supplier_id: supplierId,
            pricelist_kode_pbf: kodePbf,
            qty_order: qtyOrder,
            dipilih_oleh: actorLabel(req),
            tanggal_pilih: new Date().toISOString(),
          },
          { onConflict: 'forecast_run_id,kode_obat,supplier_id' }
        )
        .select(
          'id, kode_obat, supplier_id, pricelist_kode_pbf, qty_order, forecast_run_id, dipilih_oleh, tanggal_pilih'
        )
        .single();
      if (error) throw error;
      res.json({
        ...data,
        qty_order:
          data.qty_order === null || data.qty_order === undefined
            ? null
            : Number(data.qty_order),
      });
    } catch (err) {
      console.error('[forecast/defekta PUT]', err);
      res.status(500).json({ error: err.message || 'Gagal menyimpan Defekta' });
    }
  }
);

/**
 * DELETE /api/forecast/defekta/:runId/:kodeObat
 * Batalkan 1 pilihan: wajib supplier_id (query ?supplier_id=).
 * Tanpa supplier_id → 400 (multi-PBF; jangan hapus semua secara diam-diam).
 */
router.delete(
  '/defekta/:runId/:kodeObat',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const runId = String(req.params.runId || '').trim();
      const kodeObat = decodeURIComponent(String(req.params.kodeObat || '').trim());
      const supplierId = String(
        req.query?.supplier_id || req.body?.supplier_id || ''
      ).trim();
      if (!runId || !kodeObat) {
        return res.status(400).json({ error: 'runId dan kodeObat wajib' });
      }
      if (!supplierId) {
        return res.status(400).json({
          error: 'supplier_id wajib (batalkan 1 pilihan PBF)',
        });
      }
      const { error, count } = await supabase
        .from('defekta_pilihan_pbf')
        .delete({ count: 'exact' })
        .eq('forecast_run_id', runId)
        .eq('kode_obat', kodeObat)
        .eq('supplier_id', supplierId);
      if (error) throw error;
      res.json({ ok: true, deleted: count ?? null });
    } catch (err) {
      console.error('[forecast/defekta DELETE]', err);
      res.status(500).json({ error: err.message || 'Gagal batalkan Defekta' });
    }
  }
);

module.exports = router;
