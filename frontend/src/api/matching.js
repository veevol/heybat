import { apiUrl } from './baseUrl';

const API_BASE = apiUrl('/api/matching');

function actorHeaders(extra = {}) {
  const actor =
    (typeof localStorage !== 'undefined' && localStorage.getItem('heybat-actor')) ||
    'staf';
  return {
    'Content-Type': 'application/json',
    'x-heybat-actor': actor,
    // TODO: ganti dengan flag is_owner dari sistem akses final
    'x-heybat-is-owner':
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('heybat-is-owner')) ||
      '1',
    ...extra,
  };
}

async function parseResponse(res) {
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error || 'Terjadi kesalahan';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function getKatalogObat() {
  const res = await fetch(`${API_BASE}/katalog-obat`);
  return parseResponse(res);
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
  const res = await fetch(
    `${API_BASE}/kandidat/${encodeURIComponent(pbfId)}?${qs.toString()}`
  );
  return parseResponse(res);
}

export async function refreshKandidat(pbfId) {
  const res = await fetch(
    `${API_BASE}/refresh-kandidat/${encodeURIComponent(pbfId)}`,
    {
      method: 'POST',
      headers: actorHeaders(),
    }
  );
  return parseResponse(res);
}

export async function getRefreshKandidatStatus(pbfId) {
  const res = await fetch(
    `${API_BASE}/refresh-kandidat/${encodeURIComponent(pbfId)}/status`
  );
  return parseResponse(res);
}

export async function markTidakCocok(payload) {
  const res = await fetch(`${API_BASE}/tidak-cocok`, {
    method: 'POST',
    headers: actorHeaders(),
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function createMatching(payload) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: actorHeaders(),
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function listMenungguVerifikasi() {
  const res = await fetch(`${API_BASE}/menunggu-verifikasi`);
  return parseResponse(res);
}

/**
 * @param {string} id
 * @param {'setuju' | 'tolak'} keputusan
 */
export async function verifikasiMatching(id, keputusan) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}/verifikasi`, {
    method: 'PUT',
    headers: actorHeaders(),
    body: JSON.stringify({ keputusan }),
  });
  return parseResponse(res);
}

export async function updateMatching(id, payload) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: actorHeaders(),
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function listMatchingByObat(kodeObatYelo) {
  const res = await fetch(
    `${API_BASE}/obat/${encodeURIComponent(kodeObatYelo)}`
  );
  return parseResponse(res);
}

/**
 * @param {{ pbf_id?: string }} [params]
 */
export async function listUnmatched({ pbf_id } = {}) {
  const qs = new URLSearchParams();
  if (pbf_id) qs.set('pbf_id', pbf_id);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE}/unmatched${suffix}`);
  return parseResponse(res);
}
