-- Pricelist PBF: history table + per-PBF Excel column mapping

CREATE TABLE IF NOT EXISTS public.pricelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pbf_id UUID NOT NULL REFERENCES public.supplier (id) ON DELETE CASCADE,
  kode_pbf TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  satuan TEXT,
  qty NUMERIC,
  harga_dasar NUMERIC,
  catatan_kondisi TEXT,
  tanggal_upload TIMESTAMPTZ NOT NULL DEFAULT now(),
  diupload_oleh TEXT,
  auto_kosong BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT pricelist_pbf_kode_unique UNIQUE (pbf_id, kode_pbf, id)
);

-- Uniqueness of kode_pbf per PBF across all history rows of that code family:
-- Same kode_pbf can appear many times (history). Unique constraint is (pbf_id, kode_pbf) only if
-- each insert uses same kode for same product — but multiple rows share kode_pbf.
-- So we do NOT unique kode alone; we unique the conceptual product via application logic.
-- Add index for lookups:
CREATE INDEX IF NOT EXISTS idx_pricelist_pbf_id ON public.pricelist (pbf_id);
CREATE INDEX IF NOT EXISTS idx_pricelist_pbf_kode ON public.pricelist (pbf_id, kode_pbf);
CREATE INDEX IF NOT EXISTS idx_pricelist_pbf_nama ON public.pricelist (pbf_id, lower(nama_barang));
CREATE INDEX IF NOT EXISTS idx_pricelist_tanggal ON public.pricelist (pbf_id, tanggal_upload DESC);

-- Drop mistaken unique that included id (always unique). Recreate without bad constraint.
ALTER TABLE public.pricelist DROP CONSTRAINT IF EXISTS pricelist_pbf_kode_unique;

CREATE TABLE IF NOT EXISTS public.pricelist_template_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pbf_id UUID NOT NULL REFERENCES public.supplier (id) ON DELETE CASCADE,
  nama_kolom_barang TEXT NOT NULL,
  nama_kolom_qty TEXT,
  nama_kolom_harga TEXT,
  baris_mulai_data INTEGER NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pricelist_template_pbf_unique UNIQUE (pbf_id),
  CONSTRAINT pricelist_template_baris_check CHECK (baris_mulai_data >= 1)
);

CREATE OR REPLACE FUNCTION public.set_pricelist_template_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pricelist_template_updated_at ON public.pricelist_template_mapping;
CREATE TRIGGER trg_pricelist_template_updated_at
  BEFORE UPDATE ON public.pricelist_template_mapping
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_pricelist_template_updated_at();

ALTER TABLE public.pricelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricelist_template_mapping ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pricelist IS 'Riwayat pricelist PBF — insert-only, never update/overwrite';
COMMENT ON COLUMN public.pricelist.kode_pbf IS 'Format [INISIAL]-00001, reused across history for same product name';
COMMENT ON COLUMN public.pricelist.auto_kosong IS 'True when row auto-inserted because product missing from new upload';
COMMENT ON TABLE public.pricelist_template_mapping IS 'One active Excel column mapping per PBF';
