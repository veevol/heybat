-- Riwayat upload penjualan per file + tautan ke baris transaksi

CREATE TABLE IF NOT EXISTS public.penjualan_upload_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_file TEXT NOT NULL,
  jumlah_baris_masuk INTEGER NOT NULL DEFAULT 0,
  jumlah_baris_skip_duplikat INTEGER NOT NULL DEFAULT 0,
  diupload_oleh TEXT,
  tanggal_upload TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_penjualan_upload_batch_tanggal
  ON public.penjualan_upload_batch (tanggal_upload DESC);

ALTER TABLE public.penjualan_upload_batch ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.penjualan_upload_batch IS
  'Satu baris per file Excel yang dikonfirmasi upload; dipakai untuk hapus dataset per file';

ALTER TABLE public.penjualan_obat
  ADD COLUMN IF NOT EXISTS upload_batch_id UUID
  REFERENCES public.penjualan_upload_batch (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_penjualan_obat_upload_batch_id
  ON public.penjualan_obat (upload_batch_id);

COMMENT ON COLUMN public.penjualan_obat.upload_batch_id IS
  'FK ke penjualan_upload_batch; null untuk data lama sebelum fitur riwayat upload';
