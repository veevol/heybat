const express = require('express');
const { supabase } = require('../db');
const {
  requireAuth,
  requireApproved,
  requireOwner,
} = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireApproved, requireOwner);

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function rejectOwnerMutation(body, res) {
  if (
    body &&
    Object.prototype.hasOwnProperty.call(body, 'is_owner')
  ) {
    res.status(400).json({
      error: 'Field is_owner tidak boleh diubah lewat API ini',
    });
    return true;
  }
  return false;
}

/** GET /api/kelola-akses/users-menunggu */
router.get('/users-menunggu', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, nama, status, is_owner, group_id, created_at')
      .eq('status', 'menunggu')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('[GET /kelola-akses/users-menunggu]', err);
    return res.status(500).json({ error: 'Gagal mengambil user menunggu' });
  }
});

/** GET /api/kelola-akses/users */
router.get('/users', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(
        `
        id,
        email,
        nama,
        status,
        is_owner,
        group_id,
        created_at,
        group:groups ( id, nama )
      `
      )
      .order('created_at', { ascending: true });

    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('[GET /kelola-akses/users]', err);
    return res.status(500).json({ error: 'Gagal mengambil daftar user' });
  }
});

/** GET /api/kelola-akses/groups */
router.get('/groups', async (_req, res) => {
  try {
    const { data: groups, error } = await supabase
      .from('groups')
      .select('id, nama, created_at')
      .order('nama', { ascending: true });
    if (error) throw error;

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('group_id')
      .not('group_id', 'is', null);
    if (usersError) throw usersError;

    const counts = new Map();
    for (const u of users || []) {
      counts.set(u.group_id, (counts.get(u.group_id) || 0) + 1);
    }

    return res.json(
      (groups || []).map((g) => ({
        ...g,
        anggota_count: counts.get(g.id) || 0,
      }))
    );
  } catch (err) {
    console.error('[GET /kelola-akses/groups]', err);
    return res.status(500).json({ error: 'Gagal mengambil daftar group' });
  }
});

/** POST /api/kelola-akses/groups */
router.post('/groups', async (req, res) => {
  try {
    if (rejectOwnerMutation(req.body, res)) return;

    const nama = normalizeText(req.body?.nama);
    if (!nama) {
      return res.status(400).json({ error: 'nama group wajib diisi' });
    }

    const { data, error } = await supabase
      .from('groups')
      .insert({ nama })
      .select('id, nama, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Nama group sudah dipakai' });
      }
      throw error;
    }

    return res.status(201).json({ ...data, anggota_count: 0 });
  } catch (err) {
    console.error('[POST /kelola-akses/groups]', err);
    return res.status(500).json({ error: 'Gagal membuat group' });
  }
});

/** GET /api/kelola-akses/groups/:id */
router.get('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: group, error } = await supabase
      .from('groups')
      .select('id, nama, created_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!group) {
      return res.status(404).json({ error: 'Group tidak ditemukan' });
    }

    const { data: menus, error: menusError } = await supabase
      .from('menus')
      .select(
        `
        id,
        kode,
        label,
        urutan,
        aksi:menu_aksi ( id, kode_aksi, label )
      `
      )
      .order('urutan', { ascending: true });
    if (menusError) throw menusError;

    const { data: perms, error: permsError } = await supabase
      .from('group_permissions')
      .select('menu_aksi_id')
      .eq('group_id', id);
    if (permsError) throw permsError;

    const granted = new Set((perms || []).map((p) => p.menu_aksi_id));

    const menusOut = (menus || []).map((m) => ({
      id: m.id,
      kode: m.kode,
      label: m.label,
      urutan: m.urutan,
      aksi: (m.aksi || [])
        .slice()
        .sort((a, b) => String(a.kode_aksi).localeCompare(String(b.kode_aksi)))
        .map((a) => ({
          id: a.id,
          kode_aksi: a.kode_aksi,
          label: a.label,
          granted: granted.has(a.id),
        })),
    }));

    return res.json({ ...group, menus: menusOut });
  } catch (err) {
    console.error('[GET /kelola-akses/groups/:id]', err);
    return res.status(500).json({ error: 'Gagal mengambil detail group' });
  }
});

