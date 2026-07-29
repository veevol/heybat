const express = require('express');
const multer = require('multer');
const { supabase } = require('../db');
const {
  requireAuth,
  listUserPermissions,
} = require('../middleware/auth');
const { uploadUserAvatar } = require('../lib/storageAvatar');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const PROFILE_SELECT =
  'id, email, nama, nick_nama, nama_lengkap, jenis_kelamin, no_wa, jabatan, avatar_url, status, is_owner, group_id, created_at';
const PROFILE_SELECT_LEGACY = 'id, email, nama, status, is_owner, group_id, created_at';

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeJenisKelamin(value) {
  const raw = normalizeText(value);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === 'L' || upper === 'P') return upper;
  throw new Error("jenis_kelamin harus 'L' atau 'P'");
}

function googleDefaults(authUser) {
  const meta = authUser?.user_metadata || {};
  const nama =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    authUser?.email ||
    null;
  const avatar =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
    (typeof meta.picture === 'string' && meta.picture.trim()) ||
    null;
  return { nama, avatar };
}

function shapeProfile(row, { group = null, permissions = [], authUser = null } = {}) {
  const g = googleDefaults(authUser);
  const nick = normalizeText(row?.nick_nama) || normalizeText(row?.nama) || g.nama;
  return {
    id: row.id,
    email: row.email,
    nama: nick,
    nick_nama: nick,
    nama_lengkap: normalizeText(row?.nama_lengkap) || g.nama,
    jenis_kelamin: row?.jenis_kelamin || null,
    no_wa: row?.no_wa || null,
    jabatan: row?.jabatan || null,
    avatar_url: normalizeText(row?.avatar_url) || g.avatar,
    status: row.status,
    is_owner: row.is_owner === true,
    group_id: row.group_id || null,
    group,
    created_at: row.created_at || null,
    permissions,
  };
}

async function fetchProfileRow(userId) {
  let { data, error } = await supabase
    .from('users')
    .select(PROFILE_SELECT)
    .eq('id', userId)
    .maybeSingle();
  if (error && /nick_nama|nama_lengkap|avatar_url|jenis_kelamin|no_wa|jabatan/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('users')
      .select(PROFILE_SELECT_LEGACY)
      .eq('id', userId)
      .maybeSingle());
  }
  if (error) throw error;
  return data;
}

async function loadGroup(groupId) {
  if (!groupId) return null;
  const { data, error } = await supabase
    .from('groups')
    .select('id, nama')
    .eq('id', groupId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * GET /api/me
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const row = (await fetchProfileRow(req.user.id)) || req.user;
    const [permissions, group] = await Promise.all([
      listUserPermissions(req.user),
      loadGroup(row.group_id || req.user.group_id),
    ]);
    return res.json(
      shapeProfile(row, {
        group,
        permissions,
        authUser: req.authUser,
      })
    );
  } catch (err) {
    console.error('[GET /api/me]', err);
    return res.status(500).json({ error: 'Gagal mengambil profil' });
  }
});

/**
 * PATCH /api/me — update profil sendiri
 */
router.patch('/', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};

    if (Object.prototype.hasOwnProperty.call(body, 'nick_nama')) {
      patch.nick_nama = normalizeText(body.nick_nama);
      // Sinkron legacy kolom nama untuk jejak audit lama
      patch.nama = patch.nick_nama;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'nama_lengkap')) {
      patch.nama_lengkap = normalizeText(body.nama_lengkap);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'jenis_kelamin')) {
      try {
        patch.jenis_kelamin = normalizeJenisKelamin(body.jenis_kelamin);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'no_wa')) {
      patch.no_wa = normalizeText(body.no_wa);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'jabatan')) {
      patch.jabatan = normalizeText(body.jabatan);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'avatar_url')) {
      patch.avatar_url = normalizeText(body.avatar_url);
    }

    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'Tidak ada field yang diubah' });
    }

    let { data, error } = await supabase
      .from('users')
      .update(patch)
      .eq('id', req.user.id)
      .select(PROFILE_SELECT)
      .single();

    if (error && /nick_nama|nama_lengkap|avatar_url|jenis_kelamin|no_wa|jabatan/i.test(error.message || '')) {
      return res.status(503).json({
        error:
          'Kolom profil belum siap — jalankan migrasi users_akun_profile di Supabase SQL Editor',
      });
    }
    if (error) throw error;

    const [permissions, group] = await Promise.all([
      listUserPermissions({ ...req.user, ...data }),
      loadGroup(data.group_id),
    ]);

    return res.json(
      shapeProfile(data, {
        group,
        permissions,
        authUser: req.authUser,
      })
    );
  } catch (err) {
    console.error('[PATCH /api/me]', err);
    return res.status(500).json({ error: err.message || 'Gagal menyimpan profil' });
  }
});

/**
 * POST /api/me/avatar — upload foto profil
 */
router.post(
  '/avatar',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ error: 'File gambar wajib diupload' });
      }
      const mime = String(req.file.mimetype || '');
      if (!mime.startsWith('image/')) {
        return res.status(400).json({ error: 'File harus berupa gambar' });
      }

      const publicUrl = await uploadUserAvatar(
        req.user.id,
        req.file.buffer,
        mime
      );

      let { data, error } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', req.user.id)
        .select(PROFILE_SELECT)
        .single();

      if (error && /avatar_url/i.test(error.message || '')) {
        return res.status(503).json({
          error:
            'Kolom profil belum siap — jalankan migrasi users_akun_profile di Supabase SQL Editor',
        });
      }
      if (error) throw error;

      const [permissions, group] = await Promise.all([
        listUserPermissions({ ...req.user, ...data }),
        loadGroup(data.group_id),
      ]);

      return res.json(
        shapeProfile(data, {
          group,
          permissions,
          authUser: req.authUser,
        })
      );
    } catch (err) {
      console.error('[POST /api/me/avatar]', err);
      return res.status(500).json({ error: err.message || 'Gagal upload avatar' });
    }
  }
);

module.exports = router;
