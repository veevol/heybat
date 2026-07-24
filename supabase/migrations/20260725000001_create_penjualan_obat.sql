-- Histori penjualan obat dari Vmedis (CSV upload berkala)
-- Dasar forecasting: 1 baris = 1 item per faktur (bukan digabung per struk)

CREATE TABLE IF NOT EXISTS public.penjualan_obat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  no_faktur TEXT NOT NULL,
  kode_obat TEXT NOT NULL,
  tanggal_transaksi TIMESTAMPTZ NOT NULL,
  nama_obat TEXT,
  jumlah NUMERIC,
  satuan TEXT,
  harga_jual_label TEXT,
  harga NUMERIC,
  subtotal NUMERIC,
  nama_dokter TEXT,
  kategori_pelanggan TEXT NOT NULL DEFAULT 'retail'
    CHECK (kategori_pelanggan IN ('retail', 'mitra', 'perlu_cek')),
  no_batch_ed TEXT,
  supplier TEXT,
  kasir TEXT,
  shift TEXT,
  tanggal_upload TIMESTAMPTZ NOT NULL DEFAULT now(),
  diupload_oleh TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT penjualan_obat_faktur_kode_unique UNIQUE (no_faktur, kode_obat)
);

CREATE INDEX IF NOT EXISTS idx_penjualan_obat_tanggal
  ON public.penjualan_obat (tanggal_transaksi DESC);

CREATE INDEX IF NOT EXISTS idx_penjualan_obat_kode_obat
  ON public.penjualan_obat (kode_obat);

CREATE INDEX IF NOT EXISTS idx_penjualan_obat_kategori
  ON public.penjualan_obat (kategori_pelanggan);

-- Partial index: daftar "perlu dicek" harus cepat
CREATE INDEX IF NOT EXISTS idx_penjualan_obat_perlu_cek
  ON public.penjualan_obat (tanggal_transaksi DESC)
  WHERE kategori_pelanggan = 'perlu_cek';

CREATE OR REPLACE FUNCTION public.set_penjualan_obat_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_penjualan_obat_updated_at ON public.penjualan_obat;
CREATE TRIGGER trg_penjualan_obat_updated_at
  BEFORE UPDATE ON public.penjualan_obat
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_penjualan_obat_updated_at();

ALTER TABLE public.penjualan_obat ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.penjualan_obat IS
  'Histori transaksi jual per item dari Vmedis (CSV); unique(no_faktur, kode_obat) cegah duplikat re-upload';
COMMENT ON COLUMN public.penjualan_obat.nama_obat IS
  'Teks apa adanya dari CSV — untuk audit jika kode_obat tidak match master';
COMMENT ON COLUMN public.penjualan_obat.harga_jual_label IS
  'Isi kolom Harga Jual apa adanya, mis. "Harga Jual 1" / "Harga Jual 3"';
COMMENT ON COLUMN public.penjualan_obat.kategori_pelanggan IS
  'retail | mitra | perlu_cek — dihitung saat parse; staf bisa override manual';
COMMENT ON COLUMN public.penjualan_obat.diupload_oleh IS
  'Snapshot nama/email pengunggah saat confirm (bukan FK)';

-- ---------------------------------------------------------------------------
-- Seed menu + aksi dasar (lihat / tambah / edit)
-- ---------------------------------------------------------------------------
INSERT INTO public.menus (kode, label, urutan)
VALUES
  ('penjualan', 'Penjualan', 50)
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
    ('tambah', 'Tambah'),
    ('edit', 'Edit')
) AS a (kode_aksi, label)
WHERE m.kode = 'penjualan'
ON CONFLICT (menu_id, kode_aksi) DO UPDATE
SET label = EXCLUDED.label;
