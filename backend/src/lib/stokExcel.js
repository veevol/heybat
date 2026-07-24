const XLSX = require('xlsx');
const { repairVmedisXlsx } = require('./xlsxRepair');
const {
  coerceAngka,
  coerceTanggal,
  normalizeText,
  READ_ERROR,
} = require('./penjualanExcel');

const HEADER_SKIP_ROWS = 2; // 2 baris judul non-data, lalu header kolom
const SAMPLE_LIMIT = 10;
const EXPIRED_SOON_DAYS = 90;

const COLUMN_ALIASES = {
  gudang: ['gudang'],
  kode_obat: ['kode obat', 'kodeobat', 'kode'],
  nama_obat: ['nama obat', 'namaobat', 'nama barang', 'nama'],
  stok_qty: [
    'stok satuan terkecil',
    'stok',
    'qty',
    'jumlah',
    'stok qty',
  ],
  satuan: ['satuan terkecil', 'satuan', 'sat'],
  harga_1: ['harga 1', 'harga1'],
  harga_2: ['harga 2', 'harga2'],
  harga_3: ['harga 3', 'harga3'],
  golongan_vmedis: ['golongan'],
  kategori_vmedis: ['kategori'],
  lokasi: ['lokasi'],
  no_batch: ['no. batch', 'no batch', 'batch'],
  tanggal_expired: [
    'tanggal expired',
    'tgl expired',
    'expired',
    'ed',
    'tanggal ed',
  ],
  status: ['status'],
};

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isDashEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'number') return false;
  if (value instanceof Date) return Number.isNaN(value.getTime());
  const trimmed = String(value).trim();
  return trimmed === '' || trimmed === '-';
}

function buildColumnMap(headerCells) {
  const map = {};
  const normalized = headerCells.map(normalizeHeader);
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    let idx = -1;
    for (const alias of aliases) {
      idx = normalized.findIndex((h) => h === alias);
      if (idx >= 0) break;
    }
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

function cellAt(row, colMap, field) {
  const idx = colMap[field];
  if (idx === undefined || idx < 0) return null;
  return row[idx];
}

/** "- Cereton" / "-Cereton" → "Cereton"; asli tetap disimpan terpisah */
function cleanNamaObat(raw) {
  const asli = normalizeText(raw);
  if (!asli) return { nama_obat: null, nama_obat_asli: null };
  const cleaned = asli.replace(/^\s*-\s*/, '').trim() || null;
  return { nama_obat: cleaned, nama_obat_asli: asli };
}

function isTotalFooterRow(row) {
  const first = row?.[0];
  if (isDashEmpty(first)) return false;
  return /total/i.test(String(first).trim());
}

function readStokRows(buffer) {
  const { buffer: repaired, repaired: didRepair, replacements } =
    repairVmedisXlsx(buffer);

  let workbook;
  try {
    workbook = XLSX.read(repaired, {
      type: 'buffer',
      cellDates: true,
    });
  } catch (err) {
    console.error('[stokExcel] XLSX.read gagal:', err?.message || err);
    throw new Error(READ_ERROR);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(READ_ERROR);

  let rows;
  try {
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
      blankrows: true,
    });
  } catch (err) {
    console.error('[stokExcel] sheet_to_json gagal:', err?.message || err);
    throw new Error(READ_ERROR);
  }

  return {
    rows: rows || [],
    sheetName,
    repaired: didRepair,
    style_replacements: replacements,
  };
}

/**
 * Parse Excel stok Vmedis (repair → sheet → items).
 * @param {Buffer} buffer
 * @param {{ knownKodeSet?: Set<string> }} [opts]
 */
