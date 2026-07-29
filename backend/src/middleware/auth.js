const { supabase } = require('../db');

const USER_SELECT = 'id, email, nama, nick_nama, status, is_owner, group_id';

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function profileFromAuthUser(authUser) {
  const meta = authUser.user_metadata || {};
  const nama =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    authUser.email ||
    null;
  const avatar =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
    (typeof meta.picture === 'string' && meta.picture.trim()) ||
    null;
  return {
    id: authUser.id,
    email: authUser.email || '',
    nama,
    avatar,
  };
}

async function fetchAppUser(id) {
  let { data, error } = await supabase
    .from('users')
    .select(USER_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error && /nick_nama/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('users')
      .select('id, email, nama, status, is_owner, group_id')
      .eq('id', id)
      .maybeSingle());
  }
  if (error) throw error;
  return data;
}

/**
 * Insert app profile on first login.
 * First row in public.users → owner + aktif; later users → menunggu.
 */
async function createAppUser(authUser) {
  const base = profileFromAuthUser(authUser);

  const { count, error: countError } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true });
  if (countError) throw countError;

  const isFirst = (count ?? 0) === 0;
  const rowFull = {
    id: base.id,
    email: base.email,
    nama: base.nama,
    nick_nama: base.nama,
    nama_lengkap: base.nama,
    avatar_url: base.avatar,
    status: isFirst ? 'aktif' : 'menunggu',
    is_owner: isFirst,
    group_id: null,
  };
  const rowLegacy = {
    id: base.id,
    email: base.email,
    nama: base.nama,
    status: isFirst ? 'aktif' : 'menunggu',
    is_owner: isFirst,
    group_id: null,
  };

  let { data, error } = await supabase
    .from('users')
    .insert(rowFull)
    .select(USER_SELECT)
    .single();

  if (error && /nick_nama|nama_lengkap|avatar_url/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('users')
      .insert(rowLegacy)
      .select(USER_SELECT)
      .single());
  }

  if (error) {
    // Race: another request inserted the same auth user — re-fetch.
    if (error.code === '23505') {
      const existing = await fetchAppUser(base.id);
      if (existing) return existing;
    }
    throw error;
  }
  return data;
}

async function ensureAppUser(authUser) {
  const existing = await fetchAppUser(authUser.id);
  if (existing) return existing;
  return createAppUser(authUser);
}

/**
 * Verify Supabase JWT, load/create public.users row, set req.user.
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Token autentikasi wajib' });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa' });
    }

    const profile = await ensureAppUser(data.user);
    req.user = profile;
    req.authUser = data.user;
    return next();
  } catch (err) {
    console.error('[requireAuth]', err);
    return res.status(500).json({ error: 'Gagal memverifikasi autentikasi' });
  }
}

/** After requireAuth — only status=aktif may proceed. */
function requireApproved(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Token autentikasi wajib' });
  }
  if (req.user.status !== 'aktif') {
    return res.status(403).json({ error: 'Akun menunggu persetujuan owner' });
  }
  return next();
}

/** After requireAuth — database is_owner flag only. */
function requireOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Token autentikasi wajib' });
  }
  if (req.user.is_owner !== true) {
    return res.status(403).json({ error: 'Hanya owner yang dapat mengakses' });
  }
  return next();
}

/**
 * After requireAuth — owner always passes; otherwise group_permissions must allow
 * the given menu kode + aksi kode.
 */
function requireMenuAksi(menuKode, aksiKode) {
  return async function requireMenuAksiMiddleware(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Token autentikasi wajib' });
      }
      if (req.user.is_owner === true) {
        return next();
      }
      if (!req.user.group_id) {
        return res.status(403).json({
          error: `Tidak punya izin ${menuKode}:${aksiKode}`,
        });
      }

      const { data: menu, error: menuError } = await supabase
        .from('menus')
        .select('id')
        .eq('kode', menuKode)
        .maybeSingle();
      if (menuError) throw menuError;
      if (!menu) {
        return res.status(403).json({
          error: `Tidak punya izin ${menuKode}:${aksiKode}`,
        });
      }

      const { data: aksi, error: aksiError } = await supabase
        .from('menu_aksi')
        .select('id')
        .eq('menu_id', menu.id)
        .eq('kode_aksi', aksiKode)
        .maybeSingle();
      if (aksiError) throw aksiError;
      if (!aksi) {
        return res.status(403).json({
          error: `Tidak punya izin ${menuKode}:${aksiKode}`,
        });
      }

      const { data: perm, error: permError } = await supabase
        .from('group_permissions')
        .select('menu_aksi_id')
        .eq('group_id', req.user.group_id)
        .eq('menu_aksi_id', aksi.id)
        .maybeSingle();
      if (permError) throw permError;
      if (!perm) {
        return res.status(403).json({
          error: `Tidak punya izin ${menuKode}:${aksiKode}`,
        });
      }

      return next();
    } catch (err) {
      console.error('[requireMenuAksi]', err);
      return res.status(500).json({ error: 'Gagal memeriksa izin' });
    }
  };
}

/**
 * List { menu, aksi } pairs for the user (owner = semua; else from group).
 * Returns [] if status is not aktif.
 */
async function listUserPermissions(user) {
  if (!user || user.status !== 'aktif') return [];

  if (user.is_owner === true) {
    const { data, error } = await supabase
      .from('menu_aksi')
      .select('kode_aksi, menus!inner ( kode )');
    if (error) throw error;
    return (data || []).map((row) => ({
      menu: row.menus?.kode,
      aksi: row.kode_aksi,
    })).filter((p) => p.menu && p.aksi);
  }

  if (!user.group_id) return [];

  const { data, error } = await supabase
    .from('group_permissions')
    .select('menu_aksi:menu_aksi_id ( kode_aksi, menus!inner ( kode ) )')
    .eq('group_id', user.group_id);
  if (error) throw error;

  return (data || [])
    .map((row) => ({
      menu: row.menu_aksi?.menus?.kode,
      aksi: row.menu_aksi?.kode_aksi,
    }))
    .filter((p) => p.menu && p.aksi);
}

module.exports = {
  requireAuth,
  requireApproved,
  requireOwner,
  requireMenuAksi,
  listUserPermissions,
  ensureAppUser,
};
