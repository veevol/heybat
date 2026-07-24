-- Perluasan penandaan: jenis tambah_ke_obat_yelo + kode_obat (nullable stok_obat_id)

-- ---------------------------------------------------------------------------
-- 1. kolom kode_obat + stok_obat_id nullable
-- ---------------------------------------------------------------------------
ALTER TABLE public.stok_obat_penandaan
  ADD COLUMN IF NOT EXISTS kode_obat TEXT;

ALTER TABLE public.stok_obat_penandaan
  ALTER COLUMN stok_obat_id DROP NOT NULL;

COMMENT ON COLUMN public.stok_obat_penandaan.kode_obat IS
  'Untuk jenis tambah_ke_obat_yelo: kode yang perlu ditambahkan ke master obat_yelo';

-- ---------------------------------------------------------------------------
-- 2. Ganti CHECK jenis_tindakan (tambah opsi baru)
-- ---------------------------------------------------------------------------
ALTER TABLE public.stok_obat_penandaan
  DROP CONSTRAINT IF EXISTS stok_obat_penandaan_jenis_tindakan_check;

ALTER TABLE public.stok_obat_penandaan
  ADD CONSTRAINT stok_obat_penandaan_jenis_tindakan_check
  CHECK (
    jenis_tindakan IN (
      'karantina',
      'jual_prioritas',
      'lainnya',
      'tambah_ke_obat_yelo'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. CHECK: jenis vs field wajib
-- ---------------------------------------------------------------------------
ALTER TABLE public.stok_obat_penandaan
  DROP CONSTRAINT IF EXISTS stok_obat_penandaan_jenis_fields_check;

ALTER TABLE public.stok_obat_penandaan
  ADD CONSTRAINT stok_obat_penandaan_jenis_fields_check
  CHECK (
    (
      jenis_tindakan = 'tambah_ke_obat_yelo'
      AND kode_obat IS NOT NULL
      AND length(trim(kode_obat)) > 0
    )
    OR (
      jenis_tindakan IN ('karantina', 'jual_prioritas', 'lainnya')
      AND stok_obat_id IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 4. UNIQUE parsial: 1 kode terbuka untuk tambah_ke_obat_yelo
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_stok_penandaan_kode_tambah_terbuka
  ON public.stok_obat_penandaan (kode_obat)
  WHERE status = 'terbuka' AND jenis_tindakan = 'tambah_ke_obat_yelo';

CREATE INDEX IF NOT EXISTS idx_stok_penandaan_kode_obat
  ON public.stok_obat_penandaan (kode_obat)
  WHERE kode_obat IS NOT NULL;

COMMENT ON COLUMN public.stok_obat_penandaan.jenis_tindakan IS
  'karantina | jual_prioritas | lainnya | tambah_ke_obat_yelo';
COMMENT ON TABLE public.stok_obat_penandaan IS
  'Tindak lanjut stok; tambah_ke_obat_yelo terikat kode_obat (stok_obat_id null)';
