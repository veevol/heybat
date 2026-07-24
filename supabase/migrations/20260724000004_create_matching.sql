-- Matching: link obat_yelo master to pricelist PBF product codes

CREATE TABLE IF NOT EXISTS public.matching (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_obat_yelo TEXT REFERENCES public.obat_yelo (kode_obat) ON DELETE SET NULL,
  pricelist_pbf_id UUID NOT NULL REFERENCES public.supplier (id) ON DELETE CASCADE,
  pricelist_kode_pbf TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'usulan',
  diusulkan_oleh TEXT,
  dipilih_oleh TEXT,
  diverifikasi_oleh TEXT,
  tanggal_diusulkan TIMESTAMPTZ,
  tanggal_dipilih TIMESTAMPTZ,
  tanggal_diverifikasi TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matching_status_check CHECK (
    status IN ('usulan', 'menunggu_verifikasi', 'terverifikasi', 'ditolak')
  )
);

-- One Yelo drug may match many PBF codes (even multiple from same PBF) — no 1:1 unique.

CREATE INDEX IF NOT EXISTS idx_matching_pricelist_kode
  ON public.matching (pricelist_pbf_id, pricelist_kode_pbf);

CREATE INDEX IF NOT EXISTS idx_matching_kode_obat_yelo
  ON public.matching (kode_obat_yelo);

CREATE INDEX IF NOT EXISTS idx_matching_status
  ON public.matching (status);

CREATE OR REPLACE FUNCTION public.set_matching_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matching_updated_at ON public.matching;
CREATE TRIGGER trg_matching_updated_at
  BEFORE UPDATE ON public.matching
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_matching_updated_at();

ALTER TABLE public.matching ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.matching IS
  'Links obat_yelo master codes to pricelist kode_pbf per supplier; multi-match allowed';
COMMENT ON COLUMN public.matching.kode_obat_yelo IS
  'Nullable for unverified/rejected candidates without a locked Yelo code';
COMMENT ON COLUMN public.matching.pricelist_kode_pbf IS
  'Logical product code within a PBF (stable across upload history), not a single pricelist row id';
