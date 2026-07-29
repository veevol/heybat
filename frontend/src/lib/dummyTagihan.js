/**
 * Dummy tagihan belum lunas — shape siap disambung ke tabel pembelian nanti.
 * @typedef {{
 *   id: string,
 *   tanggal_faktur: string,
 *   nominal: number,
 *   jumlah_invoice: number,
 *   tanggal_jatuh_tempo: string,
 *   status: 'overdue' | 'due_soon' | 'upcoming'
 * }} DummyTagihanRow
 */

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayDiffFromToday(isoDate) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const target = new Date(`${isoDate}T12:00:00`);
  return Math.round((target - today) / 86400000);
}

function statusFromJt(isoJt) {
  const diff = dayDiffFromToday(isoJt);
  if (diff < 0) return 'overdue';
  if (diff <= 3) return 'due_soon';
  return 'upcoming';
}

/** Seeded pseudo-random 0..1 from string */
function seeded(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  const x = Math.sin(Math.abs(h) + 1) * 10000;
  return x - Math.floor(x);
}

/**
 * Generate maksimal 3 baris dummy tagihan per supplier.
 * Jatuh tempo = tanggal_faktur + termin_hari (default 30).
 * @param {{ id: string, termin_hari?: number|null }} supplier
 * @returns {DummyTagihanRow[]}
 */
export function buildDummyTagihan(supplier) {
  const termin =
    Number.isFinite(Number(supplier?.termin_hari)) && Number(supplier.termin_hari) >= 0
      ? Number(supplier.termin_hari)
      : 30;
  const seed = String(supplier?.id || 'x');
  const r = seeded(seed);

  // Variasi: ~1/4 lunas semua, sisanya 1–3 tagihan
  if (r < 0.22) return [];

  const count = r < 0.5 ? 1 : r < 0.78 ? 2 : 3;
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const ri = seeded(`${seed}:${i}`);
    const fakturOffset = -Math.floor(10 + ri * 40) - i * 7;
    const tanggal_faktur = addDays(today.toISOString().slice(0, 10), fakturOffset);
    const tanggal_jatuh_tempo = addDays(tanggal_faktur, termin);
    const nominal = Math.round((2 + ri * 28) * 500_000);
    rows.push({
      id: `${seed}-tagihan-${i}`,
      tanggal_faktur,
      nominal,
      jumlah_invoice: 1 + Math.floor(ri * 2),
      tanggal_jatuh_tempo,
      status: statusFromJt(tanggal_jatuh_tempo),
    });
  }

  rows.sort((a, b) =>
    String(a.tanggal_jatuh_tempo).localeCompare(String(b.tanggal_jatuh_tempo))
  );
  return rows.slice(0, 3);
}

export function formatTanggalId(iso) {
  if (!iso) return '—';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(iso);
  }
}

export function formatRupiahPlain(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return 'Rp —';
  return `Rp. ${num.toLocaleString('id-ID')}`;
}

/** Label sisa hari relatif JT, mis. "H-10", "Hari Ini", "H+15" */
export function formatSisaHari(isoJt) {
  const diff = dayDiffFromToday(isoJt);
  if (diff === 0) return 'Hari Ini';
  if (diff < 0) return `H${diff}`;
  return `H+${diff}`;
}

/** Label JT + jarak relatif, mis. "JT: 12 Jul [H-30]" / "JT: Hari Ini" */
export function formatJtLabel(isoJt) {
  const diff = dayDiffFromToday(isoJt);
  if (diff === 0) return 'JT: Hari Ini';
  const tgl = formatTanggalId(isoJt);
  if (diff < 0) return `JT: ${tgl} [H${diff}]`;
  return `JT: ${tgl} [H+${diff}]`;
}

export function jtTextClass(status) {
  if (status === 'overdue') return 'text-state-error';
  if (status === 'due_soon') return 'text-accent-yellow';
  return 'text-text-secondary';
}
