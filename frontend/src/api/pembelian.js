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

/** List faktur HUTANG + sisa/status (paginated) */
export async function listFakturHutang({
  limit = 20,
  offset = 0,
  status = 'semua',
  q = '',
} = {}) {
  const qs = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    status: String(status || 'semua'),
  });
  if (q) qs.set('q', q);
  return apiJson(apiUrl(`/api/pembelian/faktur-hutang?${qs.toString()}`));
}

/** Riwayat pembayaran 1 faktur */
export async function listPembayaranFaktur(fakturId) {
  return apiJson(
    apiUrl(
      `/api/pembelian/faktur-hutang/${encodeURIComponent(fakturId)}/pembayaran`
    )
  );
}

/** Tambah pembayaran */
export async function tambahPembayaran(fakturId, body) {
  return apiJson(
    apiUrl(
      `/api/pembelian/faktur-hutang/${encodeURIComponent(fakturId)}/pembayaran`
    ),
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}

/** Edit pembayaran */
export async function editPembayaran(pembayaranId, body) {
  return apiJson(
    apiUrl(`/api/pembelian/pembayaran/${encodeURIComponent(pembayaranId)}`),
    {
      method: 'PUT',
      body: JSON.stringify(body),
    }
  );
}

/** Hapus pembayaran */
export async function hapusPembayaran(pembayaranId) {
  return apiJson(
    apiUrl(`/api/pembelian/pembayaran/${encodeURIComponent(pembayaranId)}`),
    { method: 'DELETE' }
  );
}
