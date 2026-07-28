const SATUAN = [
  '',
  'Satu',
  'Dua',
  'Tiga',
  'Empat',
  'Lima',
  'Enam',
  'Tujuh',
  'Delapan',
  'Sembilan',
];

/**
 * Konversi angka bulat non-negatif ke kata Bahasa Indonesia.
 * Mendukung sampai triliunan; cukup jauh di atas kebutuhan qty obat (1-999+).
 * @param {number} n
 * @returns {string}
 */
function terbilang(n) {
  const num = Math.trunc(Number(n));
  if (!Number.isFinite(num)) return '';
  if (num < 0) return `Minus ${terbilang(-num)}`;
  if (num === 0) return 'Nol';

  return terbilangPositif(num).trim().replace(/\s+/g, ' ');
}

function terbilangPositif(num) {
  if (num < 10) {
    return SATUAN[num] || '';
  }
  if (num === 10) {
    return 'Sepuluh';
  }
  if (num === 11) {
    return 'Sebelas';
  }
  if (num < 20) {
    return `${terbilangPositif(num - 10)} Belas`;
  }
  if (num < 100) {
    const puluhan = Math.floor(num / 10);
    const sisa = num % 10;
    const depan = puluhan === 1 ? 'Sepuluh' : `${terbilangPositif(puluhan)} Puluh`;
    return sisa === 0 ? depan : `${depan} ${terbilangPositif(sisa)}`;
  }
  if (num < 200) {
    const sisa = num - 100;
    return sisa === 0 ? 'Seratus' : `Seratus ${terbilangPositif(sisa)}`;
  }
  if (num < 1000) {
    const ratusan = Math.floor(num / 100);
    const sisa = num % 100;
    const depan = `${terbilangPositif(ratusan)} Ratus`;
    return sisa === 0 ? depan : `${depan} ${terbilangPositif(sisa)}`;
  }
  if (num < 2000) {
    const sisa = num - 1000;
    return sisa === 0 ? 'Seribu' : `Seribu ${terbilangPositif(sisa)}`;
  }
  if (num < 1000000) {
    const ribuan = Math.floor(num / 1000);
    const sisa = num % 1000;
    const depan = `${terbilangPositif(ribuan)} Ribu`;
    return sisa === 0 ? depan : `${depan} ${terbilangPositif(sisa)}`;
  }
  if (num < 1000000000) {
    const jutaan = Math.floor(num / 1000000);
    const sisa = num % 1000000;
    const depan = `${terbilangPositif(jutaan)} Juta`;
    return sisa === 0 ? depan : `${depan} ${terbilangPositif(sisa)}`;
  }
  const miliaran = Math.floor(num / 1000000000);
  const sisa = num % 1000000000;
  const depan = `${terbilangPositif(miliaran)} Miliar`;
  return sisa === 0 ? depan : `${depan} ${terbilangPositif(sisa)}`;
}

/**
 * Format qty untuk dokumen SP: "3 (Tiga)"
 * @param {number} n
 * @returns {string}
 */
function formatJumlahDenganKata(n) {
  const num = Math.trunc(Number(n)) || 0;
  return `${num} (${terbilang(num)})`;
}

module.exports = { terbilang, formatJumlahDenganKata };
