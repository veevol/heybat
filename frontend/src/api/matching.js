import { apiUrl } from './baseUrl';
import { apiJson } from './client';

const API_BASE = apiUrl('/api/matching');

export async function getKatalogObat() {
  return apiJson(`${API_BASE}/katalog-obat`);
}

/**
 * @param {string} pbfId
 * @param {{ limit?: number, offset?: number }} [opts]
 */
export async function getKandidatMatching(pbfId, { limit = 80, offset = 0 } = {}) {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return apiJson(
    `${API_BASE}/kandidat/${encodeURIComponent(pbfId)}?${qs.toString()}`
  );
}

export async function refreshKandidat(pbfId) {
  return apiJson(`${API_BASE}/refresh-kandidat/${encodeURIComponent(pbfId)}`, {
    method: 'POST',
  });
}

export async function getRefreshKandidatStatus(pbfId) {
  return apiJson(
    `${API_BASE}/refresh-kandidat/${encodeURIComponent(pbfId)}/status`
  );
}

export async function markTidakCocok(payload) {
  return apiJson(`${API_BASE}/tidak-cocok`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createMatching(payload) {
  return apiJson(API_BASE, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listMenungguVerifikasi() {
  return apiJson(`${API_BASE}/menunggu-verifikasi`);
}

/**
 * @param {string} id
 * @param {'setuju' | 'tolak'} keputusan
 */
export async function verifikasiMatching(id, keputusan) {
  return apiJson(`${API_BASE}/${encodeURIComponent(id)}/verifikasi`, {
    method: 'PUT',
    body: JSON.stringify({ keputusan }),
  });
}

export async function updateMatching(id, payload) {
  return apiJson(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function listMatchingByObat(kodeObatYelo) {
  return apiJson(`${API_BASE}/obat/${encodeURIComponent(kodeObatYelo)}`);
}

/**
 * Map kode_obat_yelo -> [{ id, nama, inisial }] untuk matching aktif.
 */
export async function getSupplierMapAktif() {
  return apiJson(`${API_BASE}/supplier-map-aktif`);
}

/**
 * Owner-only: sync supplier matching untuk satu obat.
 * @param {string} kodeObatYelo
 * @param {{ add?: Array<{ pricelist_pbf_id: string, pricelist_kode_pbf: string }>, remove_pbf_ids?: string[] }} payload
 */
export async function syncObatSuppliers(kodeObatYelo, payload) {
  return apiJson(
    `${API_BASE}/obat/${encodeURIComponent(kodeObatYelo)}/suppliers`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
}

/**
 * @param {{ pbf_id?: string }} [params]
 */
export async function listUnmatched({ pbf_id } = {}) {
  const qs = new URLSearchParams();
  if (pbf_id) qs.set('pbf_id', pbf_id);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiJson(`${API_BASE}/unmatched${suffix}`);
}
