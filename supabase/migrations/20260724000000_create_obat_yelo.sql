-- Master data obat Yelo + tabel referensi pilihan (bisa ditambah lewat aplikasi)

CREATE TABLE IF NOT EXISTS public.ref_kandungan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  CONSTRAINT ref_kandungan_nama_unique UNIQUE (nama)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_kandungan_nama_lower
  ON public.ref_kandungan (lower(nama));

CREATE TABLE IF NOT EXISTS public.ref_golongan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  CONSTRAINT ref_golongan_nama_unique UNIQUE (nama)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_golongan_nama_lower
  ON public.ref_golongan (lower(nama));

CREATE TABLE IF NOT EXISTS public.ref_satuan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  CONSTRAINT ref_satuan_nama_unique UNIQUE (nama)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_satuan_nama_lower
  ON public.ref_satuan (lower(nama));

CREATE TABLE IF NOT EXISTS public.ref_grup_substitusi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  CONSTRAINT ref_grup_substitusi_nama_unique UNIQUE (nama)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ref_grup_substitusi_nama_lower
  ON public.ref_grup_substitusi (lower(nama));

CREATE TABLE IF NOT EXISTS public.obat_yelo (
  kode_obat TEXT PRIMARY KEY,
  nama_obat TEXT NOT NULL,
  kandungan_id UUID REFERENCES public.ref_kandungan (id) ON DELETE SET NULL,
  golongan_id UUID REFERENCES public.ref_golongan (id) ON DELETE SET NULL,
  satuan_1_id UUID REFERENCES public.ref_satuan (id) ON DELETE SET NULL,
  konversi NUMERIC,
  satuan_2_id UUID REFERENCES public.ref_satuan (id) ON DELETE SET NULL,
  min_jual NUMERIC,
  grup_substitusi_id UUID REFERENCES public.ref_grup_substitusi (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obat_yelo_nama_obat ON public.obat_yelo (nama_obat);
CREATE INDEX IF NOT EXISTS idx_obat_yelo_golongan_id ON public.obat_yelo (golongan_id);
CREATE INDEX IF NOT EXISTS idx_obat_yelo_grup_substitusi_id ON public.obat_yelo (grup_substitusi_id);

CREATE OR REPLACE FUNCTION public.set_obat_yelo_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_obat_yelo_updated_at ON public.obat_yelo;
CREATE TRIGGER trg_obat_yelo_updated_at
  BEFORE UPDATE ON public.obat_yelo
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_obat_yelo_updated_at();

-- kode_obat immutable after insert (same idea as supplier.inisial)
CREATE OR REPLACE FUNCTION public.prevent_obat_yelo_kode_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kode_obat IS DISTINCT FROM OLD.kode_obat THEN
    RAISE EXCEPTION 'Kode obat tidak bisa diubah setelah dibuat'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_obat_yelo_kode_immutable ON public.obat_yelo;
CREATE TRIGGER trg_obat_yelo_kode_immutable
  BEFORE UPDATE ON public.obat_yelo
  FOR EACH ROW
  EXECUTE PROCEDURE public.prevent_obat_yelo_kode_change();

ALTER TABLE public.ref_kandungan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_golongan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_satuan ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_grup_substitusi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.obat_yelo ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.obat_yelo IS 'Master data obat apotek Yelo; kode_obat diisi manual (Vmedis/staf), immutable setelah create';
COMMENT ON COLUMN public.obat_yelo.grup_substitusi_id IS 'NULL = obat tunggal tanpa grup substitusi';
COMMENT ON TABLE public.ref_grup_substitusi IS 'Nama grup substitusi (dari kolom Subtitusi CSV); bukan flag Group';
