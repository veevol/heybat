const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const JENIS_PBF_OPTIONS = ['Farma', 'Alkes', 'OTC', 'Herbal', 'Lainnya'];
const GENDER_OPTIONS = ['L', 'P'];

const SELECT_WITH_JADWAL = `
  id,
  nama,
  inisial,
  no_telp_pbf,
  nama_sales,
  no_wa_sales,
  jenis_kelamin_sales,
  logo_url,
  jenis_pbf,
  alamat,
  created_at,
  updated_at,
  jadwal:supplier_jadwal (
    id,
    hari,
    bisa_order,
    bisa_kirim,
    jam_cutoff
  )
`.replace(/\s+/g, ' ').trim();

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeGender(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (!GENDER_OPTIONS.includes(text)) return undefined;
  return text;
}

function normalizeJenisPbf(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  const cleaned = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  if (cleaned.some((item) => !JENIS_PBF_OPTIONS.includes(item))) return undefined;
  return cleaned;
}

function sortJadwal(jadwal = []) {
  return [...jadwal].sort(
    (a, b) => DAYS.indexOf(a.hari) - DAYS.indexOf(b.hari)
  );
}

function withSortedJadwal(row) {
  if (!row) return row;
  return {
    ...row,
    jadwal: sortJadwal(row.jadwal || []),
  };
}

function normalizeJadwalPayload(raw) {
  if (!Array.isArray(raw) || raw.length !== 7) {
    return { error: 'Jadwal harus berisi tepat 7 hari' };
  }

  const byDay = new Map();
  for (const item of raw) {
    const hari = normalizeText(item?.hari);
    if (!hari || !DAYS.includes(hari)) {
      return { error: `Hari tidak valid: ${item?.hari ?? ''}` };
    }
    if (byDay.has(hari)) {
      return { error: `Hari duplikat: ${hari}` };
    }
    byDay.set(hari, {
      hari,
      bisa_order: Boolean(item?.bisa_order),
      bisa_kirim: Boolean(item?.bisa_kirim),
      jam_cutoff: normalizeText(item?.jam_cutoff),
    });
  }

  if (byDay.size !== 7 || DAYS.some((day) => !byDay.has(day))) {
    return { error: 'Jadwal harus mencakup Senin–Minggu tanpa duplikat' };
  }

  return { data: DAYS.map((day) => byDay.get(day)) };
}

function defaultJadwal() {
  return DAYS.map((hari) => ({
    hari,
    bisa_order: false,
    bisa_kirim: false,
    jam_cutoff: null,
  }));
}

module.exports = {
  DAYS,
  JENIS_PBF_OPTIONS,
  SELECT_WITH_JADWAL,
  normalizeText,
  normalizeGender,
  normalizeJenisPbf,
  withSortedJadwal,
  normalizeJadwalPayload,
  defaultJadwal,
};
