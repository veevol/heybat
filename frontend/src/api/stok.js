import { apiUrl } from './baseUrl';
import { apiFetch, apiJson, parseResponse } from './client';

export async function listStokTerkini() {
  return apiJson(apiUrl('/api/stok'));
}

export async function parseStokPreview(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(apiUrl('/api/stok/parse-preview'), {
    method: 'POST',
    body: form,
  });
  return parseResponse(res);
}

export async function confirmStokUpload(sessionId) {
  return apiJson(apiUrl('/api/stok/confirm'), {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export async function refreshStokPreviewInfo(sessionId) {
  return apiJson(
    apiUrl(`/api/stok/sessions/${encodeURIComponent(sessionId)}/info`)
  );
}

export async function tandaiStokPreview(sessionId, payload) {
  return apiJson(
    apiUrl(`/api/stok/sessions/${encodeURIComponent(sessionId)}/tandai`),
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function listStokBatchesByKode(kodeObat) {
  return apiJson(
    apiUrl(`/api/stok/obat/${encodeURIComponent(kodeObat)}/batches`)
  );
}

export async function listStokPenandaan({ status = 'terbuka', jenis_tindakan } = {}) {
  const qs = new URLSearchParams({ status });
  if (jenis_tindakan) qs.set('jenis_tindakan', jenis_tindakan);
  return apiJson(apiUrl(`/api/stok/penandaan?${qs.toString()}`));
}

export async function createStokPenandaan(payload) {
  return apiJson(apiUrl('/api/stok/penandaan'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateStokPenandaan(id, payload) {
  return apiJson(apiUrl(`/api/stok/penandaan/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function selesaiStokPenandaan(id) {
  return apiJson(
    apiUrl(`/api/stok/penandaan/${encodeURIComponent(id)}/selesai`),
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  );
}

export async function listStokUploadBatches() {
  return apiJson(apiUrl('/api/stok/upload-batches'));
}

export async function deleteStokUploadBatch(id) {
  return apiJson(apiUrl(`/api/stok/upload-batches/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
}

export async function getStokRingkasPreview() {
  return apiJson(apiUrl('/api/stok/ringkas-preview'));
}

export async function runStokRingkasLama() {
  return apiJson(apiUrl('/api/stok/ringkas-lama'), {
    method: 'POST',
    body: JSON.stringify({}),
  });
}
