import { apiUrl } from './baseUrl';
import { apiJson } from './client';

const API_BASE = apiUrl('/api/suppliers');

export async function listSuppliers() {
  return apiJson(API_BASE);
}

export async function createSupplier(payload) {
  return apiJson(API_BASE, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSupplier(id, payload) {
  return apiJson(`${API_BASE}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function updateSupplierJadwal(id, jadwal) {
  return apiJson(`${API_BASE}/${id}/jadwal`, {
    method: 'PUT',
    body: JSON.stringify({ jadwal }),
  });
}

export async function deleteSupplier(id) {
  return apiJson(`${API_BASE}/${id}`, { method: 'DELETE' });
}
