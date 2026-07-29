const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { drawTable } = require('./pdfTable');
const { formatJumlahDenganKata } = require('./terbilang');

const LOGO_PATH = path.join(__dirname, '../assets/logo_yelo.png');
const WARNING_TEXT = '[!] Data belum lengkap';

// Layout diambil persis dari contoh PDF SP Yelo asli (diekstrak koordinat +
// font-nya): margin 28.5pt, lebar konten ~538pt di kertas A4.
const PAGE_MARGIN = 28.5;

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const BULAN_SINGKAT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

/**
 * Konfigurasi literal per golongan Template 2 — string diambil kata-per-kata
 * dari contoh dokumen asli (ada ketidakkonsistenan kecil antar golongan,
 * mis. Prekursor pakai "obat non prekursor" bukan "non prekursor farmasi",
 * OOT pakai "Obat-obat tertentu" bukan "Obat obat-obat tertentu" — sengaja
 * di-hardcode per golongan, bukan digenerate dari 1 pola generik).
 */
const TEMPLATE2_CONFIG = {
  Prekursor: {
    judul: 'SURAT PESANAN OBAT MENGANDUNG PREKURSOR FARMASI',
    labelPengajuan: 'obat mengandung Prekursor Farmasi',
    labelJenisDipesan: 'obat mengandung Prekursor Farmasi',
    kolomNamaObat: 'Nama Obat Mengandung\nPrekursor Farmasi',
    kolomZatAktif: 'Zat Aktif Prekursor\nFarmasi',
    labelPenutup: 'Obat mengandung Prekursor Farmasi',
    labelFooter: 'obat mengandung prekursor farmasi',
    labelFooterNon: 'obat non prekursor',
  },
  Psikotropika: {
    judul: 'SURAT PESANAN PSIKOTROPIKA',
    labelPengajuan: 'psikotropika',
    labelJenisDipesan: 'psikotropika',
    kolomNamaObat: 'Nama Obat Psikotropika',
    kolomZatAktif: 'Zat Aktif Psikotropika',
    labelPenutup: 'Obat psikotropika',
    labelFooter: 'psikotropika',
    labelFooterNon: 'non psikotropika',
  },
  OOT: {
    judul: 'SURAT PESANAN OBAT-OBAT TERTENTU',
    labelPengajuan: 'obat-obat tertentu',
    labelJenisDipesan: 'obat-obat tertentu',
    kolomNamaObat: 'Nama Obat-Obat Tertentu',
    kolomZatAktif: 'Zat Aktif Obat-Obat\nTertentu',
    labelPenutup: 'Obat-obat tertentu',
    labelFooter: 'obat-obat tertentu',
    labelFooterNon: 'non obat-obat tertentu',
  },
};

function pilihTemplate(golongan) {
  return TEMPLATE2_CONFIG[golongan] ? 'template2' : 'template1';
}

function formatTanggalIndonesia(dateInput) {
  const d = new Date(dateInput || Date.now());
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return `${Number(map.day)} ${BULAN_ID[Number(map.month) - 1]} ${map.year}`;
}

/** Format "06 Jul 2026 11:02:46" — dipakai field "Tanggal" di Template 1. */
function formatTanggalJamSingkat(dateInput) {
  const d = new Date(dateInput || Date.now());
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const day = String(Number(map.day)).padStart(2, '0');
  return `${day} ${BULAN_SINGKAT[Number(map.month) - 1]} ${map.year} ${map.hour}:${map.minute}:${map.second}`;
}

/**
 * Blok "Label : value" dengan kolom label lebar tetap & posisi ":" tetap,
 * sesuai gaya dokumen asli. Tinggi baris menyesuaikan kalau value wrap
 * lebih dari 1 baris (alamat panjang, dll).
 * @returns {number} y setelah blok selesai
 */
function drawLabelValueLines(doc, { x, y, labelWidth, valueWidth, rows, fontSize = 8.2, lineHeight = 11.3 }) {
  let cy = y;
  const colonX = x + labelWidth;
  const valueX = colonX + 6;
  for (const [label, value] of rows) {
    doc.font('Helvetica').fontSize(fontSize).fillColor('#000000');
    doc.text(label, x, cy, { width: labelWidth - 2, lineBreak: false });
    doc.text(':', colonX, cy, { lineBreak: false });
    const text = value === undefined || value === null || value === '' ? '-' : String(value);
    const valH = doc.heightOfString(text, { width: valueWidth });
    doc.text(text, valueX, cy, { width: valueWidth });
    cy += Math.max(lineHeight, valH + 1.8);
  }
  return cy;
}

