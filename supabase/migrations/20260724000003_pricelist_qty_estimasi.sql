-- SBS stock-level symbols map to estimated qty values

ALTER TABLE public.pricelist
  ADD COLUMN IF NOT EXISTS qty_estimasi BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pricelist.qty_estimasi IS
  'True when qty was inferred from SBS-style stock symbols (*, **, or blank = >100), not a literal number';
