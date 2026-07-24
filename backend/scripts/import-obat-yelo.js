/**
 * One-time import: CSV → ref_* + obat_yelo
 *
 * Usage (from backend/):
 *   node scripts/import-obat-yelo.js
 *   node scripts/import-obat-yelo.js "D:\path\to\file.csv"
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env
 *
 * Atomicity strategy:
 * 1. Validate entire CSV in memory first (empty/duplicate kode → abort, no DB writes).
 * 2. Insert refs, then obat in batches.
 * 3. On any DB failure after writes started: delete all obat_yelo rows and exit non-zero.
 *    (Intended for first-time import into empty obat_yelo.)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_CSV = path.join(__dirname, '..', 'data', 'obat-yelo-import.csv');
const BATCH_SIZE = 400;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseKey.includes('paste_')) {
  console.error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di backend/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // skip CR (handle CRLF)
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => String(h || '').trim());
  return rows.slice(1).filter((r) => r.some((cell) => String(cell || '').trim() !== '')).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? '';
    });
    return obj;
  });
}

/** Trim; empty → null. Canonical form for first-seen casing is preserved by Map. */
function normalizeNama(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
}

function uniqueKey(nama) {
  return nama.toLowerCase();
}

function parseNumber(raw) {
  const nama = normalizeNama(raw);
  if (nama === null) return null;
  const num = Number(String(nama).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function collectUnique(map, raw) {
  const nama = normalizeNama(raw);
  if (!nama) return;
  const key = uniqueKey(nama);
  if (!map.has(key)) {
    map.set(key, nama);
  }
}

async function insertRefBatch(table, names) {
  if (names.length === 0) return { created: 0, map: new Map() };

  const { data, error } = await supabase
    .from(table)
    .insert(names.map((nama) => ({ nama })))
    .select('id, nama');

  if (error) {
    throw new Error(`Gagal insert ${table}: ${error.message}`);
  }

  const map = new Map();
  for (const row of data ?? []) {
    map.set(uniqueKey(row.nama), row.id);
  }
  return { created: (data ?? []).length, map };
}

async function rollbackObat() {
  console.error('Rollback: menghapus semua baris obat_yelo...');
  const { error } = await supabase.from('obat_yelo').delete().neq('kode_obat', '');
  if (error) {
    console.error('Rollback gagal:', error.message);
  } else {
    console.error('Rollback obat_yelo selesai.');
  }
}

async function main() {
  const csvPath = path.resolve(process.argv[2] || DEFAULT_CSV);
  if (!fs.existsSync(csvPath)) {
    console.error(`File CSV tidak ditemukan: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Membaca: ${csvPath}`);
  const text = fs.readFileSync(csvPath, 'utf8');
  // Strip BOM if present
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  console.log(`Baris data: ${rows.length}`);

  if (rows.length === 0) {
    console.error('CSV kosong — tidak ada yang diimport.');
    process.exit(1);
  }

  const { count: existingCount, error: countError } = await supabase
    .from('obat_yelo')
    .select('kode_obat', { count: 'exact', head: true });

  if (countError) {
    console.error('Gagal cek obat_yelo:', countError.message);
    process.exit(1);
  }
  if ((existingCount ?? 0) > 0) {
    console.error(
      `Abort: obat_yelo sudah berisi ${existingCount} baris. Kosongkan dulu jika ingin re-import.`
    );
    process.exit(1);
  }

  const kodeSeen = new Map();
  const emptyKodes = [];
  const dupKodes = [];

  const kandunganMap = new Map();
  const golonganMap = new Map();
  const satuanMap = new Map();
  const grupMap = new Map();

  const prepared = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const lineNo = i + 2; // header = 1
    const kode = normalizeNama(row['Kode obat']);
    const namaObat = normalizeNama(row['Nama Obat']);

    if (!kode) {
      emptyKodes.push(lineNo);
      continue;
    }
    if (kodeSeen.has(kode)) {
      dupKodes.push({ kode, lines: [kodeSeen.get(kode), lineNo] });
    } else {
      kodeSeen.set(kode, lineNo);
    }

    collectUnique(kandunganMap, row.Kandungan);
    collectUnique(golonganMap, row.Golongan);
    collectUnique(satuanMap, row['Sat 1']);
    collectUnique(satuanMap, row['Sat 2']);
    collectUnique(grupMap, row.Subtitusi);
    // Group, Nama Global, Nama SBS — sengaja diabaikan

    prepared.push({
      lineNo,
      kode_obat: kode,
      nama_obat: namaObat || kode,
      kandungan: normalizeNama(row.Kandungan),
      golongan: normalizeNama(row.Golongan),
      satuan_1: normalizeNama(row['Sat 1']),
      satuan_2: normalizeNama(row['Sat 2']),
      konversi: parseNumber(row.Konv),
      min_jual: parseNumber(row['Min Jual']),
      substitusi: normalizeNama(row.Subtitusi),
    });
  }

  if (emptyKodes.length > 0 || dupKodes.length > 0) {
    console.error('Validasi gagal — tidak ada data yang ditulis ke database.');
    if (emptyKodes.length > 0) {
      console.error(`Kode obat kosong di baris: ${emptyKodes.slice(0, 20).join(', ')}${emptyKodes.length > 20 ? '...' : ''}`);
    }
    if (dupKodes.length > 0) {
      console.error('Kode obat duplikat:');
      dupKodes.slice(0, 20).forEach((d) => {
        console.error(`  ${d.kode} (baris ${d.lines.join(', ')})`);
      });
      if (dupKodes.length > 20) console.error(`  ... dan ${dupKodes.length - 20} lainnya`);
    }
    process.exit(1);
  }

  console.log('Validasi OK. Insert referensi...');
  let wroteAnything = false;

  try {
    const kandunganNames = [...kandunganMap.values()];
    const golonganNames = [...golonganMap.values()];
    const satuanNames = [...satuanMap.values()];
    const grupNames = [...grupMap.values()];

    const kandungan = await insertRefBatch('ref_kandungan', kandunganNames);
    wroteAnything = wroteAnything || kandungan.created > 0;
    const golongan = await insertRefBatch('ref_golongan', golonganNames);
    wroteAnything = wroteAnything || golongan.created > 0;
    const satuan = await insertRefBatch('ref_satuan', satuanNames);
    wroteAnything = wroteAnything || satuan.created > 0;
    const grup = await insertRefBatch('ref_grup_substitusi', grupNames);
    wroteAnything = wroteAnything || grup.created > 0;

    console.log(`  ref_kandungan: ${kandungan.created}`);
    console.log(`  ref_golongan: ${golongan.created}`);
    console.log(`  ref_satuan: ${satuan.created}`);
    console.log(`  ref_grup_substitusi: ${grup.created}`);

    const obatRows = prepared.map((p) => ({
      kode_obat: p.kode_obat,
      nama_obat: p.nama_obat,
      kandungan_id: p.kandungan ? kandungan.map.get(uniqueKey(p.kandungan)) ?? null : null,
      golongan_id: p.golongan ? golongan.map.get(uniqueKey(p.golongan)) ?? null : null,
      satuan_1_id: p.satuan_1 ? satuan.map.get(uniqueKey(p.satuan_1)) ?? null : null,
      satuan_2_id: p.satuan_2 ? satuan.map.get(uniqueKey(p.satuan_2)) ?? null : null,
      grup_substitusi_id: p.substitusi ? grup.map.get(uniqueKey(p.substitusi)) ?? null : null,
      konversi: p.konversi,
      min_jual: p.min_jual,
    }));

    console.log(`Insert ${obatRows.length} obat_yelo...`);
    let inserted = 0;
    for (let i = 0; i < obatRows.length; i += BATCH_SIZE) {
      const batch = obatRows.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('obat_yelo').insert(batch);
      if (error) {
        throw new Error(`Gagal insert obat batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      }
      wroteAnything = true;
      inserted += batch.length;
      console.log(`  ... ${inserted}/${obatRows.length}`);
    }

    console.log('\n=== Import selesai ===');
    console.log(`Obat berhasil diimport : ${inserted}`);
    console.log(`ref_kandungan          : ${kandungan.created}`);
    console.log(`ref_golongan           : ${golongan.created}`);
    console.log(`ref_satuan             : ${satuan.created}`);
    console.log(`ref_grup_substitusi    : ${grup.created}`);
  } catch (err) {
    console.error('\nImport gagal:', err.message || err);
    if (wroteAnything) {
      await rollbackObat();
      console.error(
        'Catatan: baris referensi (ref_*) yang sudah terbuat TIDAK dihapus otomatis (aman / bisa dipakai ulang).'
      );
    }
    process.exit(1);
  }
}

main();
