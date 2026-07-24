-- Modul Stok: batch upload + detail snapshot + ringkasan bulanan + menu
-- FINAL (belum pernah dijalankan ke DB — jalankan SEKALI versi ini)

-- ---------------------------------------------------------------------------
-- 1. Riwayat upload per file
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stok_upload_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_file TEXT NOT NULL,
  jumlah_baris_masuk INTEGER NOT NULL DEFAULT 0,
  jumlah_baris_skip INTEGER NOT NULL DEFAULT 0,
  diupload_oleh TEXT,
  tanggal_upload TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stok_upload_batch_tanggal
  ON public.stok_upload_batch (tanggal_upload DESC);

ALTER TABLE public.stok_upload_batch ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stok_upload_batch IS
  'Satu baris per file Excel stok Vmedis yang dikonfirmasi; dipakai hapus dataset per file';

-- ---------------------------------------------------------------------------
-- 2. Detail stok per batch (insert-only history)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stok_obat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_batch_id UUID NOT NULL
    REFERENCES public.stok_upload_batch (id) ON DELETE CASCADE,
  kode_obat TEXT NOT NULL,
  gudang TEXT NOT NULL DEFAULT 'Retail',
  nama_obat TEXT,
  nama_obat_asli TEXT,
  no_batch TEXT,
  tanggal_expired TIMESTAMPTZ,
  stok_qty NUMERIC,
  satuan TEXT,
  harga_1 NUMERIC,
  harga_2 NUMERIC,
  harga_3 NUMERIC,
  golongan_vmedis TEXT,
  kategori_vmedis TEXT,
  lokasi TEXT,
  status TEXT,
  tanggal_upload TIMESTAMPTZ NOT NULL DEFAULT now(),
  diupload_oleh TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stok_obat_batch
  ON public.stok_obat (upload_batch_id);

CREATE INDEX IF NOT EXISTS idx_stok_obat_kode
  ON public.stok_obat (kode_obat);

CREATE INDEX IF NOT EXISTS idx_stok_obat_tanggal_upload
  ON public.stok_obat (tanggal_upload DESC);

CREATE INDEX IF NOT EXISTS idx_stok_obat_kode_tanggal
  ON public.stok_obat (kode_obat, tanggal_upload DESC);

CREATE INDEX IF NOT EXISTS idx_stok_obat_kode_gudang_tanggal
  ON public.stok_obat (kode_obat, gudang, tanggal_upload DESC);

CREATE INDEX IF NOT EXISTS idx_stok_obat_expired
  ON public.stok_obat (tanggal_expired)
  WHERE tanggal_expired IS NOT NULL;

ALTER TABLE public.stok_obat ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stok_obat IS
  'Snapshot stok+harga per batch dari Vmedis; insert-only, menumpuk tiap upload';
COMMENT ON COLUMN public.stok_obat.kode_obat IS
  'Teks apa adanya dari Vmedis — tidak wajib match obat_yelo';
COMMENT ON COLUMN public.stok_obat.gudang IS
  'Nama gudang/cabang dari Vmedis (teks bebas, mis. Retail); stok antar-gudang terpisah';
COMMENT ON COLUMN public.stok_obat.nama_obat IS
  'Nama dibersihkan (strip "-" di depan); nama_obat_asli menyimpan teks mentah';
COMMENT ON COLUMN public.stok_obat.golongan_vmedis IS
  'Golongan mentah dari file Vmedis — bukan ref_golongan obat_yelo';

-- ---------------------------------------------------------------------------
-- 3. Ringkasan bulanan (hasil proses Ringkas Data Lama)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stok_obat_ringkasan_bulanan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_obat TEXT NOT NULL,
  gudang TEXT NOT NULL DEFAULT 'Retail',
  bulan DATE NOT NULL,
  stok_akhir_bulan NUMERIC NOT NULL DEFAULT 0,
  harga_1_akhir NUMERIC,
  harga_2_akhir NUMERIC,
  harga_3_akhir NUMERIC,
  dibuat_saat TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stok_obat_ringkasan_kode_gudang_bulan_unique UNIQUE (kode_obat, gudang, bulan)
);

CREATE INDEX IF NOT EXISTS idx_stok_ringkasan_bulan
  ON public.stok_obat_ringkasan_bulanan (bulan DESC);

CREATE INDEX IF NOT EXISTS idx_stok_ringkasan_kode
  ON public.stok_obat_ringkasan_bulanan (kode_obat);

CREATE INDEX IF NOT EXISTS idx_stok_ringkasan_kode_gudang
  ON public.stok_obat_ringkasan_bulanan (kode_obat, gudang);

ALTER TABLE public.stok_obat_ringkasan_bulanan ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.stok_obat_ringkasan_bulanan IS
  'Hasil padat data stok >3 bulan: 1 baris per kode_obat × gudang × bulan';
COMMENT ON COLUMN public.stok_obat_ringkasan_bulanan.bulan IS
  'Tanggal 1 di bulan itu (mis. 2026-04-01 = April 2026)';
