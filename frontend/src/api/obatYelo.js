import { apiUrl } from './baseUrl';

const API_BASE = apiUrl('/api/obat-yelo');

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

/**
 * @param {{ page?: number, limit?: number, search?: string }} params
 */
export async function listObatYelo({ page = 1, limit = 50, search = '' } = {}) {
  const qs = new URLSearchParams();
  qs.set('page', String(page));
  qs.set('limit', String(limit));
  if (search?.trim()) qs.set('search', search.trim());
  const res = await fetch(`${API_BASE}?${qs.toString()}`);
  return parseResponse(res);
}

export async function getObatYelo(kodeObat) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(kodeObat)}`);
  return parseResponse(res);
}

export async function createObatYelo(payload) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function updateObatYelo(kodeObat, payload) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(kodeObat)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function deleteObatYelo(kodeObat) {
  const res = await fetch(`${API_BASE}/${encodeURIComponent(kodeObat)}`, {
    method: 'DELETE',
  });
  return parseResponse(res);
}