function parseStokExcel(buffer, opts = {}) {
  const knownKodeSet = opts.knownKodeSet || null;
  const { rows: allRows, repaired, style_replacements } = readStokRows(buffer);

  if (!allRows.length || allRows.length <= HEADER_SKIP_ROWS) {
    throw new Error(
      'File Excel terlalu pendek — butuh 2 baris judul + 1 baris header kolom + data'
    );
  }

  const headerRow = allRows[HEADER_SKIP_ROWS] || [];
  const colMap = buildColumnMap(headerRow);

  const required = ['kode_obat', 'stok_qty'];
  const missing = required.filter((f) => colMap[f] === undefined);
  if (missing.length) {
    throw new Error(
      `Header kolom tidak dikenali. Wajib ada: Kode Obat, Stok Satuan Terkecil. Hilang: ${missing.join(', ')}`
    );
  }

  const dataRows = allRows.slice(HEADER_SKIP_ROWS + 1);
  const items = [];
  const warnings = [];
  let barisSkip = 0;
  let barisFooter = 0;
  let barisKosong = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];
    const rowNum = HEADER_SKIP_ROWS + 2 + i;

    if (isTotalFooterRow(row)) {
      barisFooter += 1;
      barisSkip += 1;
      continue;
    }

    const kodeObat = normalizeText(cellAt(row, colMap, 'kode_obat'));
    const { nama_obat, nama_obat_asli } = cleanNamaObat(
      cellAt(row, colMap, 'nama_obat')
    );

    if (!kodeObat && !nama_obat_asli) {
      const any = row.some((c) => !isDashEmpty(c));
      if (!any) {
        barisKosong += 1;
        barisSkip += 1;
        continue;
      }
    }

    if (!kodeObat) {
      barisSkip += 1;
      warnings.push({
        baris: rowNum,
        jenis: 'kode_kosong',
        pesan: 'Kode Obat kosong — baris di-skip',
      });
      continue;
    }

    const stokQty = coerceAngka(cellAt(row, colMap, 'stok_qty'));
    const harga1 = coerceAngka(cellAt(row, colMap, 'harga_1'));
    const harga2 = coerceAngka(cellAt(row, colMap, 'harga_2'));
    const harga3 = coerceAngka(cellAt(row, colMap, 'harga_3'));
    const tanggalExpired = coerceTanggal(cellAt(row, colMap, 'tanggal_expired'));

    items.push({
      kode_obat: kodeObat,
      gudang: normalizeText(cellAt(row, colMap, 'gudang')) || 'Retail',
      nama_obat,
      nama_obat_asli,
      no_batch: normalizeText(cellAt(row, colMap, 'no_batch')),
      tanggal_expired: tanggalExpired,
      stok_qty: stokQty,
      satuan: normalizeText(cellAt(row, colMap, 'satuan')),
      harga_1: harga1,
      harga_2: harga2,
      harga_3: harga3,
      golongan_vmedis: normalizeText(cellAt(row, colMap, 'golongan_vmedis')),
      kategori_vmedis: normalizeText(cellAt(row, colMap, 'kategori_vmedis')),
      lokasi: normalizeText(cellAt(row, colMap, 'lokasi')),
      status: normalizeText(cellAt(row, colMap, 'status')),
      _baris_sumber: rowNum,
    });
  }

  return {
    items,
    headers: headerRow.map((h) => String(h ?? '').trim()),
    column_map: colMap,
    total_baris_file: dataRows.length,
    total_baris_valid: items.length,
    baris_skip: barisSkip,
    baris_kosong: barisKosong,
    baris_footer: barisFooter,
    repaired,
    style_replacements,
    info: buildStokWarningInfo(items, knownKodeSet),
    warnings: {
      list: warnings.slice(0, 50),
      total: warnings.length,
    },
    sample: items.slice(0, SAMPLE_LIMIT).map(({ _baris_sumber, ...rest }) => rest),
  };
}

/**
 * Bangun detail warning dari items (bisa dipanggil ulang setelah kode ditambah ke obat_yelo).
 * @param {Array} items
 * @param {Set<string>|null} knownKodeSet
 * @param {{ pendingPenandaan?: Array<{ item_index: number }> }} [opts]
 */
function buildStokWarningInfo(items, knownKodeSet, opts = {}) {
  const pendingSet = new Set(
    (opts.pendingPenandaan || [])
      .map((p) => p.item_index)
      .filter((i) => Number.isInteger(i) && i >= 0)
  );
  const now = Date.now();
  const soonMs = EXPIRED_SOON_DAYS * 24 * 60 * 60 * 1000;
  const kode_tidak_dikenal = [];
  const sudah_lewat_expired = [];
  const mendekati_expired = [];

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const baris = it._baris_sumber;
    const ditandai = pendingSet.has(idx);

    if (knownKodeSet && !knownKodeSet.has(it.kode_obat)) {
      kode_tidak_dikenal.push({
        item_index: idx,
        baris,
        kode_obat: it.kode_obat,
        nama_obat: it.nama_obat,
        gudang: it.gudang || 'Retail',
        stok_qty: it.stok_qty,
      });
    }

    if (!it.tanggal_expired) continue;
    const expMs = new Date(it.tanggal_expired).getTime();
    if (Number.isNaN(expMs)) continue;

    const row = {
      item_index: idx,
      baris,
      kode_obat: it.kode_obat,
      nama_obat: it.nama_obat,
      no_batch: it.no_batch,
      tanggal_expired: it.tanggal_expired,
      stok_qty: it.stok_qty,
      gudang: it.gudang || 'Retail',
      ditandai_preview: ditandai,
    };

    if (expMs < now) sudah_lewat_expired.push(row);
    else if (expMs - now <= soonMs) mendekati_expired.push(row);
  }

  return {
    kode_tidak_dikenal,
    sudah_lewat_expired,
    mendekati_expired,
    jumlah_kode_tidak_dikenal: kode_tidak_dikenal.length,
    jumlah_sudah_lewat_expired: sudah_lewat_expired.length,
    jumlah_mendekati_expired: mendekati_expired.length,
    // alias lama (kompatibilitas singkat)
    jumlah_expired_lewat: sudah_lewat_expired.length,
    jumlah_expired_segera: mendekati_expired.length,
  };
}

module.exports = {
  parseStokExcel,
  buildStokWarningInfo,
  cleanNamaObat,
  HEADER_SKIP_ROWS,
  SAMPLE_LIMIT,
  EXPIRED_SOON_DAYS,
};
