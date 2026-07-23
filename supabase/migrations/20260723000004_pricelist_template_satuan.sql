-- Add satuan column mapping for Pricelist Excel templates
ALTER TABLE public.pricelist_template_mapping
  ADD COLUMN IF NOT EXISTS nama_kolom_satuan TEXT;

COMMENT ON COLUMN public.pricelist_template_mapping.nama_kolom_satuan IS 'Excel header column for satuan/unit';
