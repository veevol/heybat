const express = require('express');
const { supabase } = require('../db');
const {
  requireAuth,
  requireApproved,
  requireMenuAksi,
} = require('../middleware/auth');
const { fetchAllRows } = require('../lib/stokRingkasan');
const { generateNomorSp } = require('../lib/nomorSp');
const { getPengaturanApotek } = require('../lib/pengaturanApotek');
const { buildDokumenSpPdfBuffer } = require('../lib/pdfSp');
const { uploadDokumenSpPdf } = require('../lib/storageSp');

const router = express.Router();
router.use(requireAuth, requireApproved);

const TANPA_GOLONGAN = 'Tanpa Golongan';
const KATEGORI_SPLIT_VALID = new Set(['gabung', 'pisah']);

/** Sama dengan expandKategoriUntukQuery di forecast.js — retail mencakup titip. */
const KATEGORI_TO_DB = {
  retail: ['retail', 'titip'],
  mitra: ['mitra'],
};

/**
 * Bulk load latest pricelist row per (pbf_id, kode_pbf).
 * Sama pola dengan forecast.js — query per-PBF, bukan N+1 per obat.
 * @param {Array<{ pbf_id: string, kode_pbf: string }>} pairs
 * @returns {Promise<Map<string, { harga_dasar: * }>>} key = `${pbfId}\0${kodePbf}`
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
          .select('pbf_id, kode_pbf, harga_dasar, tanggal_upload')
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

async function loadGolonganByKode(kodeObatList) {
  const golonganByKode = new Map();
  const kodes = [...new Set(kodeObatList.filter(Boolean))];
  for (let i = 0; i < kodes.length; i += 150) {
    const chunk = kodes.slice(i, i + 150);
    const rows = await fetchAllRows(() =>
      supabase
        .from('obat_yelo')
        .select('kode_obat, golongan:ref_golongan ( id, nama )')
        .in('kode_obat', chunk)
    );
    for (const o of rows) {
      golonganByKode.set(o.kode_obat, o.golongan?.nama || null);
    }
  }
  return golonganByKode;
}

/**
 * Metadata lengkap obat untuk isi tabel PDF SP: nama_obat, satuan (satuan_1),
 * zat_aktif, bentuk_sediaan, golongan. zat_aktif/bentuk_sediaan boleh kosong
 * (ditampilkan sebagai peringatan di Template 2, tidak menggagalkan generate).
 * @returns {Promise<Map<string, { golongan: string|null, nama_obat: string|null, satuan: string|null, zat_aktif: string|null, bentuk_sediaan: string|null }>>}
 */
async function loadObatMetaByKode(kodeObatList) {
  const metaByKode = new Map();
  const kodes = [...new Set(kodeObatList.filter(Boolean))];
  for (let i = 0; i < kodes.length; i += 150) {
    const chunk = kodes.slice(i, i + 150);
    const rows = await fetchAllRows(() =>
      supabase
        .from('obat_yelo')
        .select(
          'kode_obat, nama_obat, zat_aktif, bentuk_sediaan, golongan:ref_golongan ( id, nama ), satuan_1:ref_satuan!obat_yelo_satuan_1_id_fkey ( id, nama )'
        )
        .in('kode_obat', chunk)
    );
    for (const o of rows) {
      metaByKode.set(o.kode_obat, {
        golongan: o.golongan?.nama || null,
        nama_obat: o.nama_obat || null,
        satuan: o.satuan_1?.nama || null,
        zat_aktif: o.zat_aktif || null,
        bentuk_sediaan: o.bentuk_sediaan || null,
      });
    }
  }
  return metaByKode;
}

/**
 * Breakdown retail/mitra untuk 1 PBF, dipakai Section 3 card Pembuatan SP.
 * - Run 1 kategori → 1 baris (label = kategori run itu), tidak ada yang perlu displit.
 * - Run gabungan (retail+mitra) → split proporsional pakai ratioByKode yang sama
 *   dengan yang dipakai endpoint generate (computeRetailMitraRatioByKode), supaya
 *   angka breakdown di card konsisten dengan dokumen yang nanti benar-benar dibuat.
 * @param {Array<{ kode_obat: string, qty_order: number, nominal: number }>} items
 * @param {{ kategori_penjualan: string[] }} run
 * @param {Map<string, {ratioRetail:number, ratioMitra:number}>|null} ratioByKode
 * @returns {Array<{ kategori: string, jumlah_item: number, nominal: number }>}
 */
