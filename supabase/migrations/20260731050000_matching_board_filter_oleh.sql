-- Filter board by submitter nick (dipilih_oleh / diusulkan_oleh).

DROP FUNCTION IF EXISTS public.matching_board_counts(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.matching_board_page(uuid, text, text, int, int, timestamptz);

CREATE OR REPLACE FUNCTION public.matching_board_counts(
  p_pbf_id uuid,
  p_tanggal_upload timestamptz DEFAULT NULL,
  p_oleh text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_match int := 0;
  v_menunggu int := 0;
  v_belum int := 0;
  v_no_match int := 0;
  v_oleh text := lower(trim(coalesce(p_oleh, '')));
BEGIN
  IF v_oleh = '' THEN
    v_oleh := NULL;
  END IF;

  WITH latest_pl AS (
    SELECT DISTINCT ON (pl.kode_pbf)
      pl.kode_pbf
    FROM public.pricelist pl
    WHERE pl.pbf_id = p_pbf_id
      AND pl.dihapus_pada IS NULL
      AND (
        p_tanggal_upload IS NULL
        OR pl.tanggal_upload = p_tanggal_upload
      )
      AND (
        p_tanggal_upload IS NULL
        OR COALESCE(pl.auto_kosong, false) = false
      )
    ORDER BY pl.kode_pbf, pl.tanggal_upload DESC, pl.id DESC
  ),
  active_m AS (
    SELECT DISTINCT ON (m.pricelist_kode_pbf)
      m.pricelist_kode_pbf,
      m.status,
      m.kode_obat_yelo,
      m.dipilih_oleh,
      m.diusulkan_oleh
    FROM public.matching m
    WHERE m.pricelist_pbf_id = p_pbf_id
    ORDER BY
      m.pricelist_kode_pbf,
      CASE m.status
        WHEN 'terverifikasi' THEN 3
        WHEN 'menunggu_verifikasi' THEN 2
        WHEN 'ditolak' THEN 1
        ELSE 0
      END DESC,
      m.updated_at DESC NULLS LAST
  ),
  joined AS (
    SELECT
      pl.kode_pbf,
      m.status,
      m.kode_obat_yelo,
      m.dipilih_oleh,
      m.diusulkan_oleh,
      (
        v_oleh IS NULL
        OR lower(trim(coalesce(m.dipilih_oleh, ''))) = v_oleh
        OR lower(trim(coalesce(m.diusulkan_oleh, ''))) = v_oleh
      ) AS actor_ok
    FROM latest_pl pl
    LEFT JOIN active_m m ON m.pricelist_kode_pbf = pl.kode_pbf
  )
  SELECT
    COUNT(DISTINCT CASE
      WHEN status = 'terverifikasi'
        AND kode_obat_yelo IS NOT NULL
        AND actor_ok
      THEN kode_obat_yelo
    END)::int,
    COUNT(*) FILTER (
      WHERE status = 'menunggu_verifikasi' AND actor_ok
    )::int,
    COUNT(*) FILTER (
      WHERE v_oleh IS NULL
        AND (status IS NULL OR status = 'usulan')
    )::int,
    COUNT(*) FILTER (
      WHERE status = 'ditolak' AND actor_ok
    )::int
  INTO v_match, v_menunggu, v_belum, v_no_match
  FROM joined;

  RETURN jsonb_build_object(
    'match', COALESCE(v_match, 0),
    'menunggu', COALESCE(v_menunggu, 0),
    'belum', COALESCE(v_belum, 0),
    'no_match', COALESCE(v_no_match, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.matching_board_page(
  p_pbf_id uuid,
  p_status text DEFAULT 'all',
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 40,
  p_offset int DEFAULT 0,
  p_tanggal_upload timestamptz DEFAULT NULL,
  p_oleh text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_status text := lower(coalesce(nullif(trim(p_status), ''), 'all'));
  v_search text := nullif(trim(p_search), '');
  v_oleh text := lower(trim(coalesce(p_oleh, '')));
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 40), 100));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_total int := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF v_status IN ('belum_diajukan', 'blm_diajukan') THEN
    v_status := 'belum';
  ELSIF v_status IN ('no_data', 'nodata') THEN
    v_status := 'no_match';
  END IF;
  IF v_oleh = '' THEN
    v_oleh := NULL;
  END IF;

  WITH latest_pl AS (
    SELECT DISTINCT ON (pl.kode_pbf)
      pl.id,
      pl.kode_pbf,
      pl.nama_barang,
      pl.satuan,
      pl.qty,
      pl.harga_dasar,
      pl.catatan_kondisi,
      pl.diskon,
      pl.tanggal_upload,
      pl.auto_kosong,
      pl.dihapus_pada
    FROM public.pricelist pl
    WHERE pl.pbf_id = p_pbf_id
      AND pl.dihapus_pada IS NULL
      AND (
        p_tanggal_upload IS NULL
        OR pl.tanggal_upload = p_tanggal_upload
      )
      AND (
        p_tanggal_upload IS NULL
        OR COALESCE(pl.auto_kosong, false) = false
      )
    ORDER BY pl.kode_pbf, pl.tanggal_upload DESC, pl.id DESC
  ),
  active_m AS (
    SELECT DISTINCT ON (m.pricelist_kode_pbf)
      m.id AS matching_id,
      m.pricelist_kode_pbf,
      m.status,
      m.kode_obat_yelo,
      m.dipilih_oleh,
      m.diusulkan_oleh
    FROM public.matching m
    WHERE m.pricelist_pbf_id = p_pbf_id
    ORDER BY
      m.pricelist_kode_pbf,
      CASE m.status
        WHEN 'terverifikasi' THEN 3
        WHEN 'menunggu_verifikasi' THEN 2
        WHEN 'ditolak' THEN 1
        ELSE 0
      END DESC,
      m.updated_at DESC NULLS LAST
  ),
  match_keys AS (
    SELECT DISTINCT
      am.kode_obat_yelo,
      COALESCE(oy.nama_obat, am.kode_obat_yelo) AS nama_obat
    FROM latest_pl pl
    JOIN active_m am ON am.pricelist_kode_pbf = pl.kode_pbf
    LEFT JOIN public.obat_yelo oy ON oy.kode_obat = am.kode_obat_yelo
    WHERE am.status = 'terverifikasi'
      AND am.kode_obat_yelo IS NOT NULL
      AND (
        v_oleh IS NULL
        OR lower(trim(coalesce(am.dipilih_oleh, ''))) = v_oleh
        OR lower(trim(coalesce(am.diusulkan_oleh, ''))) = v_oleh
      )
      AND (
        v_search IS NULL
        OR pl.nama_barang ILIKE '%' || v_search || '%'
        OR pl.kode_pbf ILIKE '%' || v_search || '%'
        OR am.kode_obat_yelo ILIKE '%' || v_search || '%'
        OR COALESCE(oy.nama_obat, '') ILIKE '%' || v_search || '%'
      )
  ),
  action_rows AS (
    SELECT
      pl.*,
      am.matching_id,
      am.status AS matching_status,
      am.kode_obat_yelo,
      am.dipilih_oleh,
      am.diusulkan_oleh,
      CASE
        WHEN am.status = 'menunggu_verifikasi' THEN 'pending'
        WHEN am.status = 'ditolak' THEN 'rejected'
        ELSE 'unmatched'
      END AS kind
    FROM latest_pl pl
    LEFT JOIN active_m am ON am.pricelist_kode_pbf = pl.kode_pbf
    WHERE COALESCE(am.status, '') <> 'terverifikasi'
      AND (
        v_oleh IS NULL
        OR (
          am.status IN ('menunggu_verifikasi', 'ditolak')
          AND (
            lower(trim(coalesce(am.dipilih_oleh, ''))) = v_oleh
            OR lower(trim(coalesce(am.diusulkan_oleh, ''))) = v_oleh
          )
        )
      )
      AND (
        v_search IS NULL
        OR pl.nama_barang ILIKE '%' || v_search || '%'
        OR pl.kode_pbf ILIKE '%' || v_search || '%'
      )
  ),
  filtered_actions AS (
    SELECT *
    FROM action_rows
    WHERE
      CASE v_status
        WHEN 'menunggu' THEN kind = 'pending'
        WHEN 'belum' THEN kind = 'unmatched'
        WHEN 'no_match' THEN kind = 'rejected'
        WHEN 'all' THEN true
        ELSE false
      END
  ),
  unioned AS (
    SELECT
      0 AS sort_rank,
      mk.nama_obat AS sort_name,
      jsonb_build_object(
        'kind', 'match',
        'kode_obat_yelo', mk.kode_obat_yelo,
        'nama_obat', mk.nama_obat
      ) AS item
    FROM match_keys mk
    WHERE v_status IN ('all', 'match')

    UNION ALL

    SELECT
      CASE fa.kind
        WHEN 'pending' THEN 1
        WHEN 'unmatched' THEN 2
        ELSE 3
      END AS sort_rank,
      fa.nama_barang AS sort_name,
      jsonb_build_object(
        'kind', fa.kind,
        'matching_id', fa.matching_id,
        'kode_obat_yelo', fa.kode_obat_yelo,
        'dipilih_oleh', fa.dipilih_oleh,
        'diusulkan_oleh', fa.diusulkan_oleh,
        'pricelist', jsonb_build_object(
          'id', fa.id,
          'kode_pbf', fa.kode_pbf,
          'nama_barang', fa.nama_barang,
          'satuan', fa.satuan,
          'qty', fa.qty,
          'harga_dasar', fa.harga_dasar,
          'catatan_kondisi', fa.catatan_kondisi,
          'diskon', fa.diskon,
          'tanggal_upload', fa.tanggal_upload,
          'auto_kosong', fa.auto_kosong,
          'pbf_id', p_pbf_id
        )
      ) AS item
    FROM filtered_actions fa
    WHERE v_status <> 'match'
  ),
  ordered AS (
    SELECT item, ROW_NUMBER() OVER (ORDER BY sort_rank, sort_name ASC) AS rn
    FROM unioned
  ),
  counted AS (
    SELECT COUNT(*)::int AS total FROM ordered
  ),
  page AS (
    SELECT COALESCE(jsonb_agg(item ORDER BY rn), '[]'::jsonb) AS items
    FROM ordered
    WHERE rn > v_offset AND rn <= v_offset + v_limit
  )
  SELECT counted.total, page.items
  INTO v_total, v_items
  FROM counted, page;

  RETURN jsonb_build_object(
    'total_count', COALESCE(v_total, 0),
    'has_more', COALESCE(v_total, 0) > (v_offset + v_limit),
    'limit', v_limit,
    'offset', v_offset,
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.matching_board_counts(uuid, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.matching_board_counts(uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.matching_board_page(uuid, text, text, int, int, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.matching_board_page(uuid, text, text, int, int, timestamptz, text) TO authenticated;

COMMENT ON FUNCTION public.matching_board_counts IS
  'Board counts; optional p_oleh filters by dipilih_oleh/diusulkan_oleh (belum=0 when oleh set).';
COMMENT ON FUNCTION public.matching_board_page IS
  'Paginated board; optional p_oleh keeps only rows for that submitter nick.';
