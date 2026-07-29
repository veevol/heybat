-- Grup akses FO (Front Office): Supplier lihat + Matching tanpa edit/hapus/verifikasi
INSERT INTO public.groups (nama)
VALUES ('FO')
ON CONFLICT (nama) DO NOTHING;

-- data-supplier: lihat
INSERT INTO public.group_permissions (group_id, menu_aksi_id)
SELECT g.id, ma.id
FROM public.groups g
JOIN public.menus m ON m.kode = 'data-supplier'
JOIN public.menu_aksi ma ON ma.menu_id = m.id AND ma.kode_aksi = 'lihat'
WHERE g.nama = 'FO'
ON CONFLICT (group_id, menu_aksi_id) DO NOTHING;

-- matching: lihat, tambah, usulkan (bukan edit / hapus / verifikasi)
INSERT INTO public.group_permissions (group_id, menu_aksi_id)
SELECT g.id, ma.id
FROM public.groups g
JOIN public.menus m ON m.kode = 'matching'
JOIN public.menu_aksi ma
  ON ma.menu_id = m.id
 AND ma.kode_aksi IN ('lihat', 'tambah', 'usulkan')
WHERE g.nama = 'FO'
ON CONFLICT (group_id, menu_aksi_id) DO NOTHING;

-- pricelist-pbf: lihat + tambah (upload pricelist dari board Matching)
INSERT INTO public.group_permissions (group_id, menu_aksi_id)
SELECT g.id, ma.id
FROM public.groups g
JOIN public.menus m ON m.kode = 'pricelist-pbf'
JOIN public.menu_aksi ma
  ON ma.menu_id = m.id
 AND ma.kode_aksi IN ('lihat', 'tambah')
WHERE g.nama = 'FO'
ON CONFLICT (group_id, menu_aksi_id) DO NOTHING;