function computeKategoriBreakdownForSupplier(items, run, ratioByKode) {
  const runKategoriPenjualan = Array.isArray(run.kategori_penjualan)
    ? run.kategori_penjualan
    : [];
  if (runKategoriPenjualan.length <= 1) {
    const label = runKategoriPenjualan[0] || null;
    if (!label) return [];
    const totalNominal = items.reduce((s, i) => s + i.nominal, 0);
    return [
      {
        kategori: label,
        jumlah_item: items.length,
        nominal: Number(totalNominal.toFixed(2)),
      },
    ];
  }

  let retailItem = 0;
  let retailNominal = 0;
  let mitraItem = 0;
  let mitraNominal = 0;
  for (const item of items) {
    const ratio = ratioByKode?.get(item.kode_obat) || {
      ratioRetail: 0.5,
      ratioMitra: 0.5,
    };
    const qty = Number(item.qty_order) || 0;
    const harga = qty > 0 ? item.nominal / qty : 0;
    const retailQty = Math.round(qty * ratio.ratioRetail);
    const mitraQty = qty - retailQty;
    if (retailQty > 0) {
      retailItem += 1;
      retailNominal += harga * retailQty;
    }
    if (mitraQty > 0) {
      mitraItem += 1;
      mitraNominal += harga * mitraQty;
    }
  }
  return [
    { kategori: 'retail', jumlah_item: retailItem, nominal: Number(retailNominal.toFixed(2)) },
    { kategori: 'mitra', jumlah_item: mitraItem, nominal: Number(mitraNominal.toFixed(2)) },
  ];
}

/**
 * Ringkasan per card PBF untuk 1 forecast run: total item + nominal,
 * breakdown per golongan, breakdown per kategori (retail/mitra), status lock,
 * dan ringkasan dokumen_sp terbaru (untuk teks status di card).
 * Hanya PBF yang punya minimal 1 obat disetujui (defekta_pilihan_pbf) yang muncul.
 *
 * @returns {Promise<{ notFound: true } | { forecast_run_id: string, cards: Array }>}
 */
