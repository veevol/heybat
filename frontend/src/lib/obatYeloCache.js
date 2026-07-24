/**
 * In-memory session cache for Data Obat Yelo list + supplier map.
 */

/** @type {{ items: Array<object>, supplierMap: Record<string, Array<object>>, fetchedAt: number } | null} */
let cache = null;

export function getObatYeloCache() {
  return cache;
}

export function setObatYeloCache({ items, supplierMap }) {
  cache = {
    items: items || [],
    supplierMap: supplierMap || {},
    fetchedAt: Date.now(),
  };
  return cache;
}

export function updateObatYeloCacheItems(updater) {
  if (!cache) return null;
  const nextItems =
    typeof updater === 'function' ? updater(cache.items) : updater;
  cache = { ...cache, items: nextItems || [] };
  return cache;
}

export function updateObatYeloCacheSupplierMap(map) {
  if (!cache) return null;
  cache = { ...cache, supplierMap: map || {} };
  return cache;
}

export function clearObatYeloCache() {
  cache = null;
}
