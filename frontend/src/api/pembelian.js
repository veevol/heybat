import { apiUrl } from './baseUrl';
import { apiFetch, apiJson, parseResponse } from './client';

/** Tahap 1: parse Excel → preview + session (belum simpan DB) */
export async function parsePembelianPreview(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await apiFetch(apiUrl('/api/pembelian/parse-preview'), {
    method: 'POST',
    body: form,
  });
  return parseResponse(res);
}

/** Tahap 2: konfirmasi simpan dari session preview */
export async function confirmPembelianUpload(sessionId) {
  return apiJson(apiUrl('/api/pembelian/confirm'), {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/** List faktur paginated (tanpa item) */
export async function listPembelianFaktur({
  limit = 20,
  offset = 0,
  q = '',
} = {}) {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (q) qs.set('q', q);
  return apiJson(apiUrl(`/api/pembelian/faktur?${qs.toString()}`));
}

/** Lazy-load item per faktur */
export async function listPembelianFakturItems(
  fakturId,
  { limit = 100, offset = 0 } = {}
) {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return apiJson(
    apiUrl(`/api/pembelian/faktur/${encodeURIComponent(fakturId)}/items?${qs}`)
  );
}