/** PUT /api/kelola-akses/groups/:id/permissions */
router.put('/groups/:id/permissions', async (req, res) => {
  try {
    if (rejectOwnerMutation(req.body, res)) return;

    const { id } = req.params;
    const raw = req.body?.menu_aksi_ids ?? req.body?.permissions ?? req.body;
    const ids = Array.isArray(raw)
      ? [...new Set(raw.map((x) => String(x)).filter(Boolean))]
      : null;

    if (!ids) {
      return res.status(400).json({
        error: 'Body harus berisi array menu_aksi_id (menu_aksi_ids)',
      });
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (groupError) throw groupError;
    if (!group) {
      return res.status(404).json({ error: 'Group tidak ditemukan' });
    }

    if (ids.length > 0) {
      const { data: validAksi, error: validError } = await supabase
        .from('menu_aksi')
        .select('id')
        .in('id', ids);
      if (validError) throw validError;
      if ((validAksi || []).length !== ids.length) {
        return res.status(400).json({
          error: 'Ada menu_aksi_id yang tidak valid',
        });
      }
    }

    const { error: delError } = await supabase
      .from('group_permissions')
      .delete()
      .eq('group_id', id);
    if (delError) throw delError;

    if (ids.length > 0) {
      const rows = ids.map((menu_aksi_id) => ({
        group_id: id,
        menu_aksi_id,
      }));
      const { error: insError } = await supabase
        .from('group_permissions')
        .insert(rows);
      if (insError) throw insError;
    }

    return res.json({ ok: true, group_id: id, menu_aksi_ids: ids });
  } catch (err) {
    console.error('[PUT /kelola-akses/groups/:id/permissions]', err);
    return res.status(500).json({ error: 'Gagal menyimpan izin group' });
  }
});

/** PUT /api/kelola-akses/users/:id/assign-group */
router.put('/users/:id/assign-group', async (req, res) => {
  try {
    if (rejectOwnerMutation(req.body, res)) return;

    const userId = req.params.id;
    const groupId = normalizeText(req.body?.group_id);
    if (!groupId) {
      return res.status(400).json({ error: 'group_id wajib diisi' });
    }

    const { data: target, error: targetError } = await supabase
      .from('users')
      .select('id, is_owner')
      .eq('id', userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }
    if (target.is_owner) {
      return res.status(400).json({
        error: 'Tidak bisa mengubah group owner',
      });
    }

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .select('id, nama')
      .eq('id', groupId)
      .maybeSingle();
    if (groupError) throw groupError;
    if (!group) {
      return res.status(404).json({ error: 'Group tidak ditemukan' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ group_id: groupId, status: 'aktif' })
      .eq('id', userId)
      .select(
        `
        id,
        email,
        nama,
        status,
        is_owner,
        group_id,
        created_at,
        group:groups ( id, nama )
      `
      )
      .single();
    if (error) throw error;

    return res.json(data);
  } catch (err) {
    console.error('[PUT /kelola-akses/users/:id/assign-group]', err);
    return res.status(500).json({ error: 'Gagal assign group ke user' });
  }
});

/** PUT /api/kelola-akses/users/:id/cabut */
router.put('/users/:id/cabut', async (req, res) => {
  try {
    if (rejectOwnerMutation(req.body, res)) return;

    const userId = req.params.id;
    const { data: target, error: targetError } = await supabase
      .from('users')
      .select('id, is_owner')
      .eq('id', userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) {
      return res.status(404).json({ error: 'User tidak ditemukan' });
    }
    if (target.is_owner) {
      return res.status(400).json({
        error: 'Tidak bisa mencabut akses owner',
      });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ group_id: null, status: 'menunggu' })
      .eq('id', userId)
      .select(
        `
        id,
        email,
        nama,
        status,
        is_owner,
        group_id,
        created_at,
        group:groups ( id, nama )
      `
      )
      .single();
    if (error) throw error;

    return res.json(data);
  } catch (err) {
    console.error('[PUT /kelola-akses/users/:id/cabut]', err);
    return res.status(500).json({ error: 'Gagal mencabut akses user' });
  }
});

module.exports = router;
