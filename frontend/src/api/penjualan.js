import { apiUrl } from './baseUrl';
import { apiFetch, apiJson, parseResponse } from './client';

/** Tahap 1: parse Excel → preview + session (belum simpan DB) */
export async function parsePenjualanPreview(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(apiUrl('/api/penjualan/parse-preview'), {
    method: 'POST',
    body: form,
  });
  return parseResponse(res);
}

/** Tahap 2: konfirmasi simpan dari session preview */
export async function confirmPenjualanUpload(sessionId) {
  return apiJson(apiUrl('/api/penjualan/confirm'), {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function getPenjualanRingkasan() {
  return apiJson(apiUrl('/api/penjualan/ringkasan'));
}

export async function listPenjualanPerluCek({ limit = 200, offset = 0 } = {}) {
  const q = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return apiJson(apiUrl(`/api/penjualan/perlu-cek?${q}`));
}

export async function updateKategoriPenjualan(id, kategoriPelanggan) {
  return apiJson(apiUrl(`/api/penjualan/${encodeURIComponent(id)}/kategori`), {
    method: 'PATCH',
    body: JSON.stringify({ kategori_pelanggan: kategoriPelanggan }),
  });
}

export async function listPenjualanUploadBatches() {
  return apiJson(apiUrl('/api/penjualan/upload-batches'));
}

export async function deletePenjualanUploadBatch(id) {
  return apiJson(apiUrl(`/api/penjualan/upload-batches/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}
