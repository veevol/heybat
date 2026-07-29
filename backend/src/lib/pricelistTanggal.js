const { pageToLines } = require('./pdf');

const ID_MONTHS = {
  januari: 1,
  jan: 1,
  februari: 2,
  feb: 2,
  maret: 3,
  mar: 3,
  april: 4,
  apr: 4,
  mei: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  agustus: 8,
  agu: 8,
  agt: 8,
  agust: 8,
  september: 9,
  sep: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  desember: 12,
  des: 12,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** @returns {string|null} YYYY-MM-DD */
function toIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  const fullY = y < 100 ? 2000 + y : y;
  if (fullY < 2000 || fullY > 2100) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(fullY, m - 1, d));
  if (
    dt.getUTCFullYear() !== fullY ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return `${fullY}-${pad2(m)}-${pad2(d)}`;
}

function parseNumericDate(text) {
  const raw = String(text || '');
  // 22/06/2026 or 22-06-2026 or 22.06.2026
  const m = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (!m) return null;
  return toIsoDate(m[3], m[2], m[1]);
}

function parseIndonesianDate(text) {
  const raw = String(text || '');
  // TGL 27 JULI 2026 / 27 Juli 2026
  const m = raw.match(
    /(?:tgl\.?\s*)?(\d{1,2})\s+([a-zA-Z]+)\s+(\d{2,4})/i
  );
  if (!m) return null;
  const month = ID_MONTHS[String(m[2]).toLowerCase()];
  if (!month) return null;
  return toIsoDate(m[3], month, m[1]);
}

function rowToText(row) {
  if (Array.isArray(row)) {
    return row.map((c) => String(c ?? '').trim()).filter(Boolean).join(' ');
  }
  if (row && typeof row === 'object') {
    return Object.values(row)
      .map((c) => String(c ?? '').trim())
      .filter(Boolean)
      .join(' ');
  }
  return String(row || '').trim();
}

function normalizeInisial(inisial) {
  return String(inisial || '')
    .trim()
    .toLowerCase();
}

/**
 * Global: baris terakhir di bawah tabel — "DIBUAT OLEH : ... (22/06/2026 08:20:58)"
 * Cari dari bawah ke atas, utamakan baris yang mengandung DIBUAT / tanggal numerik.
 */
function extractGlobalFromExcelRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const text = rowToText(list[i]);
    if (!text) continue;
    if (/dibuat\s*oleh/i.test(text) || /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(text)) {
      const d = parseNumericDate(text);
      if (d) return d;
    }
  }
  return null;
}

/** Global PDF: halaman terakhir, baris terakhir (teks). */
function extractGlobalFromPdfPages(pages) {
  const list = Array.isArray(pages) ? pages : [];
  if (!list.length) return null;
  const lastPage = list[list.length - 1];
  const lines = pageToLines(lastPage)
    .map((line) =>
      line
        .map((it) => String(it.str || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim()
    )
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const text = lines[i];
    if (/dibuat\s*oleh/i.test(text) || /\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}/.test(text)) {
      const d = parseNumericDate(text);
      if (d) return d;
    }
  }
  return null;
}

/**
 * SBS stok harian: halaman pertama — "TGL 27 JULI 2026"
 * SBS harga bulanan: "BERLAKU 1 JULI 2026 s/d 31 JULI 2026" → tanggal mulai
 */
function extractSbsFromPdfPages(pages) {
  const list = Array.isArray(pages) ? pages : [];
  if (!list.length) return null;
  const lines = pageToLines(list[0])
    .map((line) =>
      line
        .map((it) => String(it.str || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim()
    )
    .filter(Boolean);

  for (const text of lines.slice(0, 10)) {
    const berlaku = text.match(
      /berlaku\s+(\d{1,2})\s+([a-zA-Z]+)\s+(\d{2,4})\s*s\/?d/i
    );
    if (berlaku) {
      const month = ID_MONTHS[String(berlaku[2]).toLowerCase()];
      if (month) {
        const d = toIsoDate(berlaku[3], month, berlaku[1]);
        if (d) return d;
      }
    }
  }

  // Baris ke-2 (index 1) stok harian; fallback scan beberapa baris atas
  const candidates = [];
  if (lines[1]) candidates.push(lines[1]);
  candidates.push(...lines.slice(0, 6));
  for (const text of candidates) {
    const d = parseIndonesianDate(text);
    if (d) return d;
  }
  return null;
}

function extractSbsFromExcelRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  // Analog: baris ke-2 file
  const candidates = [];
  if (list[1]) candidates.push(rowToText(list[1]));
  for (let i = 0; i < Math.min(6, list.length); i += 1) {
    candidates.push(rowToText(list[i]));
  }
  for (const text of candidates) {
    const d = parseIndonesianDate(text) || parseNumericDate(text);
    if (d) return d;
  }
  return null;
}

/**
 * Ambil tanggal dokumen pricelist (bukan tanggal upload).
 * @returns {string|null} YYYY-MM-DD
 */
function extractTanggalPricelist({ inisial, excelRows = null, pdfPages = null } = {}) {
  const key = normalizeInisial(inisial);
  if (key === 'global') {
    if (excelRows) return extractGlobalFromExcelRows(excelRows);
    if (pdfPages) return extractGlobalFromPdfPages(pdfPages);
    return null;
  }
  if (key === 'sbs') {
    if (pdfPages) return extractSbsFromPdfPages(pdfPages);
    if (excelRows) return extractSbsFromExcelRows(excelRows);
    return null;
  }
  // Fallback generik: coba pola umum
  if (pdfPages) {
    return extractSbsFromPdfPages(pdfPages) || extractGlobalFromPdfPages(pdfPages);
  }
  if (excelRows) {
    return extractGlobalFromExcelRows(excelRows) || extractSbsFromExcelRows(excelRows);
  }
  return null;
}

module.exports = {
  extractTanggalPricelist,
  parseNumericDate,
  parseIndonesianDate,
  toIsoDate,
};
