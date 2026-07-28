import { apiUrl } from './baseUrl';
import { apiJson } from './client';

/** Ringkasan breakdown per PBF (card) untuk 1 forecast run. */
export async function getDokumenSpBreakdown(runId) {
  return apiJson(
    apiUrl(`/api/dokumen-sp/breakdown/${encodeURIComponent(runId)}`)
  );
}

/** Generate dokumen SP (versi=0) untuk 1 PBF. */
export async function generateDokumenSp(runId, supplierId, kategoriSplit) {
  return apiJson(apiUrl('/api/dokumen-sp/generate'), {
    method: 'POST',
    body: JSON.stringify({
      forecast_run_id: runId,
      supplier_id: supplierId,
      kategori_split: kategoriSplit,
    }),
  });
}

/** Semua versi dokumen_sp untuk 1 kombinasi run+PBF, versi terbaru dulu. */
export async function listDokumenSp(runId, supplierId) {
  return apiJson(
    apiUrl(
      `/api/dokumen-sp/list/${encodeURIComponent(runId)}/${encodeURIComponent(supplierId)}`
    )
  );
}

/** Tandai dokumen versi terbaru (run+PBF) sebagai 'dikirim'. */
export async function kirimDokumenSp(runId, supplierId) {
  return apiJson(apiUrl('/api/dokumen-sp/kirim'), {
    method: 'POST',
    body: JSON.stringify({ forecast_run_id: runId, supplier_id: supplierId }),
  });
}

/** Batalkan SP → generate revisi baru (versi+1) dari data terkini, buka kunci switch lagi. */
export async function batalkanDokumenSp(runId, supplierId) {
  return apiJson(apiUrl('/api/dokumen-sp/batalkan'), {
    method: 'POST',
    body: JSON.stringify({ forecast_run_id: runId, supplier_id: supplierId }),
  });
}
