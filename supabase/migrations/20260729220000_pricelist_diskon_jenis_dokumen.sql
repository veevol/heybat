-- SBS: dua jenis dokumen (stok harian vs harga/diskon bulanan)
ALTER TABLE public.pricelist
  ADD COLUMN IF NOT EXISTS diskon TEXT;

ALTER TABLE public.pricelist
  ADD COLUMN IF NOT EXISTS jenis_dokumen TEXT;

ALTER TABLE public.pricelist
  DROP CONSTRAINT IF EXISTS pricelist_jenis_dokumen_check;

ALTER TABLE public.pricelist
  ADD CONSTRAINT pricelist_jenis_dokumen_check
  CHECK (jenis_dokumen IS NULL OR jenis_dokumen IN ('stok', 'harga'));

COMMENT ON COLUMN public.pricelist.diskon IS
  'Skema diskon mentah dari pricelist harga SBS (N, 2, 7.5 / 4+1, dll). Diwariskan ke upload stok dari PL tanggal_pricelist terbaru.';

COMMENT ON COLUMN public.pricelist.jenis_dokumen IS
  'stok = file stok harian; harga = file daftar harga/diskon bulanan; null = legacy/tidak dibedakan';

CREATE INDEX IF NOT EXISTS idx_pricelist_jenis_dokumen
  ON public.pricelist (pbf_id, jenis_dokumen, tanggal_pricelist DESC NULLS LAST);
