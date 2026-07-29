const { supabase } = require('../db');

const BUCKET = 'avatars';

/**
 * Ensure public avatars bucket exists (idempotent best-effort).
 */
async function ensureAvatarsBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  const exists = (buckets || []).some((b) => b.name === BUCKET);
  if (exists) return;
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  });
  // Race / already exists
  if (createErr && !/already|exists/i.test(createErr.message || '')) {
    throw createErr;
  }
}

/**
 * Upload avatar image for a user; returns public URL.
 * @param {string} userId
 * @param {Buffer} buffer
 * @param {string} contentType
 */
async function uploadUserAvatar(userId, buffer, contentType = 'image/jpeg') {
  await ensureAvatarsBucket();
  const ext =
    contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : contentType.includes('gif')
          ? 'gif'
          : 'jpg';
  const path = `${userId}/avatar.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType,
      upsert: true,
    });
  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so browser refreshes after replace
  const base = data.publicUrl;
  return `${base}?t=${Date.now()}`;
}

module.exports = { uploadUserAvatar, ensureAvatarsBucket, BUCKET };
