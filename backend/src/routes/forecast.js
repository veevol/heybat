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

const router = express.Router();
router.use(requireAuth, requireApproved);

const KATEGORI_VALID = new Set(['retail', 'mitra']);
const TANPA_SUBSTITUSI = 'Tanpa Substitusi';

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
 * Skor Defekta PBF: harga lebih murah = skor lebih tinggi.
 * Global qty < 5 → skor rendah; SBS qty_estimasi + qty <= 5 → skor rendah.
 */
function scoreDefektaPbf({ harga_dasar, qty, qty_estimasi, inisial, nama }) {
  const harga = Number(harga_dasar);
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
  const { data, error } = await supabase
    .from('pricelist')
    .select(
      'id, pbf_id, kode_pbf, nama_barang, satuan, qty, qty_estimasi, harga_dasar, tanggal_upload'
    )
    .eq('pbf_id', pbfId)
    .eq('kode_pbf', kodePbf)
    .order('tanggal_upload', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Bulk load latest pricelist per (pbf_id, kode_pbf).
 * Query per-PBF (biasanya sedikit), bukan N+1 per obat.
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
      const rows = await fetchAllRows(() =>
        supabase
          .from('pricelist')
          .select(
            'id, pbf_id, kode_pbf, nama_barang, satuan, qty, qty_estimasi, harga_dasar, tanggal_upload'
          )
          .eq('pbf_id', pbfId)
          .in('kode_pbf', chunk)
      );
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
 * @returns {Promise<{
 *   byKode: Map<string, Array<{ supplier_id: string, skor: number, inisial: *, nama: *, pricelist_kode_pbf: * }>>,
 * }>}
 */
async function buildDefektaScoresByKode(kodeList) {
  const byKode = new Map();
  const uniqueKodes = [...new Set((kodeList || []).filter(Boolean))];
  if (uniqueKodes.length === 0) return { byKode };

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
    const skor = scoreDefektaPbf({
      harga_dasar: price?.harga_dasar,
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
      skor,
    });
  }

  for (const list of byKode.values()) {
    list.sort((a, b) => (b.skor || 0) - (a.skor || 0));
  }
  return { byKode };
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
      const [{ byKode: skorByKode }, pilihanRows] = await Promise.all([
        buildDefektaScoresByKode(kodeAll),
        fetchAllRows(() =>
          supabase
            .from('defekta_pilihan_pbf')
            .select('kode_obat, supplier_id, pricelist_kode_pbf')
            .eq('forecast_run_id', runId)
        ),
      ]);

      const pilihanByKode = new Map();
      for (const p of pilihanRows) {
        if (p.kode_obat) pilihanByKode.set(p.kode_obat, p);
      }

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
        const pilihan = pilihanByKode.get(row.kode_obat) || null;
        const pilihan_tersimpan = Boolean(pilihan?.supplier_id);
        // Default tersirat = skor tertinggi; override hanya jika user sudah Save.
        // Yellow di card hanya untuk obat yang perlu beli.
        let active_supplier_id = null;
        if (kebutuhan > 0) {
          active_supplier_id =
            pilihan?.supplier_id || recommended_supplier_id || null;
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
 * GET /api/forecast/defekta/:runId/:kodeObat
 * Kandidat PBF + skor + pilihan tersimpan.
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
        const skor = scoreDefektaPbf({
          harga_dasar: price?.harga_dasar,
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
          skor,
        });
      }

      const candidates = [...bySupplier.values()].sort(
        (a, b) => (b.skor || 0) - (a.skor || 0)
      );
      const recommended_supplier_id = candidates[0]?.supplier_id || null;

      const { data: pilihan, error: pilErr } = await supabase
        .from('defekta_pilihan_pbf')
        .select(
          'id, kode_obat, supplier_id, pricelist_kode_pbf, forecast_run_id, dipilih_oleh, tanggal_pilih'
        )
        .eq('forecast_run_id', runId)
        .eq('kode_obat', kodeObat)
        .maybeSingle();
      if (pilErr) throw pilErr;

      res.json({
        obat_hasil: hasil,
        candidates,
        recommended_supplier_id,
        pilihan: pilihan || null,
        selected_supplier_id:
          pilihan?.supplier_id || recommended_supplier_id || null,
      });
    } catch (err) {
      console.error('[forecast/defekta GET]', err);
      res.status(500).json({ error: err.message || 'Gagal memuat Defekta' });
    }
  }
);

/**
 * PUT /api/forecast/defekta/:runId/:kodeObat
 * Body: { supplier_id, pricelist_kode_pbf? }
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

      const { data, error } = await supabase
        .from('defekta_pilihan_pbf')
        .upsert(
          {
            forecast_run_id: runId,
            kode_obat: kodeObat,
            supplier_id: supplierId,
            pricelist_kode_pbf: kodePbf,
            dipilih_oleh: actorLabel(req),
            tanggal_pilih: new Date().toISOString(),
          },
          { onConflict: 'forecast_run_id,kode_obat' }
        )
        .select(
          'id, kode_obat, supplier_id, pricelist_kode_pbf, forecast_run_id, dipilih_oleh, tanggal_pilih'
        )
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      console.error('[forecast/defekta PUT]', err);
      res.status(500).json({ error: err.message || 'Gagal menyimpan Defekta' });
    }
  }
);

/**
 * DELETE /api/forecast/defekta/:runId/:kodeObat
 * Hapus pilihan tersimpan (kembali ke rekomendasi default di UI).
 */
router.delete(
  '/defekta/:runId/:kodeObat',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const runId = String(req.params.runId || '').trim();
      const kodeObat = decodeURIComponent(String(req.params.kodeObat || '').trim());
      if (!runId || !kodeObat) {
        return res.status(400).json({ error: 'runId dan kodeObat wajib' });
      }
      const { error } = await supabase
        .from('defekta_pilihan_pbf')
        .delete()
        .eq('forecast_run_id', runId)
        .eq('kode_obat', kodeObat);
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) {
      console.error('[forecast/defekta DELETE]', err);
      res.status(500).json({ error: err.message || 'Gagal reset Defekta' });
    }
  }
);

module.exports = router;
