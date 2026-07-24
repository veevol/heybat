import { apiUrl } from './baseUrl';

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
  const res = await fetch(apiUrl(`/api/pricelist-template/${pbfId}`));
  if (res.status === 404) return null;
  return parseResponse(res);
}

export async function createPricelistTemplate(payload) {
  const res = await fetch(apiUrl('/api/pricelist-template'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseResponse(res);
}

export async function updatePricelistTemplate(pbfId, payload) {
  const res = await fetch(apiUrl(`/api/pricelist-template/${pbfId}`), {
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
  const res = await fetch(apiUrl('/api/pricelist/preview'), {
    method: 'POST',
    body: form,
  });
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
  const res = await fetch(apiUrl('/api/pricelist/parse-preview'), {
    method: 'POST',
    body: form,
  });
  return parseResponse(res);
}

/** Simpan pilihan ×1000 ke sesi preview (opsional, sync real-time) */
export async function setPricelistSessionScale(sessionId, scaleBy1000) {
  const res = await fetch(apiUrl('/api/pricelist/session-scale'), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      scale_by_1000: Boolean(scaleBy1000),
    }),
  });
  return parseResponse(res);
}

/** Tahap 2: konfirmasi simpan dari session preview */
export async function confirmPricelistUpload(sessionId, { scaleBy1000 = false } = {}) {
  const res = await fetch(apiUrl('/api/pricelist/confirm'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      scale_by_1000: Boolean(scaleBy1000),
    }),
  });
  return parseResponse(res);
}

export async function listLatestPricelist(pbfId) {
  const res = await fetch(
    apiUrl(`/api/pricelist?pbf_id=${encodeURIComponent(pbfId)}`)
  );
  return parseResponse(res);
}

/** Native PDF: extract → needs_mapping atau preview session */
export async function parsePricelistPdfPreview({
  pbfId,
  file,
  diuploadOleh = null,
  forceMapping = false,
}) {
  const form = new FormData();
  form.append('pbf_id', pbfId);
  form.append('file', file);
  if (diuploadOleh) form.append('diupload_oleh', diuploadOleh);
  if (forceMapping) form.append('force_mapping', 'true');
  const res = await fetch(apiUrl('/api/pricelist/parse-pdf-preview'), {
    method: 'POST',
    body: form,
  });
  return parseResponse(res);
}

/** Simpan mapping posisi PDF + kembalikan preview session */
export async function savePricelistPdfMapping({
  pbfId,
  sessionId,
  kolomPosisi,
  barisMulaiData = 1,
  formatAngka = 'id',
}) {
  const res = await fetch(apiUrl('/api/pricelist/save-pdf-mapping'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pbf_id: pbfId,
      session_id: sessionId,
      kolom_posisi: kolomPosisi,
      baris_mulai_data: barisMulaiData,
      format_angka: formatAngka,
    }),
  });
  return parseResponse(res);
}

/** Update format_angka saja (template PDF yang sudah ada, tanpa mapping ulang) */
export async function updatePricelistPdfFormat(pbfId, formatAngka) {
  const res = await fetch(apiUrl(`/api/pricelist-template/${pbfId}/format-angka`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format_angka: formatAngka }),
  });
  return parseResponse(res);
}
