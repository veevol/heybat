-- Dokumen SP (Surat Pesanan): fondasi generate dokumen per PBF dari hasil Defekta.
-- Backend uses service_role (bypasses RLS).
-- Tahap 1: skema tabel saja — belum ada generate PDF asli, belum ada endpoint lock/generate.

-- ---------------------------------------------------------------------------
-- dokumen_sp — 1 baris = 1 dokumen SP (1 PBF x 1 golongan x 1 kategori x 1 versi)
-- Append-only: revisi menambah baris versi baru, tidak overwrite baris lama.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dokumen_sp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_run_id UUID NOT NULL
    REFERENCES public.forecast_run (id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL
    REFERENCES public.supplier (id) ON DELETE CASCADE,
  golongan TEXT NOT NULL,
  kategori TEXT NOT NULL
    CHECK (kategori IN ('retail', 'mitra', 'gabung')),
  versi INTEGER NOT NULL DEFAULT 0
    CHECK (versi >= 0),
  status TEXT NOT NULL DEFAULT 'terbit'
    CHECK (status IN ('terbit', 'dikirim')),
  tanggal_terbit TIMESTAMPTZ NOT NULL DEFAULT now(),
  tanggal_kirim TIMESTAMPTZ,
  file_path TEXT,
  dibuat_oleh UUID REFERENCES public.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dokumen_sp_run_supplier_golongan_kategori_versi_unique
    UNIQUE (forecast_run_id, supplier_id, golongan, kategori, versi)
);

CREATE INDEX IF NOT EXISTS idx_dokumen_sp_run
  ON public.dokumen_sp (forecast_run_id);
CREATE INDEX IF NOT EXISTS idx_dokumen_sp_supplier
  ON public.dokumen_sp (supplier_id);
CREATE INDEX IF NOT EXISTS idx_dokumen_sp_run_supplier
  ON public.dokumen_sp (forecast_run_id, supplier_id);

ALTER TABLE public.dokumen_sp ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.dokumen_sp IS
  'Dokumen SP per PBF per golongan; append-only — revisi menambah versi baru (0=asli, 1+=revisi), tidak overwrite riwayat lama';
COMMENT ON COLUMN public.dokumen_sp.golongan IS
  'Snapshot nama golongan (ref_golongan) saat SP digenerate — 1 dokumen = 1 golongan';
COMMENT ON COLUMN public.dokumen_sp.kategori IS
  'retail | mitra | gabung — gabung dipakai saat switch Pisah=off saat digenerate';
COMMENT ON COLUMN public.dokumen_sp.versi IS
  '0 = dokumen asli, 1+ = revisi; baris versi lama tidak dihapus/diubah (append-only)';
COMMENT ON COLUMN public.dokumen_sp.file_path IS
  'Path/URL PDF hasil generate — diisi di tahap generate PDF; kosong pada tahap fondasi ini';
COMMENT ON COLUMN public.dokumen_sp.dibuat_oleh IS
  'User yang generate dokumen (public.users.id)';

-- ---------------------------------------------------------------------------
-- dokumen_sp_item — snapshot item (obat+qty) per dokumen SP saat digenerate.
-- Sengaja tidak FK ke defekta_pilihan_pbf: kalau pilihan PBF berubah/dibatalkan
-- setelah SP digenerate, riwayat dokumen SP lama tidak ikut berubah.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dokumen_sp_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dokumen_sp_id UUID NOT NULL
    REFERENCES public.dokumen_sp (id) ON DELETE CASCADE,
  kode_obat TEXT NOT NULL,
  supplier_id UUID NOT NULL
    REFERENCES public.supplier (id) ON DELETE CASCADE,
  qty_order NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dokumen_sp_item_dokumen
  ON public.dokumen_sp_item (dokumen_sp_id);
CREATE INDEX IF NOT EXISTS idx_dokumen_sp_item_kode_obat
  ON public.dokumen_sp_item (kode_obat);

ALTER TABLE public.dokumen_sp_item ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.dokumen_sp_item IS
  'Snapshot baris obat+qty+PBF per dokumen_sp saat digenerate; independen dari defekta_pilihan_pbf agar riwayat dokumen lama tidak ikut berubah';
COMMENT ON COLUMN public.dokumen_sp_item.supplier_id IS
  'Snapshot PBF saat digenerate (sama dengan dokumen_sp.supplier_id, disimpan ulang untuk audit per-baris)';

-- ---------------------------------------------------------------------------
-- defekta_pbf_lock — status kunci switch Pisah/Gabung per kombinasi run+PBF.
-- locked=true setelah SP pertama kali digenerate untuk kombinasi ini, supaya
-- switch tidak bisa diubah lagi di tengah jalan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.defekta_pbf_lock (
  forecast_run_id UUID NOT NULL
    REFERENCES public.forecast_run (id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL
    REFERENCES public.supplier (id) ON DELETE CASCADE,
  locked BOOLEAN NOT NULL DEFAULT false,
  kategori_dipilih TEXT
    CHECK (kategori_dipilih IN ('gabung', 'pisah')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (forecast_run_id, supplier_id)
);

CREATE OR REPLACE FUNCTION public.set_defekta_pbf_lock_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_defekta_pbf_lock_updated_at ON public.defekta_pbf_lock;
CREATE TRIGGER trg_defekta_pbf_lock_updated_at
  BEFORE UPDATE ON public.defekta_pbf_lock
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_defekta_pbf_lock_updated_at();

ALTER TABLE public.defekta_pbf_lock ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.defekta_pbf_lock IS
  'Status kunci switch Pisah/Gabung per kombinasi forecast_run + PBF; locked=true setelah SP pertama kali digenerate untuk kombinasi ini';
COMMENT ON COLUMN public.defekta_pbf_lock.kategori_dipilih IS
  'Snapshot pilihan switch saat pertama kali di-lock: gabung (1 dokumen semua kategori) atau pisah (dokumen terpisah retail/mitra)';