/** Garis pembatas 2-tone (abu gelap + abu terang) meniru dokumen asli. */
function drawShadowDivider(doc, x, y, width) {
  doc.save();
  doc.rect(x, y, width, 0.75).fill('#999999');
  doc.rect(x, y + 0.75, width, 0.75).fill('#e0e0e0');
  doc.restore();
  doc.fillColor('#000000');
}

function drawTemplate1(doc, { dokumen, items, supplier, pengaturan }) {
  const marginX = PAGE_MARGIN;
  const pageWidth = doc.page.width - PAGE_MARGIN * 2;
  const logoSize = 48;
  const logoY = 25;
  const textX = marginX + logoSize + 8;
  const infoWidth = pageWidth * 0.55 - (textX - marginX);

  if (fs.existsSync(LOGO_PATH)) {
    doc.image(LOGO_PATH, marginX, logoY, { width: logoSize, height: logoSize });
  }
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000').text(pengaturan.nama_apotek || 'Apotek Yelo', textX, logoY + 2, { width: infoWidth });
  doc.font('Helvetica').fontSize(8);
  doc.text(`No. Surat Izin Apotek : ${pengaturan.no_sia || '-'}`, textX, doc.y + 3, { width: infoWidth });
  doc.text(pengaturan.alamat || '-', textX, doc.y, { width: infoWidth });
  doc.text(`Telp. ${pengaturan.telp_apotek || '-'}, Email : ${pengaturan.email_apotek || '-'}`, textX, doc.y, { width: infoWidth });
  const leftHeaderBottom = Math.max(doc.y, logoY + logoSize);

  doc.font('Helvetica-Bold').fontSize(30).text('SURAT', marginX, 10, { width: pageWidth, align: 'right' });
  doc.text('PESANAN', marginX, doc.y, { width: pageWidth, align: 'right' });

  let y = Math.max(leftHeaderBottom, doc.y) + 18;
  drawShadowDivider(doc, marginX, y, pageWidth);
  y += 15;

  const colGap = pageWidth * 0.06;
  const leftColW = pageWidth * 0.5 - colGap / 2;
  const rightX = marginX + leftColW + colGap;
  const rightColW = pageWidth - leftColW - colGap;

  const leftEndY = drawLabelValueLines(doc, {
    x: marginX,
    y,
    labelWidth: 76.5,
    valueWidth: leftColW - 76.5 - 6,
    rows: [
      ['Nama Supplier', supplier?.nama || '-'],
      ['No. Telp', supplier?.no_telp_pbf || '-'],
      ['Alamat', supplier?.alamat || '-'],
    ],
  });

  const rightEndY = drawLabelValueLines(doc, {
    x: rightX,
    y,
    labelWidth: 52,
    valueWidth: rightColW - 52 - 6,
    rows: [
      ['APJ', pengaturan.nama_apj || '-'],
      ['No. Telp', pengaturan.telp_apotek || '-'],
      ['Tanggal', formatTanggalJamSingkat(dokumen.tanggal_terbit)],
      ['Nomor', dokumen.nomor_sp || '-'],
      ['Jenis', 'NON KONSINYASI'],
    ],
  });

  y = Math.max(leftEndY, rightEndY) + 12;

  const columns = [
    { header: 'No', width: pageWidth * 0.0578, align: 'center' },
    { header: 'Nama Obat', width: pageWidth * 0.3898, align: 'left' },
    { header: 'Qty', width: pageWidth * 0.0851, align: 'center' },
    { header: 'Satuan', width: pageWidth * 0.1517, align: 'center' },
  ];
  columns.push({
    header: 'Keterangan',
    width: pageWidth - columns.reduce((s, c) => s + c.width, 0),
    align: 'left',
  });

  const rows = items.map((item, i) => [
    String(i + 1),
    item.nama_obat || item.kode_obat,
    String(item.qty_order),
    item.satuan || '-',
    item.keterangan || '',
  ]);

  y = drawTable(doc, { x: marginX, columns, rows, startY: y, fontSize: 7.8 });
  y += 8;

  if (y > doc.page.height - doc.page.margins.bottom - 100) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  doc.font('Helvetica').fontSize(8.4).fillColor('#000000').text('Catatan', marginX, y, { lineBreak: false });
  doc.text(':', marginX + 56, y, { lineBreak: false });
  y += 21;

  if (y > doc.page.height - doc.page.margins.bottom - 100) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  const blockWidth = pageWidth / 3;
  const leftBlockX = marginX;
  const rightBlockX = marginX + pageWidth - blockWidth;

  doc.font('Helvetica-Bold').fontSize(8.4);
  doc.text('Supplier', leftBlockX, y, { width: blockWidth, align: 'center' });
  doc.text('Apotek Yelo', rightBlockX, y, { width: blockWidth, align: 'center' });

  const lineY = y + 68;
  const lineInset = blockWidth * 0.12;
  doc.lineWidth(0.75).strokeColor('#000000');
  doc.moveTo(leftBlockX + lineInset, lineY).lineTo(leftBlockX + blockWidth - lineInset, lineY).stroke();
  doc.moveTo(rightBlockX + lineInset, lineY).lineTo(rightBlockX + blockWidth - lineInset, lineY).stroke();

  const namaApj = pengaturan.nama_apj || '-';
  doc.font('Helvetica-Bold').fontSize(8.4);
  const namaApjHeight = doc.heightOfString(namaApj, { width: blockWidth });
  doc.text(namaApj, rightBlockX, lineY - namaApjHeight - 2, { width: blockWidth, align: 'center' });
  doc.font('Helvetica').fontSize(8.4);
  doc.text(`No. SIPA ${pengaturan.no_sipa || '-'}`, rightBlockX, lineY + 6, { width: blockWidth, align: 'center' });
}

