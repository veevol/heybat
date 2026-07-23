-- Expand supplier schema + jadwal per hari
-- Replaces free-text jadwal_kirim with supplier_jadwal rows

ALTER TABLE public.supplier
  ADD COLUMN IF NOT EXISTS jenis_kelamin_sales TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS jenis_pbf TEXT[];

ALTER TABLE public.supplier
  DROP COLUMN IF EXISTS jadwal_kirim;

ALTER TABLE public.supplier
  DROP CONSTRAINT IF EXISTS supplier_jenis_kelamin_sales_check;

ALTER TABLE public.supplier
  ADD CONSTRAINT supplier_jenis_kelamin_sales_check
  CHECK (jenis_kelamin_sales IS NULL OR jenis_kelamin_sales IN ('L', 'P'));

CREATE TABLE IF NOT EXISTS public.supplier_jadwal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.supplier (id) ON DELETE CASCADE,
  hari TEXT NOT NULL,
  bisa_order BOOLEAN NOT NULL DEFAULT false,
  bisa_kirim BOOLEAN NOT NULL DEFAULT false,
  jam_cutoff TEXT,
  CONSTRAINT supplier_jadwal_hari_check
    CHECK (hari IN ('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu')),
  CONSTRAINT supplier_jadwal_supplier_hari_unique UNIQUE (supplier_id, hari)
);

CREATE INDEX IF NOT EXISTS idx_supplier_jadwal_supplier_id
  ON public.supplier_jadwal (supplier_id);

ALTER TABLE public.supplier_jadwal ENABLE ROW LEVEL SECURITY;

-- Auto-seed 7 hari saat supplier baru dibuat
CREATE OR REPLACE FUNCTION public.seed_supplier_jadwal()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.supplier_jadwal (supplier_id, hari, bisa_order, bisa_kirim, jam_cutoff)
  VALUES
    (NEW.id, 'Senin', false, false, null),
    (NEW.id, 'Selasa', false, false, null),
    (NEW.id, 'Rabu', false, false, null),
    (NEW.id, 'Kamis', false, false, null),
    (NEW.id, 'Jumat', false, false, null),
    (NEW.id, 'Sabtu', false, false, null),
    (NEW.id, 'Minggu', false, false, null);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_supplier_jadwal ON public.supplier;
CREATE TRIGGER trg_seed_supplier_jadwal
  AFTER INSERT ON public.supplier
  FOR EACH ROW
  EXECUTE PROCEDURE public.seed_supplier_jadwal();

-- Backfill jadwal untuk supplier yang sudah ada
INSERT INTO public.supplier_jadwal (supplier_id, hari)
SELECT s.id, d.hari
FROM public.supplier s
CROSS JOIN (
  VALUES
    ('Senin'),
    ('Selasa'),
    ('Rabu'),
    ('Kamis'),
    ('Jumat'),
    ('Sabtu'),
    ('Minggu')
) AS d(hari)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.supplier_jadwal j
  WHERE j.supplier_id = s.id AND j.hari = d.hari
);

COMMENT ON COLUMN public.supplier.jenis_kelamin_sales IS 'L / P / null — untuk sapaan WhatsApp';
COMMENT ON COLUMN public.supplier.logo_url IS 'URL logo PBF; upload UI nanti';
COMMENT ON COLUMN public.supplier.jenis_pbf IS 'Multi jenis: Farma, Alkes, OTC, Herbal, Lainnya';
COMMENT ON TABLE public.supplier_jadwal IS 'Jadwal order/kirim per hari untuk satu supplier';
