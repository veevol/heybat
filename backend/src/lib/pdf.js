const { tryParseNumeric: _unusedExcelParse } = require('./excel');

const Y_TOLERANCE = 5;
const SAMPLE_ROWS = 12;

let PDFExtractClass = null;

function normalizeFormatAngka(value) {
  const raw = String(value || 'id').trim().toLowerCase();
  return raw === 'intl' ? 'intl' : 'id';
}

/**
 * Parse numeric text from PDF according to per-PBF format_angka.
 * - id: strip all `.` and `,` (both treated as thousand separators) → integer-like number
 * - intl: remove `,` thousands, keep `.` as decimal → float
 */
function parsePdfNumeric(value, formatAngka = 'id') {
  const raw = value === undefined || value === null ? '' : String(value).trim();
  if (!raw) return { value: null, empty: true, invalid: false };

  let cleaned = raw
    .replace(/Rp\.?/gi, '')
    .replace(/\s/g, '');

  const format = normalizeFormatAngka(formatAngka);

  if (format === 'intl') {
    // "13,800.50" → "13800.50"
    cleaned = cleaned.replace(/,/g, '');
  } else {
    // id: "13.800" / "13,800" / "5.404" → strip both separators
    cleaned = cleaned.replace(/[.,]/g, '');
  }

  cleaned = cleaned.replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return { value: null, empty: false, invalid: true };
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num)) {
    return { value: null, empty: false, invalid: true };
  }
  return { value: num, empty: false, invalid: false };
}

async function getPDFExtract() {
  if (!PDFExtractClass) {
    const mod = await import('pdf.js-extract');
    PDFExtractClass = mod.PDFExtract;
  }
  return new PDFExtractClass();
}

/**
 * Extract PDF buffer → compact pages (text items with x/y only).
 */
async function extractPdfPages(buffer) {
  const pdfExtract = await getPDFExtract();
  const data = await pdfExtract.extractBuffer(buffer, {
    normalizeWhitespace: true,
  });

  const pages = (data.pages || []).map((page) => ({
    pageNum: page.info?.num ?? null,
    width: page.info?.width ?? null,
    height: page.info?.height ?? null,
    content: (page.content || [])
      .filter((item) => String(item.str || '').trim() !== '')
      .map((item) => ({
        str: String(item.str),
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        width: Number(item.width) || 0,
        height: Number(item.height) || 0,
      })),
  }));

  return {
    numPages: data.info?.numPages ?? pages.length,
    pages,
  };
}

/**
 * Group page content into lines by y proximity (same idea as PDFExtract.utils.pageToLines).
 */
function pageToLines(page, maxDiff = Y_TOLERANCE) {
  const items = [...(page.content || [])].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  const lines = [];
  for (const item of items) {
    const last = lines[lines.length - 1];
    if (!last) {
      lines.push([item]);
      continue;
    }
    const refY = last.reduce((sum, t) => sum + t.y, 0) / last.length;
    if (Math.abs(item.y - refY) <= maxDiff) {
      last.push(item);
      last.sort((a, b) => a.x - b.x);
    } else {
      lines.push([item]);
    }
  }
  return lines;
}

function allLinesFromPages(pages, maxDiff = Y_TOLERANCE) {
  const rows = [];
  let rowIndex = 0;
  for (const page of pages || []) {
    const lines = pageToLines(page, maxDiff);
    for (const line of lines) {
      rowIndex += 1;
      const y = line.reduce((sum, t) => sum + t.y, 0) / line.length;
      rows.push({
        __row: rowIndex,
        page: page.pageNum,
        y,
        tokens: line.map((t, i) => ({
          id: `${rowIndex}-${i}`,
          str: t.str,
          x: t.x,
          y: t.y,
          width: t.width,
          height: t.height,
        })),
      });
    }
  }
  return rows;
}

function buildMappingPreviewRows(pages, options = {}) {
  const limitRaw = Number(options.limit);
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(100, Math.floor(limitRaw))
      : SAMPLE_ROWS;
  const offset = Math.max(0, Math.floor(Number(options.offset) || 0));
  const all = allLinesFromPages(pages);
  const rows = all.slice(offset, offset + limit);
  return {
    rows,
    total: all.length,
    offset,
    limit,
    has_more: offset + rows.length < all.length,
  };
}

