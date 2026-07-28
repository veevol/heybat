-- Defekta multi-PBF: qty_order + unique (run, obat, supplier)
-- Safe ALTER — preserve existing rows.

ALTER TABLE public.defekta_pilihan_pbf
  ADD COLUMN IF NOT EXISTS qty_order NUMERIC DEFAULT NULL;

COMMENT ON COLUMN public.defekta_pilihan_pbf.qty_order IS
  'Qty order Defekta (default dari kebutuhan_beli forecast; bisa diedit user)';

-- Drop old 1-obat-1-PBF unique; allow multiple PBF rows per obat per run.
ALTER TABLE public.defekta_pilihan_pbf
  DROP CONSTRAINT IF EXISTS defekta_pilihan_run_obat_unique;

ALTER TABLE public.defekta_pilihan_pbf
  ADD CONSTRAINT defekta_pilihan_run_obat_supplier_unique
  UNIQUE (forecast_run_id, kode_obat, supplier_id);

CREATE INDEX IF NOT EXISTS idx_defekta_pilihan_run_obat
  ON public.defekta_pilihan_pbf (forecast_run_id, kode_obat);
