import { apiUrl } from './baseUrl';

const API_BASE = apiUrl('/api/ref');

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error || 'Terjadi kesalahan';
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

/** @param {'kandungan'|'golongan'|'satuan'|'grup-substitusi'} jenis */
export async function listRef(jenis) {
  const res = await fetch(`${API_BASE}/${jenis}`);
  return parseResponse(res);
}

/** @param {'kandungan'|'golongan'|'satuan'|'grup-substitusi'} jenis */
export async function createRef(jenis, nama) {
  const res = await fetch(`${API_BASE}/${jenis}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nama }),
  });
  return parseResponse(res);
}
