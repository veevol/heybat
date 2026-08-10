-- Pembayaran hutang per faktur pembelian (jenis_bayar = HUTANG)
-- ON DELETE RESTRICT: faktur tidak bisa dihapus jika masih ada pembayaran

CREATE TABLE IF NOT EXISTS public.pembayaran_hutang (
  id BIGSERIAL PRIMARY KEY,
  faktur_id BIGINT NOT NULL REFERENCES public.pembelian_faktur(id) ON DELETE RESTRICT,
  tanggal_bayar DATE NOT NULL,
  nominal NUMERIC NOT NULL,
  metode_bayar TEXT,
  catatan TEXT,
  ditandai_lunas_manual BOOLEAN NOT NULL DEFAULT false,
  diinput_oleh TEXT,
  tanggal_input TIMESTAMPTZ NOT NULL DEFAULT now(),
  diedit_oleh TEXT,
  tanggal_edit TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pembayaran_hutang_faktur
  ON public.pembayaran_hutang (faktur_id);

CREATE INDEX IF NOT EXISTS idx_pembayaran_hutang_tanggal
  ON public.pembayaran_hutang (tanggal_bayar DESC);

ALTER TABLE public.pembayaran_hutang ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pembayaran_hutang IS
  'Riwayat pembayaran hutang per faktur pembelian';
COMMENT ON COLUMN public.pembayaran_hutang.ditandai_lunas_manual IS
  'Jika true, faktur dianggap lunas meski sisa_hutang > 0';

-- ---------------------------------------------------------------------------
-- Seed aksi edit / hapus pada menu pembelian (lihat/tambah sudah ada)
-- ---------------------------------------------------------------------------
INSERT INTO public.menu_aksi (menu_id, kode_aksi, label)
SELECT m.id, a.kode_aksi, a.label
FROM public.menus m
CROSS JOIN (
  VALUES
    ('edit', 'Edit'),
    ('hapus', 'Hapus')
) AS a (kode_aksi, label)
WHERE m.kode = 'pembelian'
ON CONFLICT (menu_id, kode_aksi) DO UPDATE
SET label = EXCLUDED.label;
