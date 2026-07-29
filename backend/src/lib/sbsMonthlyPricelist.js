/**
 * SBS monthly pricelist PDF ("DAFTAR HARGA BARANG" / dual tables per page).
 * Layout: left + right — Nama | Unit | HNA+PPN | [*] | DISC
 * Kolom bintang tanpa header: "* = Qty Barang < 10" (legend).
 * DISC: N | 2 | 7.5 / 4+1 | 30 / (2+1,5+4)
 */

const { allLinesFromPages, parsePdfNumeric } = require('./pdf');

/** Split between left DISC and right Nama (page width 612). */
const MID_X = 310;

/** Qty estimasi dari legend "* = Qty Barang < 10" — sama konvensi stok harian. */
const QTY_BINTANG = 5;

const LEFT = {
  nama: { x_min: 70, x_max: 190 },
  satuan: { x_min: 190, x_max: 214 },
  harga: { x_min: 214, x_max: 262 },
  qty: { x_min: 262, x_max: 280 },
  disc: { x_min: 280, x_max: 310 },
};

const RIGHT = {
  nama: { x_min: 310, x_max: 441 },
  satuan: { x_min: 441, x_max: 465 },
  harga: { x_min: 465, x_max: 513 },
  qty: { x_min: 513, x_max: 525 },
  disc: { x_min: 525, x_max: 612 },
};

const SKIP_LINE =
  /daftar\s+harga|berlaku\s+|nama\s+barang|pt\s+sehat|jl\.|nb\s*:|qty\s+barang|^xz$/i;

function isSbsMonthlyPricelistPdf(pages) {
  const list = Array.isArray(pages) ? pages : [];
  if (!list.length) return false;
  const head = allLinesFromPages(list.slice(0, 1))
    .slice(0, 12)
    .map((row) => row.tokens.map((t) => t.str).join(' '))
    .join('\n');
  return /daftar\s+harga\s+barang/i.test(head) && /\bdisc\b/i.test(head);
}

function normalizeDiskonText(raw) {
  const s = String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  // 7,5 → 7.5; jangan ubah skema bonus "2+1,5+4"
  return s.replace(/(\d),(\d+)(?!\+)/g, '$1.$2');
}

function joinTokens(tokens) {
  return tokens
    .map((t) => String(t.str || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function midX(token) {
  return (Number(token.x) || 0) + (Number(token.width) || 0) / 2;
}

function bucketTokens(tokens, ranges) {
  const buckets = {
    nama: [],
    satuan: [],
    harga: [],
    qty: [],
    disc: [],
    other: [],
  };
  for (const t of tokens || []) {
    const x = midX(t);
    let placed = false;
    for (const key of ['nama', 'satuan', 'harga', 'qty', 'disc']) {
      const r = ranges[key];
      if (!r) continue;
      if (x >= r.x_min && x < r.x_max) {
        buckets[key].push(t);
        placed = true;
        break;
      }
    }
    if (!placed && String(t.str || '').trim()) buckets.other.push(t);
  }
  return buckets;
}

function parseSide(tokens, ranges, formatAngka) {
  if (!tokens?.length) return null;
  const b = bucketTokens(tokens, ranges);
  const nama = joinTokens(b.nama);
  if (!nama || SKIP_LINE.test(nama)) return null;

  const hargaRaw = joinTokens(b.harga);
  const hargaParsed = parsePdfNumeric(hargaRaw, formatAngka);
  if (hargaParsed.invalid || hargaParsed.value == null) return null;

  const satuan = joinTokens(b.satuan) || null;

  // Qty: kolom bintang tanpa header (antara HNA+PPN dan DISC)
  const qtyTokens = [...b.qty].sort((a, c) => a.x - c.x);
  const qtyStrs = qtyTokens
    .map((t) => String(t.str || '').trim())
    .filter(Boolean);
  let qtyTipis = qtyStrs.some((t) => t === '*' || t === '**');

  const discTokens = [...b.disc, ...b.other].sort((a, c) => a.x - c.x);
  const discStrs = discTokens
    .map((t) => String(t.str || '').trim())
    .filter(Boolean);
  const discParts = [];
  for (const t of discStrs) {
    if (t === '*' || t === '**') {
      qtyTipis = true;
      continue;
    }
    discParts.push(t);
  }
  const diskon = normalizeDiskonText(discParts.join(' '));

  return {
    nama_barang: nama,
    satuan: satuan ? satuan.toUpperCase() : null,
    harga_dasar: hargaParsed.value,
    diskon,
    qty_tipis: qtyTipis,
    qty: qtyTipis ? QTY_BINTANG : null,
    qty_estimasi: qtyTipis,
  };
}

function extractSbsMonthlyPricelist(pages, options = {}) {
  const formatAngka = options.format_angka === 'intl' ? 'intl' : 'id';
  const rows = allLinesFromPages(pages);
  const items = [];
  let skipped = 0;
  let sidesEmpty = 0;
  let qtyEstimasi = 0;

  for (const row of rows) {
    const joined = joinTokens(row.tokens);
    if (!joined || SKIP_LINE.test(joined)) {
      skipped += 1;
      continue;
    }

    const leftTokens = row.tokens.filter((t) => midX(t) < MID_X);
    const rightTokens = row.tokens.filter((t) => midX(t) >= MID_X);

    for (const [sideTokens, ranges] of [
      [leftTokens, LEFT],
      [rightTokens, RIGHT],
    ]) {
      const parsed = parseSide(sideTokens, ranges, formatAngka);
      if (!parsed) {
        if (sideTokens.length) sidesEmpty += 1;
        continue;
      }
      if (parsed.qty_estimasi) qtyEstimasi += 1;

      items.push({
        nama_barang: parsed.nama_barang,
        satuan: parsed.satuan,
        qty: parsed.qty,
        qty_estimasi: Boolean(parsed.qty_estimasi),
        harga_dasar: parsed.harga_dasar,
        diskon: parsed.diskon,
        catatan_kondisi: parsed.diskon || null,
        __row: row.__row,
        __page: row.page,
        __flags: {
          qty_tipis: parsed.qty_tipis,
          qty_estimasi: Boolean(parsed.qty_estimasi),
          jenis_dokumen: 'harga',
        },
      });
    }
  }

  return {
    items,
    warnings: {
      total_baris_terdeteksi: rows.length,
      baris_header_dilewati: skipped,
      sisi_gagal_parse: sidesEmpty,
      qty_estimasi: qtyEstimasi,
      ada_peringatan: sidesEmpty > 0 || qtyEstimasi > 0,
    },
    jenis_dokumen: 'harga',
  };
}

module.exports = {
  MID_X,
  LEFT,
  RIGHT,
  QTY_BINTANG,
  isSbsMonthlyPricelistPdf,
  extractSbsMonthlyPricelist,
  normalizeDiskonText,
};
