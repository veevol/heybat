import { apiUrl } from './baseUrl';
import { apiJson } from './client';

export async function getForecastPengaturan() {
  return apiJson(apiUrl('/api/forecast/pengaturan'));
}

export async function updateForecastPengaturan(periodeHistoriHari) {
  return apiJson(apiUrl('/api/forecast/pengaturan'), {
    method: 'PUT',
    body: JSON.stringify({ periode_histori_hari: periodeHistoriHari }),
  });
}

export async function jalankanForecast({
  periode_forecast_hari,
  kategori_penjualan,
  periode_histori_hari,
}) {
  return apiJson(apiUrl('/api/forecast/jalankan'), {
    method: 'POST',
    body: JSON.stringify({
      periode_forecast_hari,
      kategori_penjualan,
      periode_histori_hari,
    }),
  });
}

export async function listForecastRiwayat() {
  return apiJson(apiUrl('/api/forecast/riwayat'));
}

export async function getForecastHasil(runId) {
  return apiJson(
    apiUrl(`/api/forecast/hasil/${encodeURIComponent(runId)}`)
  );
}

/** Ringkasan pill filter Defekta untuk 1 forecast run. */
export async function getDefektaFilter(runId) {
  return apiJson(
    apiUrl(`/api/forecast/defekta-filter/${encodeURIComponent(runId)}`)
  );
}

/** Setujui PBF pemenang bobot untuk semua obat yang belum dipilih. */
export async function setujuiSemuaDefekta(runId) {
  return apiJson(
    apiUrl(
      `/api/forecast/defekta-filter/${encodeURIComponent(runId)}/setujui-semua`
    ),
    { method: 'POST' }
  );
}

export async function getDefektaCandidates(runId, kodeObat) {
  return apiJson(
    apiUrl(
      `/api/forecast/defekta/${encodeURIComponent(runId)}/${encodeURIComponent(kodeObat)}`
    )
  );
}

export async function saveDefektaPilihan(runId, kodeObat, payload) {
  return apiJson(
    apiUrl(
      `/api/forecast/defekta/${encodeURIComponent(runId)}/${encodeURIComponent(kodeObat)}`
    ),
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
}

/** Batalkan 1 pilihan PBF (wajib supplierId). */
export async function resetDefektaPilihan(runId, kodeObat, supplierId) {
  const sid = encodeURIComponent(String(supplierId || '').trim());
  return apiJson(
    apiUrl(
      `/api/forecast/defekta/${encodeURIComponent(runId)}/${encodeURIComponent(kodeObat)}?supplier_id=${sid}`
    ),
    { method: 'DELETE' }
  );
}
