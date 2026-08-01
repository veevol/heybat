-- Ringkas Data Lama: cutoff default dari >3 bulan menjadi >12 bulan
-- (API tetap mengirim p_cutoff eksplisit; default ini untuk panggilan RPC langsung.)

COMMENT ON TABLE public.stok_obat_ringkasan_bulanan IS
  'Hasil padat data stok >12 bulan: 1 baris per kode_obat × gudang × bulan';

CREATE OR REPLACE FUNCTION public.ringkas_stok_obat_lama(
  p_cutoff TIMESTAMPTZ DEFAULT (now() - INTERVAL '12 months')
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
  'Padatkan stok_obat >12 bulan ke ringkasan (per kode×gudang×bulan) lalu hapus detail — atomic';
