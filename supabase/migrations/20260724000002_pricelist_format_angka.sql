-- Number format for PDF text→number parsing (per-PBF template)

ALTER TABLE public.pricelist_template_mapping
  ADD COLUMN IF NOT EXISTS format_angka TEXT NOT NULL DEFAULT 'id';

ALTER TABLE public.pricelist_template_mapping
  DROP CONSTRAINT IF EXISTS pricelist_template_format_angka_check;

ALTER TABLE public.pricelist_template_mapping
  ADD CONSTRAINT pricelist_template_format_angka_check
  CHECK (format_angka IN ('id', 'intl'));

COMMENT ON COLUMN public.pricelist_template_mapping.format_angka IS
  'PDF only: id = titik/koma as thousand separators (strip both); intl = comma thousands, dot decimal';
