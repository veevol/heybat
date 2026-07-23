export const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
export const DAY_SHORT = {
  Senin: 'Sen',
  Selasa: 'Sel',
  Rabu: 'Rab',
  Kamis: 'Kam',
  Jumat: 'Jum',
  Sabtu: 'Sab',
  Minggu: 'Min',
};
export const JENIS_PBF_OPTIONS = ['Farma', 'Alkes', 'OTC', 'Herbal', 'Lainnya'];

const AVATAR_COLORS = [
  '#12266E',
  '#3D5A80',
  '#1B6B4A',
  '#6B3A1B',
  '#5A2A6B',
  '#1B5A6B',
  '#6B4A1B',
  '#2A4A6B',
];

export function defaultJadwal(existing = []) {
  const map = new Map((existing || []).map((row) => [row.hari, row]));
  return DAYS.map((hari) => {
    const row = map.get(hari);
    return {
      hari,
      bisa_order: Boolean(row?.bisa_order),
      bisa_kirim: Boolean(row?.bisa_kirim),
      jam_cutoff: row?.jam_cutoff || '',
    };
  });
}

export function hashColor(seed = '') {
  let hash = 0;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function avatarInitials(nama = '') {
  const parts = String(nama).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function digitsOnly(value = '') {
  return String(value).replace(/\D/g, '');
}

export function buildWhatsAppUrl(supplier) {
  const phone = digitsOnly(supplier?.no_wa_sales);
  if (!phone) return null;

  const sales = supplier?.nama_sales?.trim() || 'Sales';
  let greeting = `Halo, ${sales}.`;
  if (supplier?.jenis_kelamin_sales === 'L') greeting = `Halo, Pak ${sales}.`;
  if (supplier?.jenis_kelamin_sales === 'P') greeting = `Halo, Bu ${sales}.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(greeting)}`;
}
