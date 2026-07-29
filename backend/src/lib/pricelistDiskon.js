/**
 * Parse skema diskon pricelist SBS dan hitung harga netto efektif.
 *
 * Contoh teks: N | 2 | 7.5 | 7.5 / 4+1 | 30 / (2+1,5+4) | 5 / 10+2
 *
 * Aturan:
 * - Ada % → default pakai diskon %
 * - Ada bonus N+M dan qty_order ≥ N → bandingkan dengan % (jika ada), pilih termurah
 * - Tanpa skema / N → harga dasar
 */

function normalizeDiskonRaw(raw) {
  if (raw == null) return '';
  return String(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d),(\d+)(?!\+)/g, '$1.$2');
}

/**
 * @returns {{
 *   raw: string|null,
 *   percent: number|null,
 *   bonuses: Array<{ n: number, m: number }>,
 * }}
 */
function parseDiskonSchemes(diskonRaw) {
  const raw = normalizeDiskonRaw(diskonRaw);
  if (!raw || /^n$/i.test(raw) || raw === '*' || /^\*\s*n$/i.test(raw)) {
    return { raw: raw || null, percent: null, bonuses: [] };
  }

  // Strip leading "* " (qty tipis marker)
  const text = raw.replace(/^\*\s*/, '');

  const bonuses = [];
  const bonusRe = /(\d+)\s*\+\s*(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = bonusRe.exec(text))) {
    const n = Number(m[1]);
    const free = Number(m[2]);
    if (Number.isFinite(n) && n > 0 && Number.isFinite(free) && free > 0) {
      bonuses.push({ n, m: free });
    }
  }

  let percent = null;
  const beforeSlash = text.split('/')[0].trim();
  if (/^\d+(\.\d+)?$/.test(beforeSlash)) {
    percent = Number(beforeSlash);
  } else if (!bonuses.length && /^\d+(\.\d+)?$/.test(text)) {
    percent = Number(text);
  }

  if (percent != null && (!Number.isFinite(percent) || percent < 0)) {
    percent = null;
  }

  return {
    raw: text || null,
    percent,
    bonuses,
  };
}

function formatPercentLabel(percent) {
  const n = Number(percent);
  if (!Number.isFinite(n)) return String(percent);
  return Number.isInteger(n) ? String(n) : String(n);
}

/**
 * Hitung harga netto + skema yang dipakai.
 * @param {{ harga_dasar: *, diskon?: *, qty_order?: * }} input
 * @returns {{
 *   harga_dasar: number|null,
 *   harga_net: number|null,
 *   diskon: string|null,
 *   skema_dipakai: 'none'|'percent'|'bonus',
 *   keterangan: string|null,
 *   percent: number|null,
 *   bonus: { n: number, m: number }|null,
 * }}
 */
function resolveHargaNet({ harga_dasar, diskon, qty_order } = {}) {
  const harga = Number(harga_dasar);
  const parsed = parseDiskonSchemes(diskon);
  const qty =
    qty_order === null || qty_order === undefined || qty_order === ''
      ? null
      : Number(qty_order);
  const qtyOk = qty != null && Number.isFinite(qty) && qty > 0;

  if (!Number.isFinite(harga) || harga <= 0) {
    return {
      harga_dasar: Number.isFinite(harga) ? harga : null,
      harga_net: null,
      diskon: parsed.raw,
      skema_dipakai: 'none',
      keterangan: null,
      percent: parsed.percent,
      bonus: null,
    };
  }

  /** @type {Array<{ harga_net: number, skema: string, keterangan: string|null, percent: number|null, bonus: * }>} */
  const options = [];

  if (parsed.percent != null) {
    options.push({
      harga_net: harga * (1 - parsed.percent / 100),
      skema: 'percent',
      keterangan: `Disc ${formatPercentLabel(parsed.percent)}%`,
      percent: parsed.percent,
      bonus: null,
    });
  }

  if (qtyOk) {
    for (const b of parsed.bonuses) {
      if (qty >= b.n) {
        options.push({
          harga_net: harga * (b.n / (b.n + b.m)),
          skema: 'bonus',
          keterangan: `Skema ${b.n}+${b.m}`,
          percent: parsed.percent,
          bonus: b,
        });
      }
    }
  }

  if (!options.length) {
    return {
      harga_dasar: harga,
      harga_net: harga,
      diskon: parsed.raw,
      skema_dipakai: 'none',
      keterangan: null,
      percent: null,
      bonus: null,
    };
  }

  options.sort((a, b) => a.harga_net - b.harga_net);
  const best = options[0];
  return {
    harga_dasar: harga,
    harga_net: Number(best.harga_net.toFixed(4)),
    diskon: parsed.raw,
    skema_dipakai: best.skema,
    keterangan: best.keterangan,
    percent: best.percent,
    bonus: best.bonus,
  };
}

module.exports = {
  normalizeDiskonRaw,
  parseDiskonSchemes,
  resolveHargaNet,
  formatPercentLabel,
};