function drawTemplate2(doc, { dokumen, items, supplier, pengaturan, config }) {
  const marginX = PAGE_MARGIN;
  const pageWidth = doc.page.width - PAGE_MARGIN * 2;
  let y = 30;

  doc.font('Helvetica-Bold').fontSize(14.4).fillColor('#000000').text(config.judul, marginX, y, { width: pageWidth, align: 'center' });
  y = doc.y + 4;
  doc.font('Helvetica').fontSize(9.6).text(`Nomor PO : ${dokumen.nomor_sp || '-'}`, marginX, y, {
    width: pageWidth,
    align: 'center',
  });
  y = doc.y + 15;
  drawShadowDivider(doc, marginX, y, pageWidth);
  y += 12;

  const labelWidth = 111.4;
  const valueWidth = pageWidth - labelWidth - 6;

  doc.font('Helvetica').fontSize(8.2).text('Yang bertanda tangan di bawah ini :', marginX, y, { width: pageWidth });
  y = doc.y + 2;
  y = drawLabelValueLines(doc, {
    x: marginX,
    y,
    labelWidth,
    valueWidth,
    rows: [
      ['Nama', pengaturan.nama_apj || '-'],
      ['No. Telp', pengaturan.telp_apotek || '-'],
      ['Jabatan', 'Apoteker Pemegang SIA'],
      ['Nomor SIPA', pengaturan.no_sipa || '-'],
    ],
  });
  y += 6;

  doc.font('Helvetica').fontSize(8.2).text(`Mengajukan pesanan ${config.labelPengajuan} kepada:`, marginX, y, { width: pageWidth });
  y = doc.y + 2;
  y = drawLabelValueLines(doc, {
    x: marginX,
    y,
    labelWidth,
    valueWidth,
    rows: [
      ['Nama Industri Farmasi / PBF', supplier?.nama || '-'],
      ['Alamat', supplier?.alamat || '-'],
      ['Telp', supplier?.no_telp_pbf || '-'],
    ],
  });
  y += 6;

  doc.font('Helvetica').fontSize(8.2).text(`Jenis ${config.labelJenisDipesan} yang dipesan adalah:`, marginX, y, { width: pageWidth });
  y = doc.y + 10;

  const columns = [
    { header: 'No', width: pageWidth * 0.04735, align: 'center' },
    { header: config.kolomNamaObat, width: pageWidth * 0.252, align: 'left' },
    { header: config.kolomZatAktif, width: pageWidth * 0.1963, align: 'left' },
    { header: 'Bentuk dan\nkekuatan Sediaan', width: pageWidth * 0.1408, align: 'center' },
    { header: 'Satuan', width: pageWidth * 0.1391, align: 'center' },
    { header: 'Jumlah', width: pageWidth * 0.0851, align: 'center' },
  ];
  columns.push({
    header: 'Ket',
    width: pageWidth - columns.reduce((s, c) => s + c.width, 0),
    align: 'left',
  });

  const rows = items.map((item, i) => {
    const zatAktif = (item.zat_aktif || '').trim();
    const bentukSediaan = (item.bentuk_sediaan || '').trim();
    return [
      String(i + 1),
      item.nama_obat || item.kode_obat,
      zatAktif ? zatAktif : { text: WARNING_TEXT, warn: true },
      bentukSediaan ? bentukSediaan : { text: WARNING_TEXT, warn: true },
      item.satuan || '-',
      formatJumlahDenganKata(item.qty_order),
      item.keterangan || '',
    ];
  });

  y = drawTable(doc, { x: marginX, columns, rows, startY: y, fontSize: 7.8 });
  y += 12;

  if (y > doc.page.height - doc.page.margins.bottom - 170) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  doc.font('Helvetica').fontSize(8.4);
  doc.text(
    `${config.labelPenutup} tersebut akan digunakan untuk memenuhi kebutuhan:`,
    marginX,
    y,
    { width: pageWidth }
  );
  y = doc.y + 2;
  y = drawLabelValueLines(doc, {
    x: marginX,
    y,
    labelWidth: 112,
    valueWidth: pageWidth - 112 - 6,
    fontSize: 8.4,
    lineHeight: 9.8,
    rows: [
      ['Nama Apotek', pengaturan.nama_apotek || '-'],
      ['Alamat lengkap', pengaturan.alamat || '-'],
      ['Surat Izin Apotek', pengaturan.no_sia || '-'],
    ],
  });
  y += 16;

  const blockX = marginX + pageWidth / 2;
  const blockWidth = pageWidth / 2;
  const blockCenterX = blockX + blockWidth / 2;
  const kotaApotek = pengaturan.kota || '-';

  doc.font('Helvetica').fontSize(8.4).fillColor('#000000');
  doc.text(`${kotaApotek},${formatTanggalIndonesia(dokumen.tanggal_terbit)}`, blockX, y, {
    width: blockWidth,
    align: 'center',
  });
  doc.text('Pemesan', blockX, doc.y + 2, { width: blockWidth, align: 'center' });

  const nameY = doc.y + 40;
  const namaApj = pengaturan.nama_apj || '-';
  doc.font('Helvetica-Bold').fontSize(8.4);
  const namaApjWidth = doc.widthOfString(namaApj);
  doc.text(namaApj, blockX, nameY, { width: blockWidth, align: 'center' });
  const underlineY = doc.y + 1;
  doc.lineWidth(0.6).strokeColor('#000000');
  doc.moveTo(blockCenterX - namaApjWidth / 2, underlineY).lineTo(blockCenterX + namaApjWidth / 2, underlineY).stroke();
  doc.font('Helvetica').fontSize(8.4);
  doc.text(`No. SIPA ${pengaturan.no_sipa || '-'}`, blockX, underlineY + 6, { width: blockWidth, align: 'center' });
  y = doc.y + 20;

  if (y > doc.page.height - doc.page.margins.bottom - 40) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  doc.font('Helvetica').fontSize(8.4).text('Keterangan :', marginX, y, { width: pageWidth });
  doc.text(
    `Surat pesanan ${config.labelFooter} dibuat terpisah dari pesanan ${config.labelFooterNon} dan jumlah pesanan di tulis dalam bentuk angka dan huruf.`,
    marginX,
    doc.y + 2,
    { width: pageWidth }
  );
}

