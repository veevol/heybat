-- Soft-delete batch pricelist: hapus qty/harga (isi file),
-- pertahankan baris identitas obat PBF (kode/nama) & matching.
ALTER TABLE public.pricelist
  ADD COLUMN IF NOT EXISTS dihapus_pada TIMESTAMPTZ;

COMMENT ON COLUMN public.pricelist.dihapus_pada IS
  'Waktu soft-delete batch: qty/harga dikosongkan; kode_pbf+nama_barang tetap agar matching & reuse kode aman';

CREATE INDEX IF NOT EXISTS idx_pricelist_dihapus_pada
  ON public.pricelist (pbf_id, tanggal_upload)
  WHERE dihapus_pada IS NULL;
