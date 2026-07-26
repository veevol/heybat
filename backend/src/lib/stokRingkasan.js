const { supabase } = require('../db');

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

/**
 * Ringkasan stok per kode_obat dari snapshot upload_batch TERBARU saja.
 * 1-2 query (bukan N+1): batch terbaru + semua baris stok_obat batch itu.
 * @returns {Promise<Map<string, { stok_total: number, satuan: string|null, harga_1: *, harga_2: *, harga_3: *, gudang_list: Array }>>}
 */
async function loadLatestStokRingkasanMap() {
  const { data: latestBatch, error: batchErr } = await supabase
    .from('stok_upload_batch')
    .select('id')
    .order('tanggal_upload', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (batchErr) throw batchErr;
  if (!latestBatch) return new Map();

  const rows = await fetchAllRows(() =>
    supabase
      .from('stok_obat')
      .select('kode_obat, gudang, stok_qty, satuan, harga_1, harga_2, harga_3')
      .eq('upload_batch_id', latestBatch.id)
  );

  const byKode = new Map();
  for (const row of rows) {
    const kode = row.kode_obat;
    if (!kode) continue;
    let slot = byKode.get(kode);
    if (!slot) {
      slot = {
        stok_total: 0,
        satuan: null,
        harga_1: null,
        harga_2: null,
        harga_3: null,
        gudangMap: new Map(),
      };
      byKode.set(kode, slot);
    }
    const qty = Number(row.stok_qty) || 0;
    slot.stok_total += qty;
    if (!slot.satuan && row.satuan) slot.satuan = row.satuan;
    if (slot.harga_1 == null && row.harga_1 != null) slot.harga_1 = row.harga_1;
    if (slot.harga_2 == null && row.harga_2 != null) slot.harga_2 = row.harga_2;
    if (slot.harga_3 == null && row.harga_3 != null) slot.harga_3 = row.harga_3;

    const gudang = row.gudang || 'Retail';
    const g = slot.gudangMap.get(gudang) || {
      gudang,
      stok_total: 0,
      satuan: row.satuan || null,
    };
    g.stok_total += qty;
    if (!g.satuan && row.satuan) g.satuan = row.satuan;
    slot.gudangMap.set(gudang, g);
  }

  const result = new Map();
  for (const [kode, slot] of byKode) {
    result.set(kode, {
      stok_total: slot.stok_total,
      satuan: slot.satuan,
      harga_1: slot.harga_1,
      harga_2: slot.harga_2,
      harga_3: slot.harga_3,
      gudang_list: [...slot.gudangMap.values()].sort((a, b) =>
        String(a.gudang).localeCompare(String(b.gudang), 'id')
      ),
    });
  }
  return result;
}

module.exports = {
  fetchAllRows,
  loadLatestStokRingkasanMap,
};
