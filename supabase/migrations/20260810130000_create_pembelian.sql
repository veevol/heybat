-- Histori pembelian obat dari Vmedis (LapDetailDataPembelianObat)
-- 1 faktur = 1 baris pembelian_faktur; item obat di pembelian_item
-- Unique(no_faktur, nama_supplier) cegah duplikat re-upload
-- Tracking file via nama_file_asal + tanggal_upload per faktur (tanpa tabel batch)

CREATE TABLE IF NOT EXISTS public.pembelian_faktur (
  id BIGSERIAL PRIMARY KEY,
  no_faktur TEXT NOT NULL,
  nama_supplier TEXT NOT NULL,
  no_po TEXT,
  jenis_po TEXT,
  status_faktur TEXT,
  tanggal_faktur DATE,
  tanggal_input TIMESTAMPTZ,
  gudang TEXT,
  petugas TEXT,
  jenis_bayar TEXT,
  jatuh_tempo TIMESTAMPTZ,
  no_faktur_pajak TEXT,
  subtotal NUMERIC,
  diskon_tunai NUMERIC,
  diskon NUMERIC,
  pajak NUMERIC,
  biaya NUMERIC,
  total_transaksi NUMERIC,
  diupload_oleh TEXT,
  tanggal_upload TIMESTAMPTZ NOT NULL DEFAULT now(),
  nama_file_asal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pembelian_faktur_no_supplier_unique UNIQUE (no_faktur, nama_supplier)
);

CREATE TABLE IF NOT EXISTS public.pembelian_item (
  id BIGSERIAL PRIMARY KEY,
  faktur_id BIGINT NOT NULL REFERENCES public.pembelian_faktur(id) ON DELETE CASCADE,
  kode_obat TEXT NOT NULL,
  nama_obat TEXT,
  satuan TEXT,
  harga NUMERIC,
  jumlah NUMERIC,
  diskon_1 NUMERIC DEFAULT 0,
  diskon_2 NUMERIC DEFAULT 0,
  diskon_3 NUMERIC DEFAULT 0,
  hpp NUMERIC,
  hna_ppn NUMERIC,
  tanggal_exp DATE,
  no_batch TEXT,
  ketentuan_retur TEXT,
  maks_bln_sblm_ed INT,
  total NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pembelian_item_faktur
  ON public.pembelian_item (faktur_id);

CREATE INDEX IF NOT EXISTS idx_pembelian_item_kode_obat
  ON public.pembelian_item (kode_obat);

CREATE INDEX IF NOT EXISTS idx_pembelian_faktur_supplier
  ON public.pembelian_faktur (nama_supplier);

CREATE INDEX IF NOT EXISTS idx_pembelian_faktur_jatuh_tempo
  ON public.pembelian_faktur (jatuh_tempo);

CREATE INDEX IF NOT EXISTS idx_pembelian_faktur_tanggal
  ON public.pembelian_faktur (tanggal_faktur DESC NULLS LAST);

ALTER TABLE public.pembelian_faktur ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pembelian_item ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pembelian_faktur IS
  'Header faktur pembelian dari Vmedis; unique(no_faktur, nama_supplier)';
COMMENT ON TABLE public.pembelian_item IS
  'Baris obat per faktur pembelian; CASCADE delete saat faktur dihapus';
COMMENT ON COLUMN public.pembelian_faktur.jenis_bayar IS
  'HUTANG | TUNAI (dari kolom Jenis di export Vmedis)';
COMMENT ON COLUMN public.pembelian_faktur.nama_file_asal IS
  'Nama file Excel saat confirm upload';
COMMENT ON COLUMN public.pembelian_faktur.diupload_oleh IS
  'Snapshot nama/email pengunggah saat confirm (bukan FK)';

-- ---------------------------------------------------------------------------
-- Seed menu + aksi dasar (lihat / tambah)
-- urutan 55: di antara penjualan (50) dan stok (60)
-- ---------------------------------------------------------------------------
INSERT INTO public.menus (kode, label, urutan)
VALUES
  ('pembelian', 'Pembelian', 55)
ON CONFLICT (kode) DO UPDATE
SET
  label = EXCLUDED.label,
  urutan = EXCLUDED.urutan;

INSERT INTO public.menu_aksi (menu_id, kode_aksi, label)
SELECT m.id, a.kode_aksi, a.label
FROM public.menus m
CROSS JOIN (
  VALUES
    ('lihat', 'Lihat'),
    ('tambah', 'Tambah')
) AS a (kode_aksi, label)
WHERE m.kode = 'pembelian'
ON CONFLICT (menu_id, kode_aksi) DO UPDATE
SET label = EXCLUDED.label;
