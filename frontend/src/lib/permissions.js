/**
 * Cek izin Menu×Aksi dari profil /api/me.
 * Owner selalu lolos. Selain itu butuh baris di profile.permissions.
 *
 * @param {{ is_owner?: boolean, permissions?: Array<{ menu?: string, aksi?: string }> } | null | undefined} profile
 * @param {string} menuKode
 * @param {string} aksiKode
 * @returns {boolean}
 */
export function hasAccess(profile, menuKode, aksiKode) {
  if (!profile) return false;
  if (profile.is_owner === true) return true;
  if (!menuKode || !aksiKode) return false;
  const list = Array.isArray(profile.permissions) ? profile.permissions : [];
  return list.some(
    (p) => p?.menu === menuKode && p?.aksi === aksiKode
  );
}

/**
 * Boleh melihat menu di nav kalau punya minimal izin 'lihat'.
 * Item tanpa menuKode (mis. Akun) selalu boleh.
 *
 * @param {{ is_owner?: boolean, permissions?: Array<{ menu?: string, aksi?: string }> } | null | undefined} profile
 * @param {string | null | undefined} menuKode
 */
export function canSeeMenu(profile, menuKode) {
  if (!menuKode) return true;
  return hasAccess(profile, menuKode, 'lihat');
}

/**
 * Nama grup akses (non-owner). Owner → null.
 * @param {{ is_owner?: boolean, group?: { nama?: string } | null } | null | undefined} profile
 * @returns {string|null}
 */
export function groupName(profile) {
  if (!profile || profile.is_owner === true) return null;
  const nama = profile.group?.nama;
  return nama ? String(nama).trim() : null;
}

/** Front Office — sembunyikan tagihan di kartu supplier. */
export function isFrontOffice(profile) {
  const nama = groupName(profile);
  return Boolean(nama && nama.toLowerCase() === 'fo');
}
