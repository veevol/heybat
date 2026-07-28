const { supabase } = require('../db');

const DEFAULT_PENGATURAN = {
  nama_apotek: 'Apotek Yelo',
  inisial: 'YEL',
  alamat: null,
  kota: null,
  no_sia: null,
  nama_apj: null,
  no_sipa: null,
  telp_apotek: null,
  email_apotek: null,
};

/**
 * Ambil baris config identitas apotek (single-row config).
 * Fallback ke default minimal kalau tabel kosong, supaya generate SP tidak
 * gagal keras hanya karena pengaturan belum diisi.
 * @returns {Promise<typeof DEFAULT_PENGATURAN>}
 */
async function getPengaturanApotek() {
  const { data, error } = await supabase
    .from('pengaturan_apotek')
    .select(
      'nama_apotek, inisial, alamat, kota, no_sia, nama_apj, no_sipa, telp_apotek, email_apotek'
    )
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || DEFAULT_PENGATURAN;
}

module.exports = { getPengaturanApotek };
