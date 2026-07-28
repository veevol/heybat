const { supabase } = require('../db');
const { getPengaturanApotek } = require('./pengaturanApotek');

/** Tanggal hari ini (kalender Asia/Jakarta) sebagai 'YYYY-MM-DD'. */
function todayDateStringJakarta() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${map.year}-${map.month}-${map.day}`;
}

async function getInisialApotek() {
  const pengaturan = await getPengaturanApotek();
  return pengaturan.inisial || 'YEL';
}

/**
 * Generate 1 nomor SP baru: SP[inisial][YYMMDD][XXX].
 * XXX = counter urut global lintas golongan/kategori/PBF, reset tiap hari,
 * di-increment atomik lewat fungsi DB next_nomor_sp_urut (aman dari race
 * condition kalau beberapa dokumen digenerate bersamaan/sekaligus).
 * @returns {Promise<string>}
 */
async function generateNomorSp() {
  const tanggalIso = todayDateStringJakarta();
  const [inisial, rpcResult] = await Promise.all([
    getInisialApotek(),
    supabase.rpc('next_nomor_sp_urut', { p_tanggal: tanggalIso }),
  ]);
  if (rpcResult.error) throw rpcResult.error;

  const yymmdd = tanggalIso.slice(2).replace(/-/g, '');
  const urut = String(rpcResult.data).padStart(3, '0');
  return `SP${inisial}${yymmdd}${urut}`;
}

module.exports = { generateNomorSp, todayDateStringJakarta };
