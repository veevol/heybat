-- Defekta: pilihan PBF per obat per forecast run
-- Backend uses service_role (bypasses RLS).

CREATE TABLE IF NOT EXISTS public.defekta_pilihan_pbf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_obat TEXT NOT NULL,
  supplier_id UUID NOT NULL
    REFERENCES public.supplier (id) ON DELETE CASCADE,
  pricelist_kode_pbf TEXT,
  forecast_run_id UUID NOT NULL
    REFERENCES public.forecast_run (id) ON DELETE CASCADE,
  dipilih_oleh TEXT,
  tanggal_pilih TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT defekta_pilihan_run_obat_unique UNIQUE (forecast_run_id, kode_obat)
);

CREATE INDEX IF NOT EXISTS idx_defekta_pilihan_run
  ON public.defekta_pilihan_pbf (forecast_run_id);

CREATE INDEX IF NOT EXISTS idx_defekta_pilihan_obat
  ON public.defekta_pilihan_pbf (kode_obat);

ALTER TABLE public.defekta_pilihan_pbf ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.defekta_pilihan_pbf IS
  'Pilihan PBF Defekta per obat dalam satu forecast run; fondasi dokumen Defekta per PBF';
COMMENT ON COLUMN public.defekta_pilihan_pbf.pricelist_kode_pbf IS
  'Kode pricelist PBF yang dipilih (opsional, dari matching)';