async function computeDokumenSpBreakdown(runId) {
  const { data: run, error: runErr } = await supabase
    .from('forecast_run')
    .select(
      'id, kategori_penjualan, periode_forecast_hari, periode_histori_hari, dijalankan_saat'
    )
    .eq('id', runId)
    .maybeSingle();
  if (runErr) throw runErr;
  if (!run) {
    return { notFound: true };
  }

  const pilihanRows = await fetchAllRows(() =>
    supabase
      .from('defekta_pilihan_pbf')
      .select('kode_obat, supplier_id, pricelist_kode_pbf, qty_order')
      .eq('forecast_run_id', runId)
  );

  if (pilihanRows.length === 0) {
    return { forecast_run_id: runId, cards: [] };
  }

  const supplierIdSet = new Set();
  for (const row of pilihanRows) {
    if (row.supplier_id) supplierIdSet.add(row.supplier_id);
  }

  const runKategoriPenjualan = Array.isArray(run.kategori_penjualan)
    ? run.kategori_penjualan
    : [];

  const [golonganByKode, supplierRows, lockRows, dokumenRows, ratioByKode] =
    await Promise.all([
      loadGolonganByKode(pilihanRows.map((r) => r.kode_obat)),
      fetchAllRows(() =>
        supabase
          .from('supplier')
          .select(
            'id, nama, inisial, no_telp_pbf, nama_sales, no_wa_sales, jenis_kelamin_sales'
          )
          .in('id', [...supplierIdSet])
      ),
      fetchAllRows(() =>
        supabase
          .from('defekta_pbf_lock')
          .select('supplier_id, locked, kategori_dipilih')
          .eq('forecast_run_id', runId)
          .in('supplier_id', [...supplierIdSet])
      ),
      fetchAllRows(() =>
        supabase
          .from('dokumen_sp')
          .select('supplier_id, versi, status')
          .eq('forecast_run_id', runId)
          .in('supplier_id', [...supplierIdSet])
      ),
      runKategoriPenjualan.length > 1
        ? (() => {
            const since = new Date(run.dijalankan_saat);
            since.setDate(since.getDate() - Number(run.periode_histori_hari));
            return computeRetailMitraRatioByKode({
              kodeObatList: pilihanRows.map((r) => r.kode_obat),
              periodeHistoriHari: Number(run.periode_histori_hari),
              periodeForecastHari: Number(run.periode_forecast_hari),
              sinceIso: since.toISOString(),
            });
          })()
        : Promise.resolve(null),
    ]);

  const supplierById = new Map();
  for (const s of supplierRows) {
    supplierById.set(s.id, s);
  }

  const lockBySupplier = new Map();
  for (const l of lockRows) {
    lockBySupplier.set(l.supplier_id, l);
  }

  const dokumenBySupplier = new Map();
  for (const d of dokumenRows) {
    let arr = dokumenBySupplier.get(d.supplier_id);
    if (!arr) {
      arr = [];
      dokumenBySupplier.set(d.supplier_id, arr);
    }
    arr.push(d);
  }

  const pricePairs = pilihanRows
    .filter((r) => r.supplier_id && r.pricelist_kode_pbf)
    .map((r) => ({ pbf_id: r.supplier_id, kode_pbf: r.pricelist_kode_pbf }));
  const priceMap = await loadLatestPricelistMap(pricePairs);

  /** @type {Map<string, { supplier_id: string, items: Array }>} */
  const bySupplier = new Map();
  for (const row of pilihanRows) {
    if (!row.supplier_id) continue;
    let slot = bySupplier.get(row.supplier_id);
    if (!slot) {
      slot = { supplier_id: row.supplier_id, items: [] };
      bySupplier.set(row.supplier_id, slot);
    }
    const harga =
      row.supplier_id && row.pricelist_kode_pbf
        ? Number(
            priceMap.get(`${row.supplier_id}\0${row.pricelist_kode_pbf}`)
              ?.harga_dasar
          ) || 0
        : 0;
    const qty = Number(row.qty_order) || 0;
    slot.items.push({
      kode_obat: row.kode_obat,
      golongan: golonganByKode.get(row.kode_obat) || TANPA_GOLONGAN,
      qty_order: qty,
      nominal: qty * harga,
    });
  }

  const cards = [...bySupplier.values()]
    .map((slot) => {
      const supplier = supplierById.get(slot.supplier_id) || null;
      const golonganMap = new Map();
      let totalNominal = 0;
      for (const item of slot.items) {
        totalNominal += item.nominal;
        let g = golonganMap.get(item.golongan);
        if (!g) {
          g = { golongan: item.golongan, jumlah_item: 0, nominal: 0 };
          golonganMap.set(item.golongan, g);
        }
        g.jumlah_item += 1;
        g.nominal += item.nominal;
      }
      const lock = lockBySupplier.get(slot.supplier_id) || null;

      const docs = dokumenBySupplier.get(slot.supplier_id) || [];
      let dokumenTerbaru = { ada: false, versi: null, status: null, jumlah_versi: 0 };
      if (docs.length > 0) {
        const versiSet = new Set(docs.map((d) => d.versi));
        const versiTerbaru = Math.max(...docs.map((d) => d.versi));
        const docsTerbaru = docs.filter((d) => d.versi === versiTerbaru);
        const semuaTerkirim = docsTerbaru.every((d) => d.status === 'dikirim');
        dokumenTerbaru = {
          ada: true,
          versi: versiTerbaru,
          status: semuaTerkirim ? 'dikirim' : 'terbit',
          jumlah_versi: versiSet.size,
        };
      }

      return {
        supplier_id: slot.supplier_id,
        supplier_nama: supplier?.nama || null,
        supplier_inisial: supplier?.inisial || null,
        supplier_telp: supplier?.no_telp_pbf || null,
        supplier_nama_sales: supplier?.nama_sales || null,
        supplier_no_wa_sales: supplier?.no_wa_sales || null,
        supplier_jenis_kelamin_sales: supplier?.jenis_kelamin_sales || null,
        total_item: slot.items.length,
        total_nominal: Number(totalNominal.toFixed(2)),
        breakdown_golongan: [...golonganMap.values()]
          .map((g) => ({ ...g, nominal: Number(g.nominal.toFixed(2)) }))
          .sort((a, b) => a.golongan.localeCompare(b.golongan, 'id')),
        breakdown_kategori: computeKategoriBreakdownForSupplier(
          slot.items,
          run,
          ratioByKode
        ),
        lock: {
          locked: lock?.locked === true,
          kategori_dipilih: lock?.kategori_dipilih || null,
        },
        dokumen_terbaru: dokumenTerbaru,
      };
    })
    .sort((a, b) =>
      String(a.supplier_inisial || a.supplier_nama || '').localeCompare(
        String(b.supplier_inisial || b.supplier_nama || ''),
        'id'
      )
    );

  return { forecast_run_id: runId, cards };
}

