/**
 * Perbaikan kode_pbf bentrok di pricelist.
 *
 * Akar masalah: nextSeq/fetchNamaToKode dulu hanya baca 1000 baris PostgREST,
 * sehingga nomor urut bisa reuse → 1 kode dipakai >1 nama obat.
 *
 * Aturan perbaikan:
 * - Pemilik kanonis suatu kode = baris paling lama (tanggal_upload, id) untuk kode itu.
 * - Baris lain yang memakai kode itu dengan nama berbeda → dapat kode baru.
 * - Matching (pricelist_pbf_id + pricelist_kode_pbf) tetap di kode lama (pemilik),
 *   obat yang dapat kode baru jadi "belum match" (benar secara data).
 *
 * Usage: node scripts/repair-pricelist-kode-collisions.js [--dry-run]
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const DRY = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function fetchAll(buildQuery, pageSize = 1000) {
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

function formatKode(inisial, seq) {
  return `${inisial}-${String(seq).padStart(5, '0')}`;
}

function parseKodeSeq(kodePbf, inisial) {
  const prefix = `${inisial}-`;
  if (!kodePbf?.startsWith(prefix)) return 0;
  const n = Number(kodePbf.slice(prefix.length));
  return Number.isFinite(n) ? n : 0;
}

function namaKey(nama) {
  return String(nama || '')
    .trim()
    .toLowerCase();
}

function rowTime(row) {
  const t = Date.parse(row.tanggal_upload || 0);
  return Number.isFinite(t) ? t : 0;
}

/** Earlier upload / smaller id wins. */
function isEarlier(a, b) {
  const ta = rowTime(a);
  const tb = rowTime(b);
  if (ta !== tb) return ta < tb;
  return String(a.id).localeCompare(String(b.id)) < 0;
}

async function repairPbf(supplier) {
  const pbfId = supplier.id;
  const inisial = supplier.inisial;
  const rows = await fetchAll(() =>
    supabase
      .from('pricelist')
      .select(
        'id, pbf_id, kode_pbf, nama_barang, tanggal_upload, auto_kosong, dihapus_pada'
      )
      .eq('pbf_id', pbfId)
      .order('tanggal_upload', { ascending: true })
      .order('id', { ascending: true })
  );

  // kode → pemilik kanonis (baris paling lama)
  const kodeOwner = new Map();
  for (const row of rows) {
    if (!row.kode_pbf) continue;
    const prev = kodeOwner.get(row.kode_pbf);
    if (!prev || isEarlier(row, prev)) kodeOwner.set(row.kode_pbf, row);
  }

  const usedKodes = new Set(rows.map((r) => r.kode_pbf).filter(Boolean));
  let seq = 0;
  for (const kode of usedKodes) {
    seq = Math.max(seq, parseKodeSeq(kode, inisial));
  }
  seq += 1;

  function allocKode() {
    let kode = formatKode(inisial, seq);
    while (usedKodes.has(kode)) {
      seq += 1;
      kode = formatKode(inisial, seq);
    }
    seq += 1;
    usedKodes.add(kode);
    return kode;
  }

  const updates = [];
  for (const row of rows) {
    const key = namaKey(row.nama_barang);
    if (!key || !row.kode_pbf) continue;
    const owner = kodeOwner.get(row.kode_pbf);
    const ownerKey = namaKey(owner?.nama_barang);
    if (ownerKey === key) continue; // pemilik sah

    const newKode = allocKode();
    updates.push({
      id: row.id,
      old_kode: row.kode_pbf,
      new_kode: newKode,
      nama_barang: row.nama_barang,
      tanggal_upload: row.tanggal_upload,
      dihapus: Boolean(row.dihapus_pada),
    });
  }

  if (!updates.length) {
    return { pbfId, inisial, nama: supplier.nama, updated: 0, samples: [] };
  }

  if (!DRY) {
    const chunkSize = 100;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (u) => {
          const { error } = await supabase
            .from('pricelist')
            .update({ kode_pbf: u.new_kode })
            .eq('id', u.id);
          if (error) throw error;
        })
      );
    }
  }

  return {
    pbfId,
    inisial,
    nama: supplier.nama,
    updated: updates.length,
    samples: updates.slice(0, 8),
  };
}

async function verifyGlobalApr30(pbfId) {
  const tanggal = '2026-07-29T15:39:43.779+00:00';
  const rows = await fetchAll(() =>
    supabase
      .from('pricelist')
      .select('kode_pbf, nama_barang, auto_kosong, dihapus_pada')
      .eq('pbf_id', pbfId)
      .eq('tanggal_upload', tanggal)
  );
  const active = rows.filter((r) => !r.dihapus_pada && !r.auto_kosong);
  const unique = new Set(active.map((r) => r.kode_pbf));
  const byKode = new Map();
  for (const r of active) {
    if (!byKode.has(r.kode_pbf)) byKode.set(r.kode_pbf, new Set());
    byKode.get(r.kode_pbf).add(namaKey(r.nama_barang));
  }
  const stillColliding = [...byKode.entries()].filter(([, s]) => s.size > 1);
  return {
    rows: active.length,
    uniqueKode: unique.size,
    collisions: stillColliding.length,
    ok: active.length === unique.size && stillColliding.length === 0,
  };
}

async function main() {
  console.log(DRY ? '=== DRY RUN ===' : '=== APPLY REPAIR ===');
  const suppliers = await fetchAll(() =>
    supabase.from('supplier').select('id, nama, inisial').order('inisial')
  );

  const results = [];
  for (const s of suppliers || []) {
    const r = await repairPbf(s);
    if (r.updated > 0) {
      results.push(r);
      console.log(
        `${r.inisial} (${r.nama}): ${r.updated} baris dikode ulang` +
          (DRY ? ' [dry-run]' : '')
      );
      for (const s0 of r.samples) {
        console.log(
          `  - ${s0.old_kode} → ${s0.new_kode} | ${s0.nama_barang}`
        );
      }
    }
  }

  if (!results.length) {
    console.log('Tidak ada collision yang perlu diperbaiki.');
  } else {
    console.log(
      `Total PBF diperbaiki: ${results.length}, total baris: ${results.reduce((a, r) => a + r.updated, 0)}`
    );
  }

  const global = (suppliers || []).find(
    (s) => String(s.inisial).toLowerCase() === 'global'
  );
  if (global) {
    const v = await verifyGlobalApr30(global.id);
    console.log('Verifikasi batch Global 30 Apr 2026:', v);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
