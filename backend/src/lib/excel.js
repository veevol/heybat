const XLSX = require('xlsx');

function cellToString(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('File Excel tidak memiliki sheet');
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });
  return { sheetName, rows };
}

function detectHeaders(rows, barisMulaiData = 2) {
  const preferredIdx = Math.max(0, Number(barisMulaiData || 2) - 2);

  function scoreRow(row) {
    if (!row) return 0;
    return row.filter((c) => cellToString(c) !== '').length;
  }

  let idx = preferredIdx;
  const preferredScore = scoreRow(rows[preferredIdx]);
  if (preferredScore < 2) {
    let bestIdx = -1;
    let bestScore = 0;
    const limit = Math.min(rows.length, 15);
    for (let i = 0; i < limit; i += 1) {
      const score = scoreRow(rows[i]);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    idx = bestIdx >= 0 ? bestIdx : 0;
  }

  if (!rows[idx]) {
    return { headers: [], headerRowIndex: 0, previewRows: [] };
  }

  const headerCells = rows[idx] || [];
  const headers = headerCells.map((cell, i) => {
    const text = cellToString(cell);
    return text || `Kolom_${i + 1}`;
  });

  const seen = new Map();
  const uniqueHeaders = headers.map((name) => {
    const count = seen.get(name) || 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count + 1}`;
  });

  const previewRows = rows.slice(idx, idx + 8).map((row, rowOffset) => {
    const obj = { __row: idx + rowOffset + 1 };
    uniqueHeaders.forEach((header, colIdx) => {
      obj[header] = cellToString(row?.[colIdx]);
    });
    return obj;
  });

  return {
    headers: uniqueHeaders,
    headerRowIndex: idx,
    previewRows,
  };
}

function parseNumeric(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value)
    .replace(/Rp\.?/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, (_match, _offset, full) => (full.includes(',') ? '' : '.'))
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function tryParseNumeric(value) {
  const raw = cellToString(value);
  if (!raw) return { value: null, empty: true, invalid: false };
  const num = parseNumeric(raw);
  if (num === null) return { value: null, empty: false, invalid: true };
  return { value: num, empty: false, invalid: false };
}

function buildCatatanKondisi(rowObj, usedHeaders) {
  const used = new Set(usedHeaders.filter(Boolean));
  const parts = [];
  for (const [key, value] of Object.entries(rowObj)) {
    if (key === '__row') continue;
    if (used.has(key)) continue;
    const text = cellToString(value);
    if (!text) continue;
    parts.push(`${key}: ${text}`);
  }
  return parts.length ? parts.join(' | ') : null;
}

/**
 * Extract data rows + validation stats using mapping.
 */
function extractMappedRows(rows, mapping) {
  const barisMulai = Number(mapping.baris_mulai_data) || 2;
  const { headers, headerRowIndex } = detectHeaders(rows, barisMulai);
  const headerToIndex = new Map(headers.map((h, i) => [h, i]));

  const colBarang = headerToIndex.get(mapping.nama_kolom_barang);
  if (colBarang === undefined) {
    throw new Error(
      `Kolom barang "${mapping.nama_kolom_barang}" tidak ditemukan di file`
    );
  }

  const colQty =
    mapping.nama_kolom_qty != null && mapping.nama_kolom_qty !== ''
      ? headerToIndex.get(mapping.nama_kolom_qty)
      : undefined;
  const colHarga =
    mapping.nama_kolom_harga != null && mapping.nama_kolom_harga !== ''
      ? headerToIndex.get(mapping.nama_kolom_harga)
      : undefined;
  const colSatuan =
    mapping.nama_kolom_satuan != null && mapping.nama_kolom_satuan !== ''
      ? headerToIndex.get(mapping.nama_kolom_satuan)
      : undefined;

  if (mapping.nama_kolom_qty && colQty === undefined) {
    throw new Error(`Kolom qty "${mapping.nama_kolom_qty}" tidak ditemukan di file`);
  }
  if (mapping.nama_kolom_harga && colHarga === undefined) {
    throw new Error(`Kolom harga "${mapping.nama_kolom_harga}" tidak ditemukan di file`);
  }
  if (mapping.nama_kolom_satuan && colSatuan === undefined) {
    throw new Error(
      `Kolom satuan "${mapping.nama_kolom_satuan}" tidak ditemukan di file`
    );
  }

  const dataStartIndex = Math.max(headerRowIndex + 1, barisMulai - 1);
  const usedHeaders = [
    mapping.nama_kolom_barang,
    mapping.nama_kolom_qty,
    mapping.nama_kolom_harga,
    mapping.nama_kolom_satuan,
  ];

  const items = [];
  let namaKosong = 0;
  let hargaInvalid = 0;
  let qtyKosongAtauInvalid = 0;
  let scannedRows = 0;

  for (let i = dataStartIndex; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const rowHasContent = row.some((c) => cellToString(c) !== '');
    if (!rowHasContent) continue;

    scannedRows += 1;
    const nama = cellToString(row[colBarang]);
    if (!nama) {
      namaKosong += 1;
      continue;
    }

    const qtyParsed =
      colQty === undefined
        ? { value: null, empty: true, invalid: false }
        : tryParseNumeric(row[colQty]);
    const hargaParsed =
      colHarga === undefined
        ? { value: null, empty: true, invalid: false }
        : tryParseNumeric(row[colHarga]);

    if (colQty !== undefined && (qtyParsed.empty || qtyParsed.invalid)) {
      qtyKosongAtauInvalid += 1;
    }
    if (colHarga !== undefined && hargaParsed.invalid) {
      hargaInvalid += 1;
    }

    const rowObj = {};
    headers.forEach((header, colIdx) => {
      rowObj[header] = cellToString(row[colIdx]);
    });

    items.push({
      nama_barang: nama,
      satuan: colSatuan === undefined ? null : cellToString(row[colSatuan]) || null,
      qty: qtyParsed.value,
      harga_dasar: hargaParsed.value,
      catatan_kondisi: buildCatatanKondisi(rowObj, usedHeaders),
      __row: i + 1,
      __flags: {
        qty_empty: colQty !== undefined && qtyParsed.empty,
        qty_invalid: colQty !== undefined && qtyParsed.invalid,
        harga_invalid: colHarga !== undefined && hargaParsed.invalid,
      },
    });
  }

  const warnings = {
    total_baris_terdeteksi: scannedRows,
    nama_kosong: namaKosong,
    harga_invalid: hargaInvalid,
    qty_kosong_atau_invalid: qtyKosongAtauInvalid,
    ada_peringatan: namaKosong > 0 || hargaInvalid > 0 || qtyKosongAtauInvalid > 0,
  };

  return { headers, items, warnings };
}

module.exports = {
  parseWorkbook,
  detectHeaders,
  extractMappedRows,
  parseNumeric,
  tryParseNumeric,
  cellToString,
};
