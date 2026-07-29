-- Tanggal dokumen di dalam file pricelist (bukan waktu upload ke sistem)
ALTER TABLE public.pricelist
  ADD COLUMN IF NOT EXISTS tanggal_pricelist DATE;

COMMENT ON COLUMN public.pricelist.tanggal_pricelist IS
  'Tanggal yang tercantum di dokumen pricelist PBF (diekstrak per aturan PBF); dipakai urutan History';

CREATE INDEX IF NOT EXISTS idx_pricelist_tanggal_pricelist
  ON public.pricelist (tanggal_pricelist DESC NULLS LAST);
