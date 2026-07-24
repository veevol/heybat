import { apiUrl } from './baseUrl';
import { apiJson } from './client';

const API_BASE = apiUrl('/api/ref');

/** @param {'kandungan'|'golongan'|'satuan'|'grup-substitusi'} jenis */
export async function listRef(jenis) {
  return apiJson(`${API_BASE}/${jenis}`);
}

/** @param {'kandungan'|'golongan'|'satuan'|'grup-substitusi'} jenis */
export async function createRef(jenis, nama) {
  return apiJson(`${API_BASE}/${jenis}`, {
    method: 'POST',
    body: JSON.stringify({ nama }),
  });
}
