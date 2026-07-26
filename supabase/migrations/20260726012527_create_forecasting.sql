-- Forecasting: pengaturan global, riwayat run, hasil per obat
-- Backend uses service_role (bypasses RLS).

-- ---------------------------------------------------------------------------
-- forecast_pengaturan (1 baris setting global)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.forecast_pengaturan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode_histori_hari INTEGER NOT NULL DEFAULT 90
    CHECK (periode_histori_hari > 0),
  diubah_oleh TEXT,
  diubah_saat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.forecast_pengaturan ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.forecast_pengaturan IS
  'Setting global forecasting (biasanya 1 baris); periode_histori_hari untuk rata-rata penjualan';

-- Seed baris default
INSERT INTO public.forecast_pengaturan (periode_histori_hari)
SELECT 90
WHERE NOT EXISTS (SELECT 1 FROM public.forecast_pengaturan LIMIT 1);

-- ---------------------------------------------------------------------------
-- forecast_run
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.forecast_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periode_forecast_hari INTEGER NOT NULL
    CHECK (periode_forecast_hari > 0),
  kategori_penjualan TEXT[] NOT NULL
    CHECK (
      cardinality(kategori_penjualan) > 0
      AND kategori_penjualan <@ ARRAY['retail', 'mitra']::TEXT[]
    ),
  periode_histori_hari INTEGER NOT NULL
    CHECK (periode_histori_hari > 0),
  dijalankan_oleh TEXT,
  dijalankan_saat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecast_run_dijalankan_saat
  ON public.forecast_run (dijalankan_saat DESC);

ALTER TABLE public.forecast_run ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.forecast_run IS
  'Satu baris per eksekusi forecast manual';
COMMENT ON COLUMN public.forecast_run.kategori_penjualan IS
  'Pilihan user: subset retail|mitra. Titip ikut terhitung ke retail saat agregasi, tapi tidak disimpan di sini';
COMMENT ON COLUMN public.forecast_run.periode_histori_hari IS
  'Snapshot periode histori dari pengaturan saat run dibuat';

-- ---------------------------------------------------------------------------
-- forecast_hasil
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.forecast_hasil (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_run_id UUID NOT NULL
    REFERENCES public.forecast_run (id) ON DELETE CASCADE,
  kode_obat TEXT NOT NULL,
  rata_rata_harian NUMERIC NOT NULL DEFAULT 0,
  perkiraan_terjual NUMERIC NOT NULL DEFAULT 0,
  stok_sekarang NUMERIC NOT NULL DEFAULT 0,
  kebutuhan_beli NUMERIC NOT NULL DEFAULT 0
    CHECK (kebutuhan_beli >= 0),
  grup_substitusi TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT forecast_hasil_run_kode_unique UNIQUE (forecast_run_id, kode_obat)
);

CREATE INDEX IF NOT EXISTS idx_forecast_hasil_run_id
  ON public.forecast_hasil (forecast_run_id);

CREATE INDEX IF NOT EXISTS idx_forecast_hasil_grup
  ON public.forecast_hasil (forecast_run_id, grup_substitusi);

ALTER TABLE public.forecast_hasil ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.forecast_hasil IS
  '1 baris per obat per forecast_run; qty dalam satuan_1 (Tab)';
COMMENT ON COLUMN public.forecast_hasil.kebutuhan_beli IS
  'MAX(0, perkiraan_terjual - stok_sekarang) dalam satuan_1';
COMMENT ON COLUMN public.forecast_hasil.grup_substitusi IS
  'Snapshot nama grup substitusi saat run; null = tanpa grup';

-- ---------------------------------------------------------------------------
-- Seed menu + aksi (lihat / tambah)
-- ---------------------------------------------------------------------------
INSERT INTO public.menus (kode, label, urutan)
VALUES
  ('forecasting', 'Forecasting', 70)
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
WHERE m.kode = 'forecasting'
ON CONFLICT (menu_id, kode_aksi) DO UPDATE
SET label = EXCLUDED.label;
