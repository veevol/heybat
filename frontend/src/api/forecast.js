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
}) {
  return apiJson(apiUrl('/api/forecast/jalankan'), {
    method: 'POST',
    body: JSON.stringify({ periode_forecast_hari, kategori_penjualan }),
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
