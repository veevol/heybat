/** Golongan yang ditandai warning (sensitif). */
const SENSITIVE_GOLONGAN = new Set([
  'prekursor',
  'psikotropika',
  'oot',
]);

/** Inisial pill golongan di kartu list. */
const GOLONGAN_INISIAL = {
  psikotropika: 'PSI',
  prekursor: 'PRE',
  oot: 'OOT',
  ssa: 'SSA',
  regular: 'REG',
  alkes: 'ALK',
};

/** Urutan manual filter Golongan; sisanya alfabet di akhir. */
export const GOLONGAN_FILTER_ORDER = [
  'Psikotropika',
  'Prekursor',
  'OOT',
  'SSA',
  'Regular',
  'Alkes',
];

export function isSensitiveGolongan(nama) {
  if (!nama) return false;
  return SENSITIVE_GOLONGAN.has(String(nama).trim().toLowerCase());
}

export function golonganInisial(nama) {
  if (!nama) return null;
  const key = String(nama).trim().toLowerCase();
  return GOLONGAN_INISIAL[key] || String(nama).trim().slice(0, 3).toUpperCase();
}

export function golonganBadgeClass(nama) {
  if (isSensitiveGolongan(nama)) {
    return 'bg-[#2e2d34] text-accent-yellow';
  }
  return 'bg-[#2e2d34] text-text-secondary';
}

/**
 * Title Case per kata (termasuk isi dalam tanda kurung).
 * "VITAMIN B COMPLEX (MEF)" → "Vitamin B Complex (Mef)"
 */
export function toTitleCaseNamaObat(raw) {
  if (!raw) return '';
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
}

/** Format tanggal dibuat untuk laporan, e.g. "24 Jul 2026, 14:30". */
export function formatTanggalDibuat(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

/** Urutkan opsi golongan: fixed order dulu, sisanya alfabet. */
export function sortGolonganFilterOptions(names) {
  const unique = [...new Set((names || []).filter(Boolean))];
  const byLower = new Map(unique.map((n) => [String(n).toLowerCase(), n]));
  const fixed = [];
  for (const g of GOLONGAN_FILTER_ORDER) {
    const found = byLower.get(g.toLowerCase());
    if (found) {
      fixed.push(found);
      byLower.delete(g.toLowerCase());
    }
  }
  const rest = [...byLower.values()].sort((a, b) =>
    String(a).localeCompare(String(b), 'id')
  );
  return [...fixed, ...rest];
}

/**
 * Sudah di Vmedis: asal_input=vmedis ATAU sudah_ditambah_vmedis=true
 * Belum di Vmedis: asal_input=app DAN sudah_ditambah_vmedis=false
 */
export function isSudahDiVmedis(obat) {
  if (!obat) return true;
  if (obat.asal_input === 'app') {
    return Boolean(obat.sudah_ditambah_vmedis);
  }
  return true;
}

export function isBelumDiVmedis(obat) {
  return obat?.asal_input === 'app' && !obat?.sudah_ditambah_vmedis;
}

/** Key sort untuk kode obat APP{YYMMDD}{XXXX}; non-APP fallback string. */
export function kodeObatSortKey(kode) {
  const s = String(kode || '');
  const m = s.match(/^APP(\d{6})(\d{1,4})$/i);
  if (m) {
    return {
      kind: 0,
      date: m[1],
      seq: parseInt(m[2], 10) || 0,
      raw: s.toLowerCase(),
    };
  }
  return { kind: 1, date: '', seq: 0, raw: s.toLowerCase() };
}

export function compareKodeObat(a, b, direction = 'asc') {
  const ka = kodeObatSortKey(a);
  const kb = kodeObatSortKey(b);
  let cmp = 0;
  if (ka.kind !== kb.kind) cmp = ka.kind - kb.kind;
  else if (ka.kind === 0) {
    cmp = ka.date.localeCompare(kb.date) || ka.seq - kb.seq;
  } else {
    cmp = ka.raw.localeCompare(kb.raw, 'id');
  }
  return direction === 'asc' ? cmp : -cmp;
}

export function formatNumberId(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num);
}

export function formatRupiahId(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return `Rp ${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(num)}`;
}

/**
 * Ringkasan singkat untuk kartu list, mis. "124 Tab · Rp 6.666".
 * Null kalau kode_obat belum punya data stok sama sekali di snapshot terkini.
 */
export function formatStokRingkasSingkat(stokRingkasan) {
  if (
    !stokRingkasan ||
    stokRingkasan.stok_total === null ||
    stokRingkasan.stok_total === undefined
  ) {
    return null;
  }
  const qty = formatNumberId(stokRingkasan.stok_total) ?? '0';
  const satuan = stokRingkasan.satuan ? ` ${stokRingkasan.satuan}` : '';
  const harga = formatRupiahId(stokRingkasan.harga_1);
  return harga ? `${qty}${satuan} · ${harga}` : `${qty}${satuan}`;
}