/**
 * Generate 1 buffer PDF dokumen SP, pilih template otomatis dari golongan.
 * @param {{
 *   dokumen: { golongan: string, nomor_sp: string, tanggal_terbit: string },
 *   items: Array<{ kode_obat: string, qty_order: number, nama_obat?: string, satuan?: string, zat_aktif?: string, bentuk_sediaan?: string }>,
 *   supplier: { nama?: string, alamat?: string, no_telp_pbf?: string } | null,
 *   pengaturan: { nama_apotek?: string, inisial?: string, alamat?: string, no_sia?: string, nama_apj?: string, no_sipa?: string, telp_apotek?: string, email_apotek?: string },
 * }} params
 * @returns {Promise<Buffer>}
 */
function buildDokumenSpPdfBuffer({ dokumen, items, supplier, pengaturan }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const template = pilihTemplate(dokumen.golongan);
      if (template === 'template2') {
        drawTemplate2(doc, { dokumen, items, supplier, pengaturan, config: TEMPLATE2_CONFIG[dokumen.golongan] });
      } else {
        drawTemplate1(doc, { dokumen, items, supplier, pengaturan });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  buildDokumenSpPdfBuffer,
  pilihTemplate,
  formatTanggalIndonesia,
  formatTanggalJamSingkat,
  TEMPLATE2_CONFIG,
};
