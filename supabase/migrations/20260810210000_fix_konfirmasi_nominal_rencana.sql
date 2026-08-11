-- Fix: konfirmasi bayar pakai nominal_rencana (bukan selalu sisa penuh)
-- Jalankan di Supabase SQL Editor

CREATE OR REPLACE FUNCTION public.konfirmasi_rencana_bayar(
  p_rencana_id BIGINT,
  p_aktor TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r public.rencana_bayar%ROWTYPE;
  item RECORD;
  faktur_total NUMERIC;
  total_bayar NUMERIC;
  sisa NUMERIC;
  lunas_manual BOOLEAN;
  nominal_bayar NUMERIC;
  total_nominal NUMERIC := 0;
  jumlah INT := 0;
  jumlah_lewati INT := 0;
  ada_penyesuaian BOOLEAN := false;
  aktor TEXT := NULLIF(trim(COALESCE(p_aktor, '')), '');
BEGIN
  IF aktor IS NULL THEN
    aktor := 'staf';
  END IF;

  SELECT * INTO r
  FROM public.rencana_bayar
  WHERE id = p_rencana_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Jadwal bayar tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;

  IF r.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Jadwal bayar bukan status draft' USING ERRCODE = 'P0001';
  END IF;

  IF r.tanggal_rencana IS NULL THEN
    RAISE EXCEPTION 'tanggal_rencana wajib diisi sebelum konfirmasi' USING ERRCODE = 'P0001';
  END IF;

  FOR item IN
    SELECT i.*
    FROM public.rencana_bayar_item i
    WHERE i.rencana_bayar_id = p_rencana_id
    ORDER BY i.id
  LOOP
    SELECT
      COALESCE(f.total_transaksi, 0),
      COALESCE((
        SELECT SUM(p.nominal)
        FROM public.pembayaran_hutang p
        WHERE p.faktur_id = f.id
      ), 0),
      COALESCE((
        SELECT bool_or(p.ditandai_lunas_manual)
        FROM public.pembayaran_hutang p
        WHERE p.faktur_id = f.id
      ), false)
    INTO faktur_total, total_bayar, lunas_manual
    FROM public.pembelian_faktur f
    WHERE f.id = item.faktur_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Faktur % tidak ditemukan', item.faktur_id
        USING ERRCODE = 'P0002';
    END IF;

    sisa := faktur_total - total_bayar;
    IF sisa < 0 THEN
      sisa := 0;
    END IF;

    IF lunas_manual OR sisa <= 0 THEN
      ada_penyesuaian := true;
      jumlah_lewati := jumlah_lewati + 1;
      CONTINUE;
    END IF;

    -- Bayar sesuai nominal rencana; cap ke sisa real-time agar tidak overpay
    nominal_bayar := COALESCE(item.nominal_rencana, 0);
    IF nominal_bayar <= 0 THEN
      ada_penyesuaian := true;
      jumlah_lewati := jumlah_lewati + 1;
      CONTINUE;
    END IF;

    IF nominal_bayar > sisa THEN
      nominal_bayar := sisa;
      ada_penyesuaian := true;
    ELSIF sisa IS DISTINCT FROM item.sisa_hutang_saat_disimpan THEN
      ada_penyesuaian := true;
    END IF;

    INSERT INTO public.pembayaran_hutang (
      faktur_id,
      tanggal_bayar,
      nominal,
      metode_bayar,
      catatan,
      ditandai_lunas_manual,
      diinput_oleh,
      tanggal_input
    ) VALUES (
      item.faktur_id,
      r.tanggal_rencana,
      nominal_bayar,
      r.metode_bayar,
      r.catatan,
      false,
      aktor,
      now()
    );

    total_nominal := total_nominal + nominal_bayar;
    jumlah := jumlah + 1;
  END LOOP;

  IF jumlah < 1 THEN
    RAISE EXCEPTION 'Tidak ada faktur yang bisa dikonfirmasi (semua sudah lunas / sisa 0)'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.rencana_bayar
  SET
    status = 'dikonfirmasi',
    dikonfirmasi_oleh = aktor,
    tanggal_konfirmasi = now()
  WHERE id = p_rencana_id;

  RETURN jsonb_build_object(
    'rencana_bayar_id', p_rencana_id,
    'nama_supplier', r.nama_supplier,
    'jumlah_faktur', jumlah,
    'jumlah_dilewati', jumlah_lewati,
    'total_nominal', total_nominal,
    'ada_penyesuaian', ada_penyesuaian,
    'tanggal_bayar', r.tanggal_rencana,
    'dikonfirmasi_oleh', aktor
  );
END;
$$;

COMMENT ON FUNCTION public.konfirmasi_rencana_bayar(BIGINT, TEXT) IS
  'Konfirmasi draft: insert pembayaran_hutang dengan nominal_rencana (cap sisa real-time) + set dikonfirmasi, atomic';