/**
 * Hitung ulang rasio perkiraan_terjual retail:mitra per obat, dari penjualan_obat
 * mentah, memakai window histori PERSIS SAMA dengan forecast_run aslinya
 * (dijalankan_saat - periode_histori_hari, sebanyak periode_forecast_hari ke depan).
 *
 * Rasio ini dipakai untuk memproporsikan qty_order yang SUDAH di-approve di Defekta
 * (bukan menghitung ulang kebutuhan_beli) — supaya total retail+mitra tetap sama
 * persis dengan qty_order final, termasuk kalau qty_order sudah diedit manual.
 *
 * perkiraan_terjual per kategori itu additive (rata-rata linear dari jumlah baris
 * penjualan), beda dengan kebutuhan_beli yang tidak additive karena ada MAX(0, ...)
 * dan pengurangan stok yang sama untuk kedua kategori — makanya rasio dihitung dari
 * perkiraan_terjual, bukan dari kebutuhan_beli.
 *
 * Fallback kalau 2 kategori sama-sama tidak ada histori penjualan sama sekali
 * (obat baru) untuk kode_obat tsb: rasio 50/50.
 *
 * @returns {Promise<Map<string, { ratioRetail: number, ratioMitra: number }>>}
 */
async function computeRetailMitraRatioByKode({
  kodeObatList,
  periodeHistoriHari,
  periodeForecastHari,
  sinceIso,
}) {
  const kodes = [...new Set(kodeObatList.filter(Boolean))];
  const qtyRetail = new Map();
  const qtyMitra = new Map();

  for (let i = 0; i < kodes.length; i += 150) {
    const chunk = kodes.slice(i, i + 150);
    const rows = await fetchAllRows(() =>
      supabase
        .from('penjualan_obat')
        .select('kode_obat, jumlah, kategori_pelanggan')
        .in('kode_obat', chunk)
        .in('kategori_pelanggan', [
          ...KATEGORI_TO_DB.retail,
          ...KATEGORI_TO_DB.mitra,
        ])
        .gte('tanggal_transaksi', sinceIso)
    );
    for (const row of rows) {
      const kode = row.kode_obat;
      if (!kode) continue;
      const qty = Number(row.jumlah) || 0;
      if (KATEGORI_TO_DB.retail.includes(row.kategori_pelanggan)) {
        qtyRetail.set(kode, (qtyRetail.get(kode) || 0) + qty);
      } else if (KATEGORI_TO_DB.mitra.includes(row.kategori_pelanggan)) {
        qtyMitra.set(kode, (qtyMitra.get(kode) || 0) + qty);
      }
    }
  }

  const ratioByKode = new Map();
  for (const kode of kodes) {
    const perkiraanRetail =
      ((qtyRetail.get(kode) || 0) / periodeHistoriHari) * periodeForecastHari;
    const perkiraanMitra =
      ((qtyMitra.get(kode) || 0) / periodeHistoriHari) * periodeForecastHari;
    const total = perkiraanRetail + perkiraanMitra;
    ratioByKode.set(
      kode,
      total > 0
        ? { ratioRetail: perkiraanRetail / total, ratioMitra: perkiraanMitra / total }
        : { ratioRetail: 0.5, ratioMitra: 0.5 }
    );
  }
  return ratioByKode;
}

/**
 * Nomor versi berikutnya untuk 1 kombinasi run+PBF: 0 kalau belum ada dokumen
 * sama sekali, atau (versi tertinggi + 1) kalau sudah ada — dipakai baik oleh
 * generate awal maupun revisi, supaya penomoran selalu konsisten & tidak
 * pernah bentrok/reset ke 0 walau sempat dibuka-kunci lewat Batalkan SP.
 */
async function getNextVersi(forecastRunId, supplierId) {
  const existingDocs = await fetchAllRows(() =>
    supabase
      .from('dokumen_sp')
      .select('versi')
      .eq('forecast_run_id', forecastRunId)
      .eq('supplier_id', supplierId)
  );
  return existingDocs.length
    ? Math.max(...existingDocs.map((d) => d.versi)) + 1
    : 0;
}

/**
 * Inti pembuatan dokumen_sp + dokumen_sp_item + PDF untuk 1 PBF, dipakai baik
 * oleh generate awal (versi=0) maupun revisi (Batalkan SP, versi=N). TIDAK
 * melakukan cek/ubah defekta_pbf_lock — itu tanggung jawab pemanggil, supaya
 * aturan lock (locked harus false utk generate awal, harus true utk revisi)
 * tetap eksplisit di masing-masing endpoint.
 * @returns {Promise<{ status: number, body: object }>}
 */
