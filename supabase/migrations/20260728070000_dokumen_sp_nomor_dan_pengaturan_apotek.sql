--  3a Pembuatan SP: data pendukung generate PDF SP asli.
-- Belum generate PDF di tahap ini — baru siapkan skema + nomor SP.

-- ---------------------------------------------------------------------------
-- obat_yelo: kolom tambahan untuk isi dokumen SP (diisi manual via SQL oleh
-- owner; belum ada form UI untuk kolom ini)
-- ---------------------------------------------------------------------------
ALTER TABLE public.obat_yelo
  ADD COLUMN IF NOT EXISTS zat_aktif TEXT,
  ADD COLUMN IF NOT EXISTS bentuk_sediaan TEXT;

COMMENT ON COLUMN public.obat_yelo.zat_aktif IS
  'Kandungan zat aktif untuk cetak dokumen SP; diisi manual via SQL, belum ada form UI';
COMMENT ON COLUMN public.obat_yelo.bentuk_sediaan IS
  'Bentuk sediaan (tablet/kapsul/sirup/dst) untuk cetak dokumen SP; diisi manual via SQL, belum ada form UI';

-- ---------------------------------------------------------------------------
-- pengaturan_apotek: single-row config identitas apotek untuk kop dokumen SP.
-- inisial dipakai untuk generate nomor_sp (SP[inisial][YYMMDD][XXX]).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pengaturan_apotek (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama_apotek TEXT NOT NULL,
  inisial TEXT NOT NULL,
  alamat TEXT,
  no_sia TEXT,
  nama_apj TEXT,
  no_sipa TEXT,
  telp_apotek TEXT,
  email_apotek TEXT,
  diubah_oleh TEXT,
  diubah_saat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pengaturan_apotek ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.pengaturan_apotek IS
  'Identitas apotek (single-row config) untuk kop/header dokumen SP; inisial dipakai generate nomor_sp';
COMMENT ON COLUMN public.pengaturan_apotek.inisial IS
  'Kode inisial apotek untuk nomor SP, mis. YEL → SPYEL260728001';
COMMENT ON COLUMN public.pengaturan_apotek.no_sia IS
  'Nomor Surat Izin Apotek';
COMMENT ON COLUMN public.pengaturan_apotek.nama_apj IS
  'Nama Apoteker Penanggung Jawab';

-- Seed 1 baris data awal (hanya kalau tabel masih kosong)
INSERT INTO public.pengaturan_apotek (
  nama_apotek, inisial, alamat, no_sia, nama_apj, no_sipa, telp_apotek, email_apotek
)
SELECT
  'Apotek Yelo',
  'YEL',
  'Plumbungan Gedangrejo Kab. Gunungkidul',
  '12570004815930002',
  'apt. Ika Pitraresna C., M.Farm',
  '0065/SP/XI/2023',
  '085176995719',
  'yelo.apotek@gmail.com'
WHERE NOT EXISTS (SELECT 1 FROM public.pengaturan_apotek LIMIT 1);

-- ---------------------------------------------------------------------------
-- dokumen_sp: nomor SP unik per dokumen (setiap dokumen baru, termasuk revisi
-- versi 1/2/dst, dapat nomor baru sendiri — bukan update nomor lama)
-- ---------------------------------------------------------------------------
ALTER TABLE public.dokumen_sp
  ADD COLUMN IF NOT EXISTS nomor_sp TEXT;

ALTER TABLE public.dokumen_sp
  DROP CONSTRAINT IF EXISTS dokumen_sp_nomor_sp_unique;
ALTER TABLE public.dokumen_sp
  ADD CONSTRAINT dokumen_sp_nomor_sp_unique UNIQUE (nomor_sp);

COMMENT ON COLUMN public.dokumen_sp.nomor_sp IS
  'Format SP[inisial][YYMMDD][XXX] — XXX urut global lintas golongan/kategori/PBF, reset tiap hari; tiap dokumen baru (termasuk revisi) dapat nomor sendiri';

-- ---------------------------------------------------------------------------
-- Counter atomik nomor urut SP per hari (global lintas golongan/kategori/PBF).
-- Pakai INSERT ... ON CONFLICT DO UPDATE ... RETURNING supaya increment aman
-- dari race condition kalau beberapa dokumen digenerate bersamaan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dokumen_sp_nomor_counter (
  tanggal DATE PRIMARY KEY,
  counter INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.dokumen_sp_nomor_counter ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.dokumen_sp_nomor_counter IS
  'Counter nomor urut SP per tanggal (global lintas golongan/kategori/PBF); dipakai fungsi next_nomor_sp_urut';

CREATE OR REPLACE FUNCTION public.next_nomor_sp_urut(p_tanggal DATE)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_counter INTEGER;
BEGIN
  INSERT INTO public.dokumen_sp_nomor_counter AS c (tanggal, counter)
  VALUES (p_tanggal, 1)
  ON CONFLICT (tanggal) DO UPDATE
    SET counter = c.counter + 1
  RETURNING c.counter INTO v_counter;
  RETURN v_counter;
END;
$$;

COMMENT ON FUNCTION public.next_nomor_sp_urut(DATE) IS
  'Ambil nomor urut berikutnya (atomik) untuk 1 tanggal; dipakai generate nomor_sp dokumen_sp';

GRANT EXECUTE ON FUNCTION public.next_nomor_sp_urut(DATE) TO service_role;
