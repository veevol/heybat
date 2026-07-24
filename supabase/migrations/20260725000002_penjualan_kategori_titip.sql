-- Tambah kategori pelanggan 'titip' pada penjualan_obat

ALTER TABLE public.penjualan_obat
  DROP CONSTRAINT IF EXISTS penjualan_obat_kategori_pelanggan_check;

ALTER TABLE public.penjualan_obat
  ADD CONSTRAINT penjualan_obat_kategori_pelanggan_check
  CHECK (kategori_pelanggan IN ('retail', 'mitra', 'titip', 'perlu_cek'));

COMMENT ON COLUMN public.penjualan_obat.kategori_pelanggan IS
  'retail | mitra | titip | perlu_cek — dihitung saat parse; staf bisa override manual';
