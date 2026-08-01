-- FO: izinkan tombol "+ Data Obat" di Matching (butuh lihat + tambah)
-- lihat = next-kode-app + list ref; tambah = create dari matching
INSERT INTO public.group_permissions (group_id, menu_aksi_id)
SELECT g.id, ma.id
FROM public.groups g
JOIN public.menus m ON m.kode = 'data-obat-yelo'
JOIN public.menu_aksi ma
  ON ma.menu_id = m.id
 AND ma.kode_aksi IN ('lihat', 'tambah')
WHERE g.nama = 'FO'
ON CONFLICT (group_id, menu_aksi_id) DO NOTHING;
