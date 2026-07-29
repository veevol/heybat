-- Profil user untuk halaman Akun
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS nick_nama TEXT,
  ADD COLUMN IF NOT EXISTS nama_lengkap TEXT,
  ADD COLUMN IF NOT EXISTS jenis_kelamin TEXT,
  ADD COLUMN IF NOT EXISTS no_wa TEXT,
  ADD COLUMN IF NOT EXISTS jabatan TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_jenis_kelamin_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_jenis_kelamin_check
  CHECK (
    jenis_kelamin IS NULL
    OR jenis_kelamin IN ('L', 'P')
  );

COMMENT ON COLUMN public.users.nama IS
  'Legacy display name; prefer nick_nama untuk sapaan di UI';
COMMENT ON COLUMN public.users.nick_nama IS
  'Nama panggilan (default dari Google); editable';
COMMENT ON COLUMN public.users.nama_lengkap IS
  'Nama lengkap formal (dokumen / SP)';
COMMENT ON COLUMN public.users.jenis_kelamin IS
  'L atau P — sapaan';
COMMENT ON COLUMN public.users.no_wa IS
  'Nomor WhatsApp user';
COMMENT ON COLUMN public.users.jabatan IS
  'Jabatan / peran di apotek (teks bebas)';
COMMENT ON COLUMN public.users.avatar_url IS
  'URL avatar; default foto Google saat first login';

-- Isi nick dari nama lama bila kosong
UPDATE public.users
SET nick_nama = COALESCE(NULLIF(trim(nick_nama), ''), NULLIF(trim(nama), ''))
WHERE nick_nama IS NULL AND nama IS NOT NULL;
