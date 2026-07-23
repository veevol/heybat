const API_BASE = '/api/suppliers';

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

export async function listSuppliers() {
  const res = await fetch(API_BASE);
  return parseResponse(res);
}

export async function createSupplier(payload) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function updateSupplier(id, payload) {
  const res = await fetch(`${API_BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function updateSupplierJadwal(id, jadwal) {
  const res = await fetch(`${API_BASE}/${id}/jadwal`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jadwal }),
  });
  return parseResponse(res);
}

export async function deleteSupplier(id) {
  const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
  return parseResponse(res);
}
