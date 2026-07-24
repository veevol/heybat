/** Format badge satuan/konversi obat Yelo, e.g. "100 Tab". */
export function formatSatuanKonversi(obat) {
  if (!obat) return null;
  const sat =
    obat.satuan_1?.nama ||
    obat.satuan_1_nama ||
    (typeof obat.satuan_1 === 'string' ? obat.satuan_1 : null);
  const konv = obat.konversi;
  if (konv != null && konv !== '' && sat) {
    const n = Number(konv);
    return `${Number.isFinite(n) ? n : konv} ${sat}`;
  }
  if (sat) return sat;
  if (konv != null && konv !== '') return String(konv);
  return null;
}

export function formatHarga(n) {
  if (n === null || n === undefined || n === '') return null;
  const num = Number(n);
  if (!Number.isFinite(num)) return null;
  return `Rp ${num.toLocaleString('id-ID')}`;
}

export function formatScorePercent(score) {
  return `${Math.round((score || 0) * 100)}%`;
}

function satuanNama(satuan) {
  if (!satuan) return null;
  if (typeof satuan === 'string') return satuan.trim() || null;
  return satuan.nama ? String(satuan.nama).trim() : null;
}

function formatKonversiValue(konversi) {
  if (konversi === null || konversi === undefined || konversi === '') return null;
  const n = Number(konversi);
  return Number.isFinite(n) ? String(n) : String(konversi);
}

/**
 * Parts for dropdown row: Nama Obat (bold) + konversi + Satuan1 / Satuan2 (normal).
 * @returns {{ nama: string, meta: string | null }}
 */
export function obatDropdownParts(obat) {
  const nama = obat?.nama_obat || '—';
  const konv = formatKonversiValue(obat?.konversi);
  const sat1 = satuanNama(obat?.satuan_1);
  const sat2 = satuanNama(obat?.satuan_2);

  const metaBits = [];
  if (konv) metaBits.push(konv);
  if (sat1 && sat2) metaBits.push(`${sat1}/${sat2}`);
  else if (sat1) metaBits.push(sat1);
  else if (sat2) metaBits.push(sat2);

  return {
    nama,
    meta: metaBits.length ? metaBits.join(' ') : null,
  };
}

/** "oleh: nama, DD MMM YYYY, HH:MM" */
export function formatOlehDipilih(nama, iso) {
  const siapa = nama?.trim() || '—';
  let when = '—';
  if (iso) {
    try {
      when = new Date(iso).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      when = String(iso);
    }
  }
  return `oleh: ${siapa}, ${when}`;
}