/** Format gabungan konversi + satuan: "2 Stp/Box". */
export function formatSatuanGabung(obat) {
  if (!obat) return null;
  const sat1 =
    obat.satuan_1?.nama ||
    obat.satuan_1_nama ||
    (typeof obat.satuan_1 === 'string' ? obat.satuan_1 : null);
  const sat2 =
    obat.satuan_2?.nama ||
    obat.satuan_2_nama ||
    (typeof obat.satuan_2 === 'string' ? obat.satuan_2 : null);
  const konv = obat.konversi;
  const konvStr =
    konv !== null && konv !== undefined && konv !== ''
      ? Number.isFinite(Number(konv))
        ? String(Number(konv))
        : String(konv)
      : null;

  if (konvStr && sat1 && sat2) return `${konvStr} ${sat1}/${sat2}`;
  if (konvStr && sat1) return `${konvStr} ${sat1}`;
  if (konvStr && sat2) return `${konvStr} ${sat2}`;
  if (sat1 && sat2) return `${sat1}/${sat2}`;
  if (sat1) return sat1;
  if (sat2) return sat2;
  if (konvStr) return konvStr;
  return null;
}

function satuan1Nama(obat, fallback = null) {
  return (
    obat?.satuan_1?.nama ||
    obat?.satuan_1_nama ||
    (typeof obat?.satuan_1 === 'string' ? obat.satuan_1 : null) ||
    fallback ||
    null
  );
}

function satuan2Nama(obat) {
  return (
    obat?.satuan_2?.nama ||
    obat?.satuan_2_nama ||
    (typeof obat?.satuan_2 === 'string' ? obat.satuan_2 : null) ||
    null
  );
}

/** Bisa pecah ke 2 tingkat satuan (konversi > 1, satuan_2 ada, dan beda dari satuan_1). */
export function canPecahSatuan(obat) {
  const konv = Number(obat?.konversi);
  if (!Number.isFinite(konv) || konv <= 1) return false;
  const sat2 = satuan2Nama(obat);
  if (!sat2) return false;
  const sat1 = satuan1Nama(obat);
  if (
    sat1 &&
    String(sat1).trim().toLowerCase() === String(sat2).trim().toLowerCase()
  ) {
    return false;
  }
  return true;
}

/**
 * Stok pecahan 2 satuan, mis. "9 Box · 50 Tab".
 * Tanpa konversi/satuan_2: "{qty} {satuan_1}".
 */
export function formatStokPecahan(stokTotal, obat, fallbackSatuan = null) {
  if (stokTotal === null || stokTotal === undefined || stokTotal === '') {
    return null;
  }
  const total = Number(stokTotal);
  if (!Number.isFinite(total)) return null;

  const sat1 = satuan1Nama(obat, fallbackSatuan);
  if (canPecahSatuan(obat)) {
    const konv = Number(obat.konversi);
    const box = Math.floor(total / konv);
    const sisa = total % konv;
    const sat2 = satuan2Nama(obat);
    const left = `${formatNumberId(box) ?? box} ${sat2}`;
    const right = `${formatNumberId(sisa) ?? sisa}${sat1 ? ` ${sat1}` : ''}`;
    return `${left} · ${right}`;
  }

  const qty = formatNumberId(total) ?? String(total);
  return sat1 ? `${qty} ${sat1}` : qty;
}

/**
 * Harga pecahan: "Rp X /Box · Rp Y /Tab" atau hanya "/Tab".
 * @param {number|null|undefined} hargaSatuan1
 * @param {object} obat
 * @param {string|null} [fallbackSatuan]
 */
export function formatHargaPecahan(hargaSatuan1, obat, fallbackSatuan = null) {
  const harga = formatRupiahId(hargaSatuan1);
  if (!harga) return null;

  const sat1 = satuan1Nama(obat, fallbackSatuan);
  if (canPecahSatuan(obat)) {
    const konv = Number(obat.konversi);
    const perBox = Number(hargaSatuan1) * konv;
    const hargaBox = formatRupiahId(perBox);
    const sat2 = satuan2Nama(obat);
    const left = hargaBox ? `${hargaBox} /${sat2}` : null;
    const right = sat1 ? `${harga} /${sat1}` : harga;
    return left ? `${left} · ${right}` : right;
  }

  return sat1 ? `${harga} /${sat1}` : harga;
}

/**
 * Baris stok + HJ1 untuk kartu list.
 * Stok pakai koma ("9 Box, 50 Tab"), harga tanpa "·".
 * Null kalau stok_total belum ada.
 * @returns {{ stok: string, harga: string | null } | null}
 */
export function formatStokHargaKartu(stokRingkasan, obat) {
  if (
    !stokRingkasan ||
    stokRingkasan.stok_total === null ||
    stokRingkasan.stok_total === undefined
  ) {
    return null;
  }
  const stokRaw = formatStokPecahan(
    stokRingkasan.stok_total,
    obat,
    stokRingkasan.satuan
  );
  if (!stokRaw) return null;
  const hargaRaw = formatHargaPecahan(
    stokRingkasan.harga_1,
    obat,
    stokRingkasan.satuan
  );
  return {
    stok: stokRaw.replace(/ · /g, ', '),
    harga: hargaRaw ? hargaRaw.replace(/ · /g, ' ') : null,
  };
}