async function buildDanSimpanDokumenSp({
  forecastRunId,
  supplierId,
  kategoriSplit,
  versi,
  dibuatOleh,
}) {
  if (!forecastRunId || !supplierId) {
    return {
      status: 400,
      body: { error: 'forecast_run_id dan supplier_id wajib' },
    };
  }
  if (!KATEGORI_SPLIT_VALID.has(kategoriSplit)) {
    return {
      status: 400,
      body: { error: "kategori_split harus 'gabung' atau 'pisah'" },
    };
  }

  const { data: run, error: runErr } = await supabase
    .from('forecast_run')
    .select(
      'id, kategori_penjualan, periode_forecast_hari, periode_histori_hari, dijalankan_saat'
    )
    .eq('id', forecastRunId)
    .maybeSingle();
  if (runErr) throw runErr;
  if (!run) {
    return { status: 404, body: { error: 'Forecast run tidak ditemukan' } };
  }

  // Hanya item dengan qty_order > 0 yang benar-benar dipesan ke PBF — baris
  // qty 0 (mis. dari "Setujui Semua" yang menyetujui walau tidak perlu order)
  // tidak masuk dokumen_sp_item/PDF, supaya SP tidak berisi barang qty nol.
  const pilihanRows = await fetchAllRows(() =>
    supabase
      .from('defekta_pilihan_pbf')
      .select('kode_obat, qty_order')
      .eq('forecast_run_id', forecastRunId)
      .eq('supplier_id', supplierId)
      .gt('qty_order', 0)
  );
  if (pilihanRows.length === 0) {
    return {
      status: 400,
      body: {
        error:
          'Tidak ada obat dengan qty > 0 yang disetujui untuk PBF ini pada run tersebut',
      },
    };
  }

  const [obatMetaByKode, supplierRes, pengaturan] = await Promise.all([
    loadObatMetaByKode(pilihanRows.map((r) => r.kode_obat)),
    supabase
      .from('supplier')
      .select('id, nama, alamat, no_telp_pbf')
      .eq('id', supplierId)
      .maybeSingle(),
    getPengaturanApotek(),
  ]);
  if (supplierRes.error) throw supplierRes.error;
  const supplierInfo = supplierRes.data || null;

  const golonganByKode = new Map(
    [...obatMetaByKode.entries()].map(([kode, meta]) => [kode, meta.golongan])
  );

  /** @type {Array<{ golongan: string, kategori: 'retail'|'mitra'|'gabung', items: Array<{kode_obat:string, qty_order:number}> }>} */
  const docsToCreate = [];
  const runKategoriPenjualan = Array.isArray(run.kategori_penjualan)
    ? run.kategori_penjualan
    : [];

  if (kategoriSplit === 'gabung') {
    const byGolongan = new Map();
    for (const row of pilihanRows) {
      const golongan = golonganByKode.get(row.kode_obat) || TANPA_GOLONGAN;
      if (!byGolongan.has(golongan)) byGolongan.set(golongan, []);
      byGolongan.get(golongan).push({
        kode_obat: row.kode_obat,
        qty_order: Number(row.qty_order) || 0,
      });
    }
    for (const [golongan, items] of byGolongan) {
      docsToCreate.push({ golongan, kategori: 'gabung', items });
    }
  } else if (runKategoriPenjualan.length === 1) {
    // Run cuma 1 kategori → tidak ada yang perlu di-split; dokumen dilabeli
    // kategori asli run itu (retail atau mitra), bukan 'gabung'.
    const kategoriLabel = runKategoriPenjualan[0];
    const byGolongan = new Map();
    for (const row of pilihanRows) {
      const golongan = golonganByKode.get(row.kode_obat) || TANPA_GOLONGAN;
      if (!byGolongan.has(golongan)) byGolongan.set(golongan, []);
      byGolongan.get(golongan).push({
        kode_obat: row.kode_obat,
        qty_order: Number(row.qty_order) || 0,
      });
    }
    for (const [golongan, items] of byGolongan) {
      docsToCreate.push({ golongan, kategori: kategoriLabel, items });
    }
  } else {
    // Run gabungan (retail+mitra) + Pisah=on → proporsikan qty_order approved
    // berdasarkan rasio perkiraan_terjual retail:mitra yang dihitung ulang dari
    // histori penjualan_obat mentah, pakai window persis sama dengan run asal.
    const since = new Date(run.dijalankan_saat);
    since.setDate(since.getDate() - Number(run.periode_histori_hari));
    const ratioByKode = await computeRetailMitraRatioByKode({
      kodeObatList: pilihanRows.map((r) => r.kode_obat),
      periodeHistoriHari: Number(run.periode_histori_hari),
      periodeForecastHari: Number(run.periode_forecast_hari),
      sinceIso: since.toISOString(),
    });

    const byGolonganKategori = new Map();
    for (const row of pilihanRows) {
      const golongan = golonganByKode.get(row.kode_obat) || TANPA_GOLONGAN;
      const qtyOrder = Number(row.qty_order) || 0;
      const ratio = ratioByKode.get(row.kode_obat) || {
        ratioRetail: 0.5,
        ratioMitra: 0.5,
      };
      const retailQty = Math.round(qtyOrder * ratio.ratioRetail);
      const mitraQty = qtyOrder - retailQty;

      if (retailQty > 0) {
        const key = `${golongan}\0retail`;
        if (!byGolonganKategori.has(key)) {
          byGolonganKategori.set(key, { golongan, kategori: 'retail', items: [] });
        }
        byGolonganKategori
          .get(key)
          .items.push({ kode_obat: row.kode_obat, qty_order: retailQty });
      }
      if (mitraQty > 0) {
        const key = `${golongan}\0mitra`;
        if (!byGolonganKategori.has(key)) {
          byGolonganKategori.set(key, { golongan, kategori: 'mitra', items: [] });
        }
        byGolonganKategori
          .get(key)
          .items.push({ kode_obat: row.kode_obat, qty_order: mitraQty });
      }
    }
    docsToCreate.push(...byGolonganKategori.values());
  }

  if (docsToCreate.length === 0) {
    return {
      status: 400,
      body: {
        error: 'Tidak ada obat dengan qty > 0 untuk digenerate jadi dokumen SP',
      },
    };
  }

  const nowIso = new Date().toISOString();

  // Nomor SP digenerate berurutan (bukan Promise.all) supaya urutannya
  // deterministik sesuai urutan dokumen dibuat, walau counter DB sendiri
  // sudah atomik/aman dari race condition.
  const nomorSpList = [];
  for (let i = 0; i < docsToCreate.length; i += 1) {
    nomorSpList.push(await generateNomorSp());
  }

  const { data: insertedDocs, error: insertDocErr } = await supabase
    .from('dokumen_sp')
    .insert(
      docsToCreate.map((d, i) => ({
        forecast_run_id: forecastRunId,
        supplier_id: supplierId,
        golongan: d.golongan,
        kategori: d.kategori,
        versi,
        status: 'terbit',
        tanggal_terbit: nowIso,
        dibuat_oleh: dibuatOleh || null,
        nomor_sp: nomorSpList[i],
      }))
    )
    .select('id, golongan, kategori, versi, nomor_sp');
  if (insertDocErr) throw insertDocErr;

  const itemRows = [];
  for (let i = 0; i < docsToCreate.length; i += 1) {
    const dokumenSpId = insertedDocs[i].id;
    for (const item of docsToCreate[i].items) {
      itemRows.push({
        dokumen_sp_id: dokumenSpId,
        kode_obat: item.kode_obat,
        supplier_id: supplierId,
        qty_order: item.qty_order,
      });
    }
  }
  const { error: insertItemErr } = await supabase
    .from('dokumen_sp_item')
    .insert(itemRows);
  if (insertItemErr) throw insertItemErr;

  // Generate PDF + upload SEBELUM response (bukan async terpisah), supaya
  // file_path sudah terisi saat response balik ke frontend.
  for (let i = 0; i < docsToCreate.length; i += 1) {
    const doc = docsToCreate[i];
    const inserted = insertedDocs[i];
    const pdfItems = doc.items.map((item) => {
      const meta = obatMetaByKode.get(item.kode_obat) || {};
      return {
        kode_obat: item.kode_obat,
        qty_order: item.qty_order,
        nama_obat: meta.nama_obat,
        satuan: meta.satuan,
        zat_aktif: meta.zat_aktif,
        bentuk_sediaan: meta.bentuk_sediaan,
      };
    });

    const pdfBuffer = await buildDokumenSpPdfBuffer({
      dokumen: {
        golongan: doc.golongan,
        nomor_sp: inserted.nomor_sp,
        tanggal_terbit: nowIso,
      },
      items: pdfItems,
      supplier: supplierInfo,
      pengaturan,
    });
    const filePath = await uploadDokumenSpPdf(inserted.nomor_sp, pdfBuffer);

    const { error: updateFileErr } = await supabase
      .from('dokumen_sp')
      .update({ file_path: filePath })
      .eq('id', inserted.id);
    if (updateFileErr) throw updateFileErr;

    inserted.file_path = filePath;
  }

  return { status: 200, body: { dokumen: insertedDocs } };
}

