-- Penandaan stok perlu ditindaklanjuti + aksi menu stok.edit

-- ---------------------------------------------------------------------------
-- 1. Tabel penandaan
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stok_obat_penandaan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stok_obat_id UUID NOT NULL
    REFERENCES public.stok_obat (id) ON DELETE CASCADE,
  jenis_tindakan TEXT NOT NULL
    CHECK (jenis_tindakan IN ('karantina', 'jual_prioritas', 'lainnya')),
  catatan TEXT,
  ditandai_oleh TEXT,
  tanggal_tandai TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'terbuka'
    CHECK (status IN ('terbuka', 'selesai')),
  diselesaikan_oleh TEXT,
  tanggal_selesai TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stok_penandaan_stok_obat
  ON public.stok_obat_penandaan (stok_obat_id);

CREATE INDEX IF NOT EXISTS idx_stok_penandaan_status
  ON public.stok_obat_penandaan (status);

CREATE INDEX IF NOT EXISTS idx_stok_penandaan_terbuka
  ON public.stok_obat_penandaan (tanggal_tandai DESC)
  WHERE status = 'terbuka';

-- Satu penandaan terbuka per baris stok (boleh tandai lagi setelah selesai)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stok_penandaan_satu_terbuka
  ON public.stok_obat_penandaan (stok_obat_id)
  WHERE status = 'terbuka';

ALTER TABLE public.stok_obat_penandaan ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stok_obat_penandaan IS
  'Tindak lanjut stok (karantina / jual prioritas / lainnya); kolaborasi tim';
COMMENT ON COLUMN public.stok_obat_penandaan.jenis_tindakan IS
  'karantina | jual_prioritas | lainnya';
COMMENT ON COLUMN public.stok_obat_penandaan.status IS
  'terbuka = masih perlu ditindaklanjuti; selesai = ditutup';

-- ---------------------------------------------------------------------------
-- 2. Aksi edit pada menu stok (tandai / tandai selesai)
-- ---------------------------------------------------------------------------
INSERT INTO public.menu_aksi (menu_id, kode_aksi, label)
SELECT m.id, a.kode_aksi, a.label
FROM public.menus m
CROSS JOIN (
  VALUES
    ('edit', 'Edit')
) AS a (kode_aksi, label)
WHERE m.kode = 'stok'
ON CONFLICT (menu_id, kode_aksi) DO UPDATE
SET label = EXCLUDED.label;
