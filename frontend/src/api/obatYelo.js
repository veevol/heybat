import { apiUrl } from './baseUrl';
import { apiJson } from './client';

const API_BASE = apiUrl('/api/obat-yelo');

/**
 * @param {{ page?: number, limit?: number, search?: string, all?: boolean }} params
 */
export async function listObatYelo({
  page = 1,
  limit = 50,
  search = '',
  all = false,
} = {}) {
  const qs = new URLSearchParams();
  if (all) {
    qs.set('all', '1');
  } else {
    qs.set('page', String(page));
    qs.set('limit', String(limit));
  }
  if (search?.trim()) qs.set('search', search.trim());
  return apiJson(`${API_BASE}?${qs.toString()}`);
}

export async function getObatYelo(kodeObat) {
  return apiJson(`${API_BASE}/${encodeURIComponent(kodeObat)}`);
}

export async function createObatYelo(payload) {
  return apiJson(API_BASE, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateObatYelo(kodeObat, payload) {
  return apiJson(`${API_BASE}/${encodeURIComponent(kodeObat)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteObatYelo(kodeObat) {
  return apiJson(`${API_BASE}/${encodeURIComponent(kodeObat)}`, {
    method: 'DELETE',
  });
}

/** Prefill kode APP{YYMMDD}{XXXX}. */
export async function getNextKodeApp() {
  return apiJson(`${API_BASE}/next-kode-app`);
}

/**
 * Buat obat (asal_input=app) + matching menunggu_verifikasi.
 * @param {object} payload
 */
export async function createObatDariMatching(payload) {
  return apiJson(`${API_BASE}/dari-matching`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * @param {string} kodeObat
 * @param {boolean} sudahDitambahVmedis
 */
export async function updateStatusVmedis(kodeObat, sudahDitambahVmedis) {
  return apiJson(
    `${API_BASE}/${encodeURIComponent(kodeObat)}/status-vmedis`,
    {
      method: 'PUT',
      body: JSON.stringify({ sudah_ditambah_vmedis: sudahDitambahVmedis }),
    }
  );
}