/**
 * Generate dokumen SP awal (versi=0) per golongan untuk 1 PBF dari obat yang
 * sudah disetujui di Defekta. Ditolak kalau kombinasi run+PBF sudah locked=true
 * (harus lewat endpoint Batalkan SP/revisi kalau mau generate ulang).
 * @returns {Promise<{ status: number, body: object }>}
 */
async function generateDokumenSp({
  forecastRunId,
  supplierId,
  kategoriSplit,
  dibuatOleh,
}) {
  const { data: existingLock, error: lockCheckErr } = await supabase
    .from('defekta_pbf_lock')
    .select('locked')
    .eq('forecast_run_id', forecastRunId)
    .eq('supplier_id', supplierId)
    .maybeSingle();
  if (lockCheckErr) throw lockCheckErr;
  if (existingLock?.locked) {
    return {
      status: 409,
      body: {
        error:
          'SP sudah pernah digenerate untuk PBF ini, gunakan endpoint Batalkan SP dulu kalau mau revisi',
      },
    };
  }

  const versi = await getNextVersi(forecastRunId, supplierId);
  const result = await buildDanSimpanDokumenSp({
    forecastRunId,
    supplierId,
    kategoriSplit,
    versi,
    dibuatOleh,
  });
  if (result.status !== 200) return result;

  const { error: lockErr } = await supabase.from('defekta_pbf_lock').upsert(
    {
      forecast_run_id: forecastRunId,
      supplier_id: supplierId,
      locked: true,
      kategori_dipilih: kategoriSplit,
    },
    { onConflict: 'forecast_run_id,supplier_id' }
  );
  if (lockErr) throw lockErr;

  return result;
}

