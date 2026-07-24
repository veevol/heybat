/**
 * In-memory session cache for Matching Verifikasi list.
 * Survives navigation within the SPA session; cleared on full page reload.
 */

/** @type {{ items: Array<object>, katalog: Array<object>, fetchedAt: number } | null} */
let cache = null;

export function getVerifikasiCache() {
  return cache;
}

export function setVerifikasiCache({ items, katalog }) {
  cache = {
    items: items || [],
    katalog: katalog || [],
    fetchedAt: Date.now(),
  };
  return cache;
}

export function updateVerifikasiCacheItems(updater) {
  if (!cache) return null;
  const nextItems =
    typeof updater === 'function' ? updater(cache.items) : updater;
  cache = { ...cache, items: nextItems || [] };
  return cache;
}

export function clearVerifikasiCache() {
  cache = null;
}
