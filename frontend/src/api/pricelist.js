import { apiUrl } from './baseUrl';
import { apiFetch, apiJson, parseResponse } from './client';

function appendMapping(form, mapping) {
  if (!mapping) return;
  form.append('nama_kolom_barang', mapping.nama_kolom_barang || '');
  if (mapping.nama_kolom_qty) form.append('nama_kolom_qty', mapping.nama_kolom_qty);
  if (mapping.nama_kolom_harga) form.append('nama_kolom_harga', mapping.nama_kolom_harga);
  if (mapping.nama_kolom_satuan) form.append('nama_kolom_satuan', mapping.nama_kolom_satuan);
  form.append('baris_mulai_data', String(mapping.baris_mulai_data));
}

export async function getPricelistTemplate(pbfId) {
  const res = await apiFetch(apiUrl(`/api/pricelist-template/${pbfId}`));
  if (res.status === 404) return null;
  return parseResponse(res);
}

export async function createPricelistTemplate(payload) {
  return apiJson(apiUrl('/api/pricelist-template'), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updatePricelistTemplate(pbfId, payload) {
  return apiJson(apiUrl(`/api/pricelist-template/${pbfId}`), {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function previewPricelistExcel(file, barisMulaiData = 2) {
  const form = new FormData();
  form.append('file', file);
  form.append('baris_mulai_data', String(barisMulaiData));
  const res = await apiFetch(apiUrl('/api/pricelist/preview'), {
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
  const res = await apiFetch(apiUrl('/api/pricelist/parse-preview'), {
    method: 'POST',
    body: form,
  });
  return parseResponse(res);
}

/** Simpan pilihan ×1000 ke sesi preview (opsional, sync real-time) */
export async function setPricelistSessionScale(sessionId, scaleBy1000) {
  return apiJson(apiUrl('/api/pricelist/session-scale'), {
    method: 'PATCH',
    body: JSON.stringify({
      session_id: sessionId,
      scale_by_1000: Boolean(scaleBy1000),
    }),
  });
}

/** Tahap 2: konfirmasi simpan dari session preview */
export async function confirmPricelistUpload(sessionId, { scaleBy1000 = false } = {}) {
  return apiJson(apiUrl('/api/pricelist/confirm'), {
    method: 'POST',
    body: JSON.stringify({
      session_id: sessionId,
      scale_by_1000: Boolean(scaleBy1000),
    }),
  });
}

export async function listLatestPricelist(pbfId) {
  return apiJson(
    apiUrl(`/api/pricelist?pbf_id=${encodeURIComponent(pbfId)}`)
  );
}

/** Riwayat batch upload pricelist (semua PBF). */
export async function listPricelistUploads() {
  return apiJson(apiUrl('/api/pricelist/uploads'));
}

/**
 * Soft-delete batch pricelist (qty/harga dikosongkan; matching & kode obat PBF tetap).
 * @param {{ pbfId: string, tanggalUpload: string }}
 */
export async function deletePricelistUpload({ pbfId, tanggalUpload }) {
  return apiJson(apiUrl('/api/pricelist/uploads/hapus'), {
    method: 'POST',
    body: JSON.stringify({
      pbf_id: pbfId,
      tanggal_upload: tanggalUpload,
    }),
  });
}

/** Item pricelist untuk satu batch upload. */
export async function listPricelistByUpload(pbfId, tanggalUpload) {
  const qs = new URLSearchParams({
    pbf_id: pbfId,
    tanggal_upload: tanggalUpload,
  });
  return apiJson(apiUrl(`/api/pricelist?${qs.toString()}`));
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
  const res = await apiFetch(apiUrl('/api/pricelist/parse-pdf-preview'), {
    method: 'POST',
    body: form,
  });
  return parseResponse(res);
}

/** Muat baris mapping PDF berikutnya dari sesi upload */
export async function loadPricelistPdfMappingRows({
  pbfId,
  sessionId,
  offset = 0,
  limit = 12,
}) {
  const qs = new URLSearchParams({
    pbf_id: pbfId,
    session_id: sessionId,
    offset: String(offset),
    limit: String(limit),
  });
  return apiJson(apiUrl(`/api/pricelist/pdf-mapping-rows?${qs.toString()}`));
}

/** Simpan mapping posisi PDF + kembalikan preview session */
export async function savePricelistPdfMapping({
  pbfId,
  sessionId,
  kolomPosisi,
  barisMulaiData = 1,
  formatAngka = 'id',
}) {
  return apiJson(apiUrl('/api/pricelist/save-pdf-mapping'), {
    method: 'POST',
    body: JSON.stringify({
      pbf_id: pbfId,
      session_id: sessionId,
      kolom_posisi: kolomPosisi,
      baris_mulai_data: barisMulaiData,
      format_angka: formatAngka,
    }),
  });
}

/** Update format_angka saja (template PDF yang sudah ada, tanpa mapping ulang) */
export async function updatePricelistPdfFormat(pbfId, formatAngka) {
  return apiJson(apiUrl(`/api/pricelist-template/${pbfId}/format-angka`), {
    method: 'PATCH',
    body: JSON.stringify({ format_angka: formatAngka }),
  });
}
