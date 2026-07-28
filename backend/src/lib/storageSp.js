const { supabase } = require('../db');

const BUCKET = 'dokumen-sp-yelo';

/**
 * Upload buffer PDF dokumen SP ke Supabase Storage (bucket public), return
 * URL publik untuk disimpan ke dokumen_sp.file_path.
 * @param {string} nomorSp - dipakai sebagai nama file, sudah unik per dokumen.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string>} public URL
 */
async function uploadDokumenSpPdf(nomorSp, pdfBuffer) {
  const path = `${nomorSp}.pdf`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (uploadErr) throw uploadErr;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

module.exports = { uploadDokumenSpPdf, BUCKET };