COMMENT ON COLUMN public.stok_obat_ringkasan_bulanan.gudang IS
  'Gudang terpisah — ringkasan tidak digabung lintas gudang';

-- ---------------------------------------------------------------------------
-- 4. Seed menu + aksi
-- ---------------------------------------------------------------------------
INSERT INTO public.menus (kode, label, urutan)
VALUES
  ('stok', 'Stok', 60)
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
    ('hapus', 'Hapus')
) AS a (kode_aksi, label)
WHERE m.kode = 'stok'
ON CONFLICT (menu_id, kode_aksi) DO UPDATE
SET label = EXCLUDED.label;

-- ---------------------------------------------------------------------------
-- 5. RPC ringkas (satu transaksi) — per kode_obat × gudang × bulan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ringkas_stok_obat_lama(
  p_cutoff TIMESTAMPTZ DEFAULT (now() - INTERVAL '3 months')
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pairs INTEGER := 0;
  v_kode INTEGER := 0;
  v_deleted INTEGER := 0;
  v_bulan_min DATE;
  v_bulan_max DATE;
BEGIN
  CREATE TEMP TABLE tmp_stok_ringkas (
    kode_obat TEXT NOT NULL,
    gudang TEXT NOT NULL,
    bulan DATE NOT NULL,
    snapshot_at TIMESTAMPTZ NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_stok_ringkas (kode_obat, gudang, bulan, snapshot_at)
  SELECT sub.kode_obat, sub.gudang, sub.bulan, sub.snapshot_at
  FROM (
    SELECT
      s.kode_obat,
      s.gudang,
      (date_trunc('month', s.tanggal_upload AT TIME ZONE 'Asia/Jakarta'))::date AS bulan,
      MAX(s.tanggal_upload) AS snapshot_at
    FROM public.stok_obat s
    WHERE s.tanggal_upload < p_cutoff
    GROUP BY
      s.kode_obat,
      s.gudang,
      (date_trunc('month', s.tanggal_upload AT TIME ZONE 'Asia/Jakarta'))::date
  ) sub
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.stok_obat_ringkasan_bulanan r
    WHERE r.kode_obat = sub.kode_obat
      AND r.gudang = sub.gudang
      AND r.bulan = sub.bulan
  );

  SELECT COUNT(*), COUNT(DISTINCT kode_obat), MIN(bulan), MAX(bulan)
  INTO v_pairs, v_kode, v_bulan_min, v_bulan_max
  FROM tmp_stok_ringkas;

  IF v_pairs = 0 THEN
    RETURN jsonb_build_object(
      'kode_obat_diringkas', 0,
      'pasangan_kode_bulan', 0,
      'baris_detail_dihapus', 0,
      'bulan_dari', NULL,
      'bulan_sampai', NULL,
      'cutoff', p_cutoff
    );
  END IF;

  INSERT INTO public.stok_obat_ringkasan_bulanan (
    kode_obat,
    gudang,
    bulan,
    stok_akhir_bulan,
    harga_1_akhir,
    harga_2_akhir,
    harga_3_akhir,
    dibuat_saat
  )
  SELECT
    t.kode_obat,
    t.gudang,
    t.bulan,
    COALESCE(SUM(s.stok_qty), 0),
    (ARRAY_AGG(s.harga_1 ORDER BY s.id))[1],
    (ARRAY_AGG(s.harga_2 ORDER BY s.id))[1],
    (ARRAY_AGG(s.harga_3 ORDER BY s.id))[1],
    now()
  FROM tmp_stok_ringkas t
  INNER JOIN public.stok_obat s
    ON s.kode_obat = t.kode_obat
   AND s.gudang = t.gudang
   AND s.tanggal_upload = t.snapshot_at
  GROUP BY t.kode_obat, t.gudang, t.bulan
  ON CONFLICT (kode_obat, gudang, bulan) DO NOTHING;

  WITH deleted AS (
    DELETE FROM public.stok_obat s
    WHERE s.tanggal_upload < p_cutoff
      AND EXISTS (
        SELECT 1
        FROM public.stok_obat_ringkasan_bulanan r
        WHERE r.kode_obat = s.kode_obat
          AND r.gudang = s.gudang
          AND r.bulan = (date_trunc('month', s.tanggal_upload AT TIME ZONE 'Asia/Jakarta'))::date
      )
    RETURNING s.id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN jsonb_build_object(
    'kode_obat_diringkas', v_kode,
    'pasangan_kode_bulan', v_pairs,
    'baris_detail_dihapus', v_deleted,
    'bulan_dari', v_bulan_min,
    'bulan_sampai', v_bulan_max,
    'cutoff', p_cutoff
  );
END;
$$;

COMMENT ON FUNCTION public.ringkas_stok_obat_lama(TIMESTAMPTZ) IS
  'Padatkan stok_obat >3 bulan ke ringkasan (per kode×gudang×bulan) lalu hapus detail — atomic';

REVOKE ALL ON FUNCTION public.ringkas_stok_obat_lama(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ringkas_stok_obat_lama(TIMESTAMPTZ) TO service_role;
