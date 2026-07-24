/**
 * One-time import: legacy matching from CSV columns "Nama Global" / "Nama SBS"
 * → matching rows status=menunggu_verifikasi (NOT auto-verified).
 *
 * Usage (from backend/):
 *   node scripts/import-matching-lama.js
 *   node scripts/import-matching-lama.js "C:\Users\USER\Downloads\App Heybat - Data Obat Match Subtitusi.csv"
 *   node scripts/import-matching-lama.js --threshold=0.55 "path\to\file.csv"
 *   node scripts/import-matching-lama.js --dry-run
 *
 * Env:
 *   MATCHING_LAMA_THRESHOLD  (default 0.5) — min skor string-similarity
 *   MATCHING_LAMA_DRY_RUN=1  — hitung & laporkan tanpa insert
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');
const { createClient } = require('@supabase/supabase-js');

const DEFAULT_CSV = path.join(
  'C:',
  'Users',
  'USER',
  'Downloads',
  'App Heybat - Data Obat Match Subtitusi.csv'
);
const BATCH_INSERT = 200;
const ACTOR = 'import-matching-lama';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey || supabaseKey.includes('paste_')) {
  console.error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di backend/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseArgs(argv) {
  let threshold = Number(process.env.MATCHING_LAMA_THRESHOLD || 0.5);
  let dryRun =
    String(process.env.MATCHING_LAMA_DRY_RUN || '').toLowerCase() === '1' ||
    String(process.env.MATCHING_LAMA_DRY_RUN || '').toLowerCase() === 'true';
  let csvPath = null;

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg.startsWith('--threshold=')) {
      const n = Number(arg.slice('--threshold='.length));
      if (Number.isFinite(n) && n >= 0 && n <= 1) threshold = n;
      else {
        console.error('threshold harus angka 0–1, contoh --threshold=0.55');
        process.exit(1);
      }
      continue;
    }
    if (!arg.startsWith('-')) {
      csvPath = arg;
    }
  }

  return { threshold, dryRun, csvPath: csvPath || DEFAULT_CSV };
}

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
      // skip CR
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
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => String(cell || '').trim() !== ''))
    .map((r) => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = r[idx] ?? '';
      });
      return obj;
    });
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

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

async function fetchLatestPricelistByPbf(pbfId) {
  const data = await fetchAllRows(() =>
    supabase
      .from('pricelist')
      .select('kode_pbf, nama_barang, tanggal_upload, id')
      .eq('pbf_id', pbfId)
      .order('tanggal_upload', { ascending: false })
      .order('id', { ascending: false })
  );

  const map = new Map();
  for (const row of data) {
    if (!map.has(row.kode_pbf)) map.set(row.kode_pbf, row);
  }
  return [...map.values()];
}

function findBestMatch(namaCsv, pricelistItems) {
  const target = String(namaCsv || '').trim().toLowerCase();
  if (!target || !pricelistItems.length) {
    return { best: null, score: 0 };
  }

  let best = null;
  let bestScore = 0;
  for (const item of pricelistItems) {
    const nama = String(item.nama_barang || '').trim().toLowerCase();
    if (!nama) continue;
    const score = stringSimilarity.compareTwoStrings(target, nama);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return {
    best,
    score: Math.round(bestScore * 1000) / 1000,
  };
}

function existingKey(kodeObat, pbfId, kodePbf) {
  return `${kodeObat}::${pbfId}::${kodePbf}`;
}

async function findSupplierByHint(hint) {
  const needle = hint.toLowerCase();
  const { data, error } = await supabase
    .from('supplier')
    .select('id, nama, inisial')
    .order('nama');
  if (error) throw error;

  const matches = (data || []).filter(
    (s) =>
      String(s.nama || '')
        .toLowerCase()
        .includes(needle) ||
      String(s.inisial || '')
        .toLowerCase()
        .includes(needle)
  );

  if (matches.length === 0) {
    throw new Error(`Supplier mengandung "${hint}" tidak ditemukan`);
  }
  if (matches.length > 1) {
    console.warn(
      `[warn] Lebih dari 1 supplier cocok untuk "${hint}":`,
      matches.map((m) => `${m.inisial} (${m.nama})`).join(', '),
      '— memakai yang pertama.'
    );
  }
  return matches[0];
}

async function processPbfColumn({
  label,
  columnName,
  supplier,
  pricelistItems,
  csvRows,
  existingSet,
  threshold,
  dryRun,
}) {
  const report = {
    label,
    supplier,
    columnName,
    candidatesInCsv: 0,
    inserted: 0,
    skippedLowScore: [],
    skippedAlreadyExists: 0,
    skippedObatMissing: [],
  };

  const toInsert = [];
  const now = new Date().toISOString();

  for (const row of csvRows) {
    const namaCsv = normalizeText(row[columnName]);
    if (!namaCsv) continue;
    report.candidatesInCsv += 1;

    const kodeObat = normalizeText(row['Kode obat'] || row['Kode Obat'] || row.kode_obat);
    if (!kodeObat) {
      report.skippedObatMissing.push({
        nama_dicari: namaCsv,
        alasan: 'kode_obat kosong di CSV',
      });
      continue;
    }

    const { best, score } = findBestMatch(namaCsv, pricelistItems);
    if (!best || score < threshold) {
      report.skippedLowScore.push({
        kode_obat: kodeObat,
        nama_obat_csv: normalizeText(row['Nama Obat']) || null,
        nama_dicari: namaCsv,
        kandidat_terbaik: best
          ? {
              kode_pbf: best.kode_pbf,
              nama_barang: best.nama_barang,
              skor: score,
            }
          : null,
        skor: score,
        threshold,
      });
      continue;
    }

    const key = existingKey(kodeObat, supplier.id, best.kode_pbf);
    if (existingSet.has(key)) {
      report.skippedAlreadyExists += 1;
      continue;
    }

    // Mark as reserved so later rows in same run don't duplicate
    existingSet.add(key);

    toInsert.push({
      kode_obat_yelo: kodeObat,
      pricelist_pbf_id: supplier.id,
      pricelist_kode_pbf: best.kode_pbf,
      status: 'menunggu_verifikasi',
      diusulkan_oleh: ACTOR,
      tanggal_diusulkan: now,
      dipilih_oleh: ACTOR,
      tanggal_dipilih: now,
      _meta: {
        nama_dicari: namaCsv,
        nama_barang: best.nama_barang,
        skor: score,
      },
    });
  }

  if (dryRun) {
    report.inserted = toInsert.length;
    report.dry_run_preview = toInsert.slice(0, 10).map((r) => ({
      kode_obat_yelo: r.kode_obat_yelo,
      pricelist_kode_pbf: r.pricelist_kode_pbf,
      nama_dicari: r._meta.nama_dicari,
      nama_barang: r._meta.nama_barang,
      skor: r._meta.skor,
    }));
    return report;
  }

  for (let i = 0; i < toInsert.length; i += BATCH_INSERT) {
    const chunk = toInsert.slice(i, i + BATCH_INSERT).map(({ _meta, ...row }) => row);
    const { error } = await supabase.from('matching').insert(chunk);
    if (error) {
      throw new Error(`Gagal insert matching ${label} batch ${i}: ${error.message}`);
    }
    report.inserted += chunk.length;
    process.stdout.write(
      `\r  [${label}] insert ${Math.min(i + chunk.length, toInsert.length)}/${toInsert.length}`
    );
  }
  if (toInsert.length) process.stdout.write('\n');

  return report;
}

function printReport(reports, { threshold, dryRun, csvPath }) {
  console.log('\n========== LAPORAN IMPORT MATCHING LAMA ==========');
  console.log(`CSV          : ${csvPath}`);
  console.log(`Threshold    : ${threshold}`);
  console.log(`Mode         : ${dryRun ? 'DRY-RUN (tidak insert)' : 'WRITE'}`);
  console.log(`Status insert: menunggu_verifikasi (belum diverifikasi)\n`);

  let totalInserted = 0;
  let totalLow = 0;
  let totalExists = 0;

  for (const r of reports) {
    totalInserted += r.inserted;
    totalLow += r.skippedLowScore.length;
    totalExists += r.skippedAlreadyExists;

    console.log(`--- ${r.label} (${r.supplier.inisial || r.supplier.nama}) ---`);
    console.log(`  Kolom CSV berisi nama     : ${r.candidatesInCsv}`);
    console.log(`  Berhasil di-match         : ${r.inserted}`);
    console.log(`  Skip (sudah ada matching) : ${r.skippedAlreadyExists}`);
    console.log(`  Skip (skor < ${threshold})     : ${r.skippedLowScore.length}`);
    if (r.skippedObatMissing.length) {
      console.log(`  Skip (kode obat hilang)   : ${r.skippedObatMissing.length}`);
    }
    if (r.dry_run_preview?.length) {
      console.log('  Preview 10 pertama (dry-run):');
      for (const p of r.dry_run_preview) {
        console.log(
          `    ${p.kode_obat_yelo} | "${p.nama_dicari}" → ${p.pricelist_kode_pbf} "${p.nama_barang}" (${p.skor})`
        );
      }
    }
    if (r.skippedLowScore.length) {
      console.log('  Detail skor rendah (untuk cek manual):');
      for (const s of r.skippedLowScore) {
        const best = s.kandidat_terbaik
          ? `${s.kandidat_terbaik.kode_pbf} "${s.kandidat_terbaik.nama_barang}" (${s.kandidat_terbaik.skor})`
          : '(tidak ada kandidat)';
        console.log(
          `    ${s.kode_obat} | cari="${s.nama_dicari}" | terbaik=${best}`
        );
      }
    }
    console.log('');
  }

  console.log('--- TOTAL ---');
  console.log(`  Inserted / akan insert : ${totalInserted}`);
  console.log(`  Skip sudah ada         : ${totalExists}`);
  console.log(`  Skip skor rendah       : ${totalLow}`);
  console.log('==================================================\n');
}

async function main() {
  const { threshold, dryRun, csvPath } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(csvPath)) {
    console.error(`File CSV tidak ditemukan: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Membaca CSV: ${csvPath}`);
  const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const csvRows = parseCsv(text);
  console.log(`Baris data CSV: ${csvRows.length}`);

  const headers = Object.keys(csvRows[0] || {});
  if (!headers.includes('Nama Global') || !headers.includes('Nama SBS')) {
    console.error('CSV harus punya kolom "Nama Global" dan "Nama SBS". Headers:', headers);
    process.exit(1);
  }

  console.log('Memuat supplier Global & SBS…');
  const supplierGlobal = await findSupplierByHint('Global');
  const supplierSbs = await findSupplierByHint('SBS');
  console.log(`  Global → ${supplierGlobal.inisial} | ${supplierGlobal.nama} (${supplierGlobal.id})`);
  console.log(`  SBS    → ${supplierSbs.inisial} | ${supplierSbs.nama} (${supplierSbs.id})`);

  console.log('Memuat pricelist terbaru per kode_pbf…');
  const [plGlobal, plSbs, existingMatching] = await Promise.all([
    fetchLatestPricelistByPbf(supplierGlobal.id),
    fetchLatestPricelistByPbf(supplierSbs.id),
    fetchAllRows(() =>
      supabase
        .from('matching')
        .select('kode_obat_yelo, pricelist_pbf_id, pricelist_kode_pbf')
    ),
  ]);
  console.log(`  Pricelist Global unik: ${plGlobal.length}`);
  console.log(`  Pricelist SBS unik   : ${plSbs.length}`);
  console.log(`  Matching existing    : ${existingMatching.length}`);

  // Verify kode_obat from CSV exist (optional soft check via set of existing obat)
  const obatSet = new Set(
    (
      await fetchAllRows(() =>
        supabase.from('obat_yelo').select('kode_obat')
      )
    ).map((o) => o.kode_obat)
  );
  console.log(`  Obat Yelo di DB      : ${obatSet.size}`);

  const existingSet = new Set(
    existingMatching
      .filter((m) => m.kode_obat_yelo)
      .map((m) =>
        existingKey(m.kode_obat_yelo, m.pricelist_pbf_id, m.pricelist_kode_pbf)
      )
  );

  // Filter: only process rows whose kode exists in obat_yelo; track missing
  const missingObat = [];
  for (const row of csvRows) {
    const kode = normalizeText(row['Kode obat']);
    const hasNama =
      normalizeText(row['Nama Global']) || normalizeText(row['Nama SBS']);
    if (hasNama && kode && !obatSet.has(kode)) {
      missingObat.push(kode);
    }
  }
  if (missingObat.length) {
    console.warn(
      `[warn] ${missingObat.length} kode_obat di CSV (dengan Nama Global/SBS) tidak ada di obat_yelo — akan gagal FK jika di-insert.`
    );
  }

  const reports = [];

  console.log(`\nMemproses Nama Global (threshold=${threshold})…`);
  reports.push(
    await processPbfColumn({
      label: 'Global',
      columnName: 'Nama Global',
      supplier: supplierGlobal,
      pricelistItems: plGlobal,
      csvRows: csvRows.filter((r) => {
        const kode = normalizeText(r['Kode obat']);
        return kode && obatSet.has(kode);
      }),
      existingSet,
      threshold,
      dryRun,
    })
  );

  console.log(`Memproses Nama SBS (threshold=${threshold})…`);
  reports.push(
    await processPbfColumn({
      label: 'SBS',
      columnName: 'Nama SBS',
      supplier: supplierSbs,
      pricelistItems: plSbs,
      csvRows: csvRows.filter((r) => {
        const kode = normalizeText(r['Kode obat']);
        return kode && obatSet.has(kode);
      }),
      existingSet,
      threshold,
      dryRun,
    })
  );

  // Attach missing obat into Global report for visibility
  if (missingObat.length) {
    reports[0].skippedObatMissing.push(
      ...missingObat.map((kode) => ({
        kode_obat: kode,
        alasan: 'tidak ada di obat_yelo',
      }))
    );
  }

  printReport(reports, { threshold, dryRun, csvPath });

  // Write JSON report next to script for manual review
  const reportPath = path.join(
    __dirname,
    `import-matching-lama-report-${Date.now()}.json`
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ threshold, dryRun, csvPath, reports }, null, 2),
    'utf8'
  );
  console.log(`Laporan JSON: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
