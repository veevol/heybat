-- Snapshot rentang tanggal histori per forecast run
ALTER TABLE public.forecast_run
  ADD COLUMN IF NOT EXISTS histori_dari DATE,
  ADD COLUMN IF NOT EXISTS histori_sampai DATE;

COMMENT ON COLUMN public.forecast_run.histori_dari IS
  'Tanggal awal (inklusif) jendela penjualan untuk rata-rata harian';
COMMENT ON COLUMN public.forecast_run.histori_sampai IS
  'Tanggal akhir (inklusif) jendela penjualan — patokan hitung ke belakang';
COMMENT ON COLUMN public.forecast_run.periode_histori_hari IS
  'Jumlah hari inklusif (histori_sampai - histori_dari + 1); dipakai sebagai pembagi rata-rata';