/**
 * Batalkan SP → generate revisi baru (versi = versi_terbaru + 1) dari data
 * defekta_pilihan_pbf TERKINI (bukan snapshot lama), pakai kategori_split yang
 * sama dengan yang terakhir dipilih (tersimpan di defekta_pbf_lock). Dokumen
 * versi sebelumnya TETAP ADA (append-only). Setelah sukses, lock dibuka lagi
 * (locked=false) supaya switch Setuju & Gabung/Pisah bisa dipakai lagi.
 * Hanya valid kalau kombinasi run+PBF SUDAH locked=true (sudah pernah generate).
 * @returns {Promise<{ status: number, body: object }>}
 */
async function revisiDokumenSp({ forecastRunId, supplierId, dibuatOleh }) {
  if (!forecastRunId || !supplierId) {
    return {
      status: 400,
      body: { error: 'forecast_run_id dan supplier_id wajib' },
    };
  }

  const { data: existingLock, error: lockCheckErr } = await supabase
    .from('defekta_pbf_lock')
    .select('locked, kategori_dipilih')
    .eq('forecast_run_id', forecastRunId)
    .eq('supplier_id', supplierId)
    .maybeSingle();
  if (lockCheckErr) throw lockCheckErr;
  if (!existingLock?.locked) {
    return {
      status: 400,
      body: {
        error:
          'Belum ada SP untuk PBF ini — pakai tombol Generate SP dulu, bukan Batalkan SP',
      },
    };
  }
  const kategoriSplit = KATEGORI_SPLIT_VALID.has(existingLock.kategori_dipilih)
    ? existingLock.kategori_dipilih
    : 'gabung';

  const versi = await getNextVersi(forecastRunId, supplierId);
  const result = await buildDanSimpanDokumenSp({
    forecastRunId,
    supplierId,
    kategoriSplit,
    versi,
    dibuatOleh,
  });
  if (result.status !== 200) return result;

  const { error: unlockErr } = await supabase
    .from('defekta_pbf_lock')
    .update({ locked: false })
    .eq('forecast_run_id', forecastRunId)
    .eq('supplier_id', supplierId);
  if (unlockErr) throw unlockErr;

  return result;
}

/**
 * GET /api/dokumen-sp/breakdown/:runId
 */
router.get(
  '/breakdown/:runId',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const runId = String(req.params.runId || '').trim();
      if (!runId) {
        return res.status(400).json({ error: 'runId wajib' });
      }
      const result = await computeDokumenSpBreakdown(runId);
      if (result.notFound) {
        return res.status(404).json({ error: 'Forecast run tidak ditemukan' });
      }
      res.json(result);
    } catch (err) {
      console.error('[dokumen-sp breakdown]', err);
      res
        .status(500)
        .json({ error: err.message || 'Gagal memuat breakdown Dokumen SP' });
    }
  }
);

/**
 * POST /api/dokumen-sp/generate
 * Body: { forecast_run_id, supplier_id, kategori_split: 'gabung' | 'pisah' }
 */