function midX(token) {
  return token.x + (Number(token.width) || 0) / 2;
}

function fieldForX(x, kolomPosisi) {
  if (!kolomPosisi || typeof kolomPosisi !== 'object') return null;
  for (const key of ['nama', 'qty', 'harga', 'satuan']) {
    const range = kolomPosisi[key];
    if (!range) continue;
    const min = Number(range.x_min);
    const max = Number(range.x_max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
    if (x >= min && x <= max) return key;
  }
  return null;
}

function joinTokens(tokens) {
  return tokens
    .map((t) => String(t.str || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Qty from PDF: check SBS stock symbols before numeric parse.
 * ** → 50, * → 5, empty+valid row (nama+harga) → 999; all with estimasi=true.
 */
function parsePdfQty(qtyRaw, { formatAngka, hasNama, hasHarga, hasQtyRange }) {
  if (!hasQtyRange) {
    return { value: null, empty: true, invalid: false, estimasi: false };
  }

  const trimmed = String(qtyRaw ?? '').trim();

  if (trimmed === '**') {
    return { value: 50, empty: false, invalid: false, estimasi: true };
  }
  if (trimmed === '*') {
    return { value: 5, empty: false, invalid: false, estimasi: true };
  }
  // Blank qty on an otherwise valid data row (nama + harga) → stok >100
  if (!trimmed && hasNama && hasHarga) {
    return { value: 999, empty: false, invalid: false, estimasi: true };
  }

  const parsed = parsePdfNumeric(trimmed, formatAngka);
  return { ...parsed, estimasi: false };
}

/**
 * Apply x-range mapping to extracted pages → items + warnings (same shape as Excel extract).
 * Baris yang hanya berisi teks di area Nama (tanpa Qty/Harga/Satuan) digabung ke nama baris sebelumnya
 * (antisipasi wrap nama obat 2 baris di PDF).
 */
function extractMappedPdfRows(pages, kolomPosisi, options = {}) {
  if (!kolomPosisi?.nama) {
    throw new Error('kolom_posisi.nama (x_min/x_max) wajib diisi');
  }

  const barisMulai = Math.max(1, Number(options.baris_mulai_data) || 1);
  const formatAngka = normalizeFormatAngka(options.format_angka);
  const rows = allLinesFromPages(pages);
  const items = [];
  let namaKosong = 0;
  let hargaInvalid = 0;
  let qtyKosongAtauInvalid = 0;
  let scannedRows = 0;
  let barisDigabung = 0;
  let qtyEstimasi = 0;

  // Butuh minimal 1 kolom sekunder supaya "kosong di Qty/Harga/Satuan" punya arti
  const hasSecondaryColumns = Boolean(
    kolomPosisi.qty || kolomPosisi.harga || kolomPosisi.satuan
  );

  for (const row of rows) {
    if (row.__row < barisMulai) continue;

    const buckets = { nama: [], qty: [], harga: [], satuan: [], other: [] };
    for (const token of row.tokens) {
      const field = fieldForX(midX(token), kolomPosisi);
      if (field && buckets[field]) {
        buckets[field].push(token);
      } else if (token.str?.trim()) {
        buckets.other.push(token);
      }
    }

    const nama = joinTokens(buckets.nama);
    const satuan = joinTokens(buckets.satuan) || null;
    const qtyRaw = joinTokens(buckets.qty);
    const hargaRaw = joinTokens(buckets.harga);
    const otherText = joinTokens(buckets.other);

    // Skip fully empty visual lines
    if (!nama && !qtyRaw && !hargaRaw && !satuan && !otherText) continue;

    scannedRows += 1;

    const isContinuation =
      hasSecondaryColumns &&
      items.length > 0 &&
      Boolean(nama) &&
      !qtyRaw &&
      !hargaRaw &&
      !satuan;

    if (isContinuation) {
      const prev = items[items.length - 1];
      prev.nama_barang = `${prev.nama_barang} ${nama}`.replace(/\s+/g, ' ').trim();
      if (otherText) {
        prev.catatan_kondisi = prev.catatan_kondisi
          ? `${prev.catatan_kondisi} | ${otherText}`
          : otherText;
      }
      prev.__flags = {
        ...prev.__flags,
        nama_digabung: true,
        baris_lanjutan_count: (prev.__flags?.baris_lanjutan_count || 0) + 1,
      };
      if (!Array.isArray(prev.__lanjutan_rows)) prev.__lanjutan_rows = [];
      prev.__lanjutan_rows.push(row.__row);
      barisDigabung += 1;
      continue;
    }

    if (!nama) {
      namaKosong += 1;
      continue;
    }

    const hasQtyRange = Boolean(kolomPosisi.qty);
    const hasHargaRange = Boolean(kolomPosisi.harga);

    const hargaParsed = hasHargaRange
      ? parsePdfNumeric(hargaRaw, formatAngka)
      : { value: null, empty: true, invalid: false };

    const qtyParsed = parsePdfQty(qtyRaw, {
      formatAngka,
      hasNama: Boolean(nama),
      hasHarga: Boolean(hargaRaw) || hargaParsed.value != null,
      hasQtyRange,
    });

    if (hasQtyRange && (qtyParsed.empty || qtyParsed.invalid)) {
      qtyKosongAtauInvalid += 1;
    }
    if (hasHargaRange && hargaParsed.invalid) {
      hargaInvalid += 1;
    }
    if (qtyParsed.estimasi) {
      qtyEstimasi += 1;
    }

    items.push({
      nama_barang: nama,
      satuan,
      qty: qtyParsed.value,
      qty_estimasi: Boolean(qtyParsed.estimasi),
      harga_dasar: hargaParsed.value,
      catatan_kondisi: otherText || null,
      __row: row.__row,
      __page: row.page,
      __lanjutan_rows: [],
      __flags: {
        qty_empty: hasQtyRange && qtyParsed.empty,
        qty_invalid: hasQtyRange && qtyParsed.invalid,
        harga_invalid: hasHargaRange && hargaParsed.invalid,
        nama_digabung: false,
        baris_lanjutan_count: 0,
        qty_estimasi: Boolean(qtyParsed.estimasi),
      },
    });
  }

  const warnings = {
    total_baris_terdeteksi: scannedRows,
    nama_kosong: namaKosong,
    harga_invalid: hargaInvalid,
    qty_kosong_atau_invalid: qtyKosongAtauInvalid,
    baris_digabung: barisDigabung,
    qty_estimasi: qtyEstimasi,
    ada_peringatan:
      namaKosong > 0 ||
      hargaInvalid > 0 ||
      qtyKosongAtauInvalid > 0 ||
      barisDigabung > 0,
  };

  return { items, warnings };
}

function normalizeKolomPosisi(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const key of ['nama', 'qty', 'harga', 'satuan']) {
    const range = raw[key];
    if (!range) continue;
    const xMin = Number(range.x_min);
    const xMax = Number(range.x_max);
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
      throw new Error(`kolom_posisi.${key} harus punya x_min dan x_max numerik`);
    }
    if (xMax < xMin) {
      throw new Error(`kolom_posisi.${key}: x_max harus ≥ x_min`);
    }
    out[key] = { x_min: xMin, x_max: xMax };
  }
  if (!out.nama) {
    throw new Error('kolom_posisi.nama wajib diisi');
  }
  return out;
}

function sampleFromItems(items, limit = 10) {
  return items.slice(0, limit).map((item) => ({
    nama_barang: item.nama_barang,
    satuan: item.satuan,
    qty: item.qty,
    qty_estimasi: Boolean(item.qty_estimasi),
    harga_dasar: item.harga_dasar,
    diskon: item.diskon || null,
    catatan_kondisi: item.catatan_kondisi,
    __row: item.__row,
    __lanjutan_rows: item.__lanjutan_rows || [],
    __flags: item.__flags,
  }));
}

module.exports = {
  Y_TOLERANCE,
  extractPdfPages,
  pageToLines,
  allLinesFromPages,
  buildMappingPreviewRows,
  SAMPLE_ROWS,
  extractMappedPdfRows,
  normalizeKolomPosisi,
  normalizeFormatAngka,
  parsePdfNumeric,
  parsePdfQty,
  sampleFromItems,
};
