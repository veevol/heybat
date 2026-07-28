-- Kolom kota eksplisit di pengaturan_apotek, menggantikan pendekatan regex
-- ekstraksi "Kab./Kota" dari kolom alamat bebas teks (rapuh, gampang salah
-- kalau format alamat berubah). Dipakai di baris "[Kab/Kota],[tanggal]" pada
-- Template 2 SP (Prekursor/Psikotropika/OOT).
ALTER TABLE public.pengaturan_apotek
  ADD COLUMN IF NOT EXISTS kota TEXT;

COMMENT ON COLUMN public.pengaturan_apotek.kota IS
  'Kabupaten/Kota apotek untuk baris tanda tangan SP, mis. "Kab. Gunungkidul". Diisi manual, tidak diekstrak dari alamat.';

UPDATE public.pengaturan_apotek
SET kota = 'Kab. Gunungkidul'
WHERE kota IS NULL;
