-- Support native PDF pricelist mapping alongside Excel

ALTER TABLE public.pricelist_template_mapping
  ADD COLUMN IF NOT EXISTS tipe_sumber TEXT NOT NULL DEFAULT 'excel',
  ADD COLUMN IF NOT EXISTS kolom_posisi JSONB;

-- PDF templates don't use Excel header names
ALTER TABLE public.pricelist_template_mapping
  ALTER COLUMN nama_kolom_barang DROP NOT NULL;

ALTER TABLE public.pricelist_template_mapping
  DROP CONSTRAINT IF EXISTS pricelist_template_tipe_sumber_check;

ALTER TABLE public.pricelist_template_mapping
  ADD CONSTRAINT pricelist_template_tipe_sumber_check
  CHECK (tipe_sumber IN ('excel', 'pdf'));

COMMENT ON COLUMN public.pricelist_template_mapping.tipe_sumber IS
  'excel = header-column mapping; pdf = x-range column areas in kolom_posisi';
COMMENT ON COLUMN public.pricelist_template_mapping.kolom_posisi IS
  'PDF column x ranges, e.g. {"nama":{"x_min":30,"x_max":250},"qty":{...},"harga":{...},"satuan":{...}}';
COMMENT ON TABLE public.pricelist_template_mapping IS
  'One active mapping per PBF (Excel headers or PDF x-position ranges)';
