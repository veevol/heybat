const AdmZip = require('adm-zip');

/**
 * Vmedis sering menulis rgb pendek di xl/styles.xml (mis. rgb="0000")
 * yang tidak valid (harus 8 hex). Perbaiki sebelum library Excel membaca file.
 *
 * @param {Buffer} buffer
 * @returns {{ buffer: Buffer, repaired: boolean, replacements: number }}
 */
function repairVmedisXlsx(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    throw new Error(
      'File Excel tidak bisa dibaca, kemungkinan rusak dari sumbernya. Coba export ulang dari Vmedis.'
    );
  }

  // XLSX = ZIP (PK\x03\x04)
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error(
      'File bukan Excel .xlsx yang valid. Pastikan export dari Vmedis berformat .xlsx.'
    );
  }

  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw new Error(
      'File Excel tidak bisa dibaca, kemungkinan rusak dari sumbernya. Coba export ulang dari Vmedis.'
    );
  }

  const entry =
    zip.getEntry('xl/styles.xml') ||
    zip.getEntry('xl\\styles.xml');

  if (!entry) {
    return { buffer, repaired: false, replacements: 0 };
  }

  let styles;
  try {
    styles = entry.getData().toString('utf8');
  } catch {
    throw new Error(
      'File Excel tidak bisa dibaca, kemungkinan rusak dari sumbernya. Coba export ulang dari Vmedis.'
    );
  }

  let replacements = 0;
  // rgb dengan 1–7 hex (bukan 8) → default aman
  const fixed = styles.replace(/rgb="([0-9A-Fa-f]{1,7})"/g, (_match, hex) => {
    replacements += 1;
    return 'rgb="00000000"';
  });

  if (replacements === 0) {
    return { buffer, repaired: false, replacements: 0 };
  }

  zip.updateFile(entry.entryName, Buffer.from(fixed, 'utf8'));
  return {
    buffer: zip.toBuffer(),
    repaired: true,
    replacements,
  };
}

module.exports = { repairVmedisXlsx };
