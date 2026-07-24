-- Auth app profile + layered Menu×Aksi permissions (Group-based)
-- Backend uses service_role (bypasses RLS). No public policies by default.
--
-- First-user-as-owner (is_owner=true, status=aktif when users count=0)
-- is enforced in backend requireAuth on first insert — not a DB trigger.

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'user_status' AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.user_status AS ENUM ('menunggu', 'aktif');
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nama TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT groups_nama_unique UNIQUE (nama)
);

COMMENT ON TABLE public.groups IS 'Grup akses; izin Menu×Aksi di group_permissions';

-- ---------------------------------------------------------------------------
-- users (app profile; id mirrors auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nama TEXT,
  status public.user_status NOT NULL DEFAULT 'menunggu',
  is_owner BOOLEAN NOT NULL DEFAULT false,
  group_id UUID REFERENCES public.groups (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_status ON public.users (status);
CREATE INDEX IF NOT EXISTS idx_users_group_id ON public.users (group_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

COMMENT ON TABLE public.users IS
  'Profil app Heybat; id = auth.users.id. Owner pertama di-set oleh backend saat insert pertama.';
COMMENT ON COLUMN public.users.status IS
  'menunggu = belum disetujui owner; aktif = boleh pakai app';
COMMENT ON COLUMN public.users.is_owner IS
  'true = bypass semua group_permissions; di-set true hanya untuk user pertama (atau manual)';

-- ---------------------------------------------------------------------------
-- menus
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode TEXT NOT NULL,
  label TEXT NOT NULL,
  urutan INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT menus_kode_unique UNIQUE (kode)
);

CREATE INDEX IF NOT EXISTS idx_menus_urutan ON public.menus (urutan);

COMMENT ON TABLE public.menus IS 'Menu aplikasi (slug kode dipakai di requireMenuAksi)';

-- ---------------------------------------------------------------------------
-- menu_aksi
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu_aksi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id UUID NOT NULL REFERENCES public.menus (id) ON DELETE CASCADE,
  kode_aksi TEXT NOT NULL,
  label TEXT NOT NULL,
  CONSTRAINT menu_aksi_menu_kode_unique UNIQUE (menu_id, kode_aksi)
);

CREATE INDEX IF NOT EXISTS idx_menu_aksi_menu_id ON public.menu_aksi (menu_id);

COMMENT ON TABLE public.menu_aksi IS
  'Aksi per menu (lihat, tambah, edit, hapus, usulkan, verifikasi, …)';

-- ---------------------------------------------------------------------------
-- group_permissions (baris ada = izin diberikan)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_permissions (
  group_id UUID NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  menu_aksi_id UUID NOT NULL REFERENCES public.menu_aksi (id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, menu_aksi_id)
);

CREATE INDEX IF NOT EXISTS idx_group_permissions_menu_aksi
  ON public.group_permissions (menu_aksi_id);

COMMENT ON TABLE public.group_permissions IS
  'Izin grup: unique(group_id, menu_aksi_id); ada baris = diizinkan';

-- ---------------------------------------------------------------------------
-- RLS (service_role bypass; anon/authenticated blocked by default)
-- ---------------------------------------------------------------------------
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_aksi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_permissions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Seed menus + aksi dasar
-- ---------------------------------------------------------------------------
INSERT INTO public.menus (kode, label, urutan)
VALUES
  ('data-supplier', 'Data Supplier', 10),
  ('pricelist-pbf', 'Pricelist PBF', 20),
  ('matching', 'Matching', 30),
  ('data-obat-yelo', 'Data Obat Yelo', 40)
ON CONFLICT (kode) DO UPDATE
SET
  label = EXCLUDED.label,
  urutan = EXCLUDED.urutan;

-- Aksi dasar untuk semua menu
INSERT INTO public.menu_aksi (menu_id, kode_aksi, label)
SELECT m.id, a.kode_aksi, a.label
FROM public.menus m
CROSS JOIN (
  VALUES
    ('lihat', 'Lihat'),
    ('tambah', 'Tambah'),
    ('edit', 'Edit'),
    ('hapus', 'Hapus')
) AS a (kode_aksi, label)
WHERE m.kode IN ('data-supplier', 'pricelist-pbf', 'matching', 'data-obat-yelo')
ON CONFLICT (menu_id, kode_aksi) DO UPDATE
SET label = EXCLUDED.label;

-- Aksi tambahan khusus Matching
INSERT INTO public.menu_aksi (menu_id, kode_aksi, label)
SELECT m.id, a.kode_aksi, a.label
FROM public.menus m
CROSS JOIN (
  VALUES
    ('usulkan', 'Usulkan'),
    ('verifikasi', 'Verifikasi')
) AS a (kode_aksi, label)
WHERE m.kode = 'matching'
ON CONFLICT (menu_id, kode_aksi) DO UPDATE
SET label = EXCLUDED.label;
