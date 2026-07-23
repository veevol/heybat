async function parseResponse(res) {
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error || 'Terjadi kesalahan');
    error.status = res.status;
    throw error;
  }
  return data;
}

function appendMapping(form, mapping) {
  if (!mapping) return;
  form.append('nama_kolom_barang', mapping.nama_kolom_barang || '');
  if (mapping.nama_kolom_qty) form.append('nama_kolom_qty', mapping.nama_kolom_qty);
  if (mapping.nama_kolom_harga) form.append('nama_kolom_harga', mapping.nama_kolom_harga);
  if (mapping.nama_kolom_satuan) form.append('nama_kolom_satuan', mapping.nama_kolom_satuan);
  form.append('baris_mulai_data', String(mapping.baris_mulai_data));
}

export async function getPricelistTemplate(pbfId) {
  const res = await fetch(`/api/pricelist-template/${pbfId}`);
  if (res.status === 404) return null;
  return parseResponse(res);
}

export async function createPricelistTemplate(payload) {
  const res = await fetch('/api/pricelist-template', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function updatePricelistTemplate(pbfId, payload) {
  const res = await fetch(`/api/pricelist-template/${pbfId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function previewPricelistExcel(file, barisMulaiData = 2) {
  const form = new FormData();
  form.append('file', file);
  form.append('baris_mulai_data', String(barisMulaiData));
  const res = await fetch('/api/pricelist/preview', { method: 'POST', body: form });
  return parseResponse(res);
}

/** Tahap 1: parse Excel → preview + session (belum simpan DB) */
export async function parsePricelistPreview({
  pbfId,
  file,
  mapping = null,
  diuploadOleh = null,
}) {
  const form = new FormData();
  form.append('pbf_id', pbfId);
  form.append('file', file);
  if (diuploadOleh) form.append('diupload_oleh', diuploadOleh);
  appendMapping(form, mapping);
  const res = await fetch('/api/pricelist/parse-preview', { method: 'POST', body: form });
  return parseResponse(res);
}

/** Tahap 2: konfirmasi simpan dari session preview */
export async function confirmPricelistUpload(sessionId) {
  const res = await fetch('/api/pricelist/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  return parseResponse(res);
}

export async function listLatestPricelist(pbfId) {
  const res = await fetch(`/api/pricelist?pbf_id=${encodeURIComponent(pbfId)}`);
  return parseResponse(res);
}
