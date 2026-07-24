-- Cache top-N similarity candidates per pricelist kode_pbf (per PBF)

CREATE TABLE IF NOT EXISTS public.matching_kandidat_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricelist_pbf_id UUID NOT NULL REFERENCES public.supplier (id) ON DELETE CASCADE,
  pricelist_kode_pbf TEXT NOT NULL,
  kandidat JSONB NOT NULL DEFAULT '[]'::jsonb,
  dihitung_pada TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matching_kandidat_cache_pbf_kode_unique
    UNIQUE (pricelist_pbf_id, pricelist_kode_pbf)
);

CREATE INDEX IF NOT EXISTS idx_matching_kandidat_cache_pbf
  ON public.matching_kandidat_cache (pricelist_pbf_id);

ALTER TABLE public.matching_kandidat_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.matching_kandidat_cache IS
  'Cached top-5 obat_yelo similarity candidates per pricelist kode_pbf; refreshed via POST /api/matching/refresh-kandidat/:pbfId';