router.post(
  '/generate',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const result = await generateDokumenSp({
        forecastRunId: String(req.body?.forecast_run_id || '').trim(),
        supplierId: String(req.body?.supplier_id || '').trim(),
        kategoriSplit: String(req.body?.kategori_split || '')
          .trim()
          .toLowerCase(),
        dibuatOleh: req.user?.id || null,
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[dokumen-sp generate]', err);
      res
        .status(500)
        .json({ error: err.message || 'Gagal generate Dokumen SP' });
    }
  }
);

/**
 * POST /api/dokumen-sp/batalkan
 * Body: { forecast_run_id, supplier_id }
 * "Batalkan SP" → generate revisi baru (versi+1) dari data defekta_pilihan_pbf
 * terkini, dokumen versi sebelumnya tetap ada, lalu buka kunci switch lagi.
 */
router.post(
  '/batalkan',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const result = await revisiDokumenSp({
        forecastRunId: String(req.body?.forecast_run_id || '').trim(),
        supplierId: String(req.body?.supplier_id || '').trim(),
        dibuatOleh: req.user?.id || null,
      });
      res.status(result.status).json(result.body);
    } catch (err) {
      console.error('[dokumen-sp batalkan]', err);
      res
        .status(500)
        .json({ error: err.message || 'Gagal generate revisi Dokumen SP' });
    }
  }
);

/**
 * GET /api/dokumen-sp/list/:runId/:supplierId
 * Semua dokumen_sp (semua versi) untuk 1 kombinasi run+PBF, versi terbaru dulu.
 */
router.get(
  '/list/:runId/:supplierId',
  requireMenuAksi('forecasting', 'lihat'),
  async (req, res) => {
    try {
      const runId = String(req.params.runId || '').trim();
      const supplierId = String(req.params.supplierId || '').trim();
      if (!runId || !supplierId) {
        return res.status(400).json({ error: 'runId dan supplierId wajib' });
      }

      const rows = await fetchAllRows(() =>
        supabase
          .from('dokumen_sp')
          .select(
            'id, golongan, kategori, versi, status, tanggal_terbit, tanggal_kirim, nomor_sp, file_path'
          )
          .eq('forecast_run_id', runId)
          .eq('supplier_id', supplierId)
          .order('versi', { ascending: false })
      );

      res.json({ forecast_run_id: runId, supplier_id: supplierId, dokumen: rows });
    } catch (err) {
      console.error('[dokumen-sp list]', err);
      res
        .status(500)
        .json({ error: err.message || 'Gagal memuat daftar Dokumen SP' });
    }
  }
);

/**
 * POST /api/dokumen-sp/kirim
 * Body: { forecast_run_id, supplier_id }
 * Tandai SEMUA dokumen_sp versi terbaru (batch generate/revisi terakhir) untuk
 * kombinasi run+PBF ini jadi status='dikirim' + tanggal_kirim=now(). Dipanggil
 * setelah user klik "Kirim WA" dan diasumsikan benar-benar kirim manual.
 */
router.post('/kirim', requireMenuAksi('forecasting', 'lihat'), async (req, res) => {
  try {
    const forecastRunId = String(req.body?.forecast_run_id || '').trim();
    const supplierId = String(req.body?.supplier_id || '').trim();
    if (!forecastRunId || !supplierId) {
      return res
        .status(400)
        .json({ error: 'forecast_run_id dan supplier_id wajib' });
    }

    const docs = await fetchAllRows(() =>
      supabase
        .from('dokumen_sp')
        .select('id, versi')
        .eq('forecast_run_id', forecastRunId)
        .eq('supplier_id', supplierId)
    );
    if (docs.length === 0) {
      return res
        .status(404)
        .json({ error: 'Belum ada dokumen SP untuk PBF ini' });
    }
    const versiTerbaru = Math.max(...docs.map((d) => d.versi));
    const idsTerbaru = docs
      .filter((d) => d.versi === versiTerbaru)
      .map((d) => d.id);

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateErr } = await supabase
      .from('dokumen_sp')
      .update({ status: 'dikirim', tanggal_kirim: nowIso })
      .in('id', idsTerbaru)
      .select('id, golongan, kategori, versi, status, tanggal_kirim');
    if (updateErr) throw updateErr;

    res.json({ dokumen: updated });
  } catch (err) {
    console.error('[dokumen-sp kirim]', err);
    res
      .status(500)
      .json({ error: err.message || 'Gagal update status kirim Dokumen SP' });
  }
});

module.exports = router;
module.exports.computeDokumenSpBreakdown = computeDokumenSpBreakdown;
module.exports.generateDokumenSp = generateDokumenSp;
module.exports.revisiDokumenSp = revisiDokumenSp;
