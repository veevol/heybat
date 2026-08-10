const XLSX = require('xlsx');
const { repairVmedisXlsx } = require('./xlsxRepair');
const {
  coerceAngka,
  coerceTanggal,
  normalizeText,
} = require('./penjualanExcel');

const SAMPLE_LIMIT = 10;
const TOTAL_TOLERANCE_ABS = 2; // Rp
const TOTAL_TOLERANCE_REL = 0.005; // 0.5%

const READ_ERROR =
  'File Excel tidak bisa dibaca, kemungkinan rusak dari sumbernya. Coba export ulang dari Vmedis.';

const FAKTUR_FOOTER_LABELS = new Set([
  'subtotal :',
  'diskon tunai :',
  'diskon :',
  'pajak :',
  'biaya :',
  'total transaksi :',
]);

const FILE_SUMMARY_LABELS = new Set([
  'total tunai :',
  'total hutang :',
  'total konsinyasi :',
  'grand total transaksi :',
]);

function cellText(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/^\uFEFF/, '').trim();
}

function normalizeLabel(value) {
  return cellText(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*:$/, ' :')
    .trim();
}

function labelOf(row) {
  return normalizeLabel(row?.[0]);
}

function isFakturHeaderLabel(label) {
  return label === 'no' || label === 'no.';
}

function isItemHeaderLabel(label) {
  return label === 'kode obat';
}

function isEmptyRow(row) {
  if (!row || !row.length) return true;
  return row.every((c) => {
    if (c === undefined || c === null) return true;
    if (typeof c === 'number') return false;
    if (c instanceof Date) return Number.isNaN(c.getTime());
    const t = String(c).trim();
    return t === '' || t === '-';
  });
}

function isoToDateOnly(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const wib = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const y = wib.getUTCFullYear();
  const m = String(wib.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wib.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function expectedItemTotal(harga, jumlah, d1, d2, d3) {
  const h = Number(harga) || 0;
  const j = Number(jumlah) || 0;
  const a = Number(d1) || 0;
  const b = Number(d2) || 0;
  const c = Number(d3) || 0;
  let total = h * j;
  total *= 1 - a / 100;
  total *= 1 - b / 100;
  total *= 1 - c / 100;
  return total;
}

function totalMismatch(harga, jumlah, d1, d2, d3, actual) {
  if (actual === null || actual === undefined) return false;
  const expected = expectedItemTotal(harga, jumlah, d1, d2, d3);
  const act = Number(actual);
  if (!Number.isFinite(act) || !Number.isFinite(expected)) return false;
  const diff = Math.abs(act - expected);
  const rel = expected === 0 ? diff : diff / Math.abs(expected);
  return diff > TOTAL_TOLERANCE_ABS && rel > TOTAL_TOLERANCE_REL;
}

function fakturKey(noFaktur, namaSupplier) {
  return `${String(noFaktur)}\u0000${String(namaSupplier)}`;
}

function readPembelianRows(buffer) {
  const { buffer: repaired, repaired: didRepair, replacements } =
    repairVmedisXlsx(buffer);

  let workbook;
  try {
    workbook = XLSX.read(repaired, {
      type: 'buffer',
      cellDates: true,
      dense: false,
    });
  } catch (err) {
    console.error('[pembelianExcel] XLSX.read gagal setelah repair:', err?.message || err);
    throw new Error(READ_ERROR);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(READ_ERROR);

  const sheet = workbook.Sheets[sheetName];
  let rows;
  try {
    rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: true,
    });
  } catch (err) {
    console.error('[pembelianExcel] sheet_to_json gagal:', err?.message || err);
    throw new Error(READ_ERROR);
  }

  return {
    rows: rows || [],
    sheetName,
    repaired: didRepair,
    style_replacements: replacements,
  };
}

/**
 * Parse LapDetailDataPembelianObat (blok per-faktur, bukan flat table).
 */
function parsePembelianExcel(buffer) {
  const { rows: allRows, repaired, style_replacements } = readPembelianRows(buffer);

  const fakturList = [];
  const warnings = [];
  let barisKosong = 0;
  let itemTanpaKode = 0;
  let totalMismatchCount = 0;

  let i = 0;
  let stop = false;

  while (i < allRows.length && !stop) {
    const row = allRows[i] || [];
    const label = labelOf(row);

    if (FILE_SUMMARY_LABELS.has(label)) {
      stop = true;
      break;
    }

    if (isEmptyRow(row)) {
      barisKosong += 1;
      i += 1;
      continue;
    }

    if (isFakturHeaderLabel(label)) {
      const dataRow = allRows[i + 1] || [];
      const dataLabel = labelOf(dataRow);

      if (
        isEmptyRow(dataRow) ||
        isFakturHeaderLabel(dataLabel) ||
        isItemHeaderLabel(dataLabel) ||
        FILE_SUMMARY_LABELS.has(dataLabel) ||
        FAKTUR_FOOTER_LABELS.has(dataLabel)
      ) {
        warnings.push({
          baris: i + 2,
          jenis: 'faktur_header',
          pesan: 'Header faktur tanpa baris data — blok di-skip',
        });
        i += 1;
        continue;
      }

      const noFaktur = normalizeText(dataRow[6]);
      const namaSupplier = normalizeText(dataRow[7]);
      if (!noFaktur || !namaSupplier) {
        warnings.push({
          baris: i + 3,
          jenis: 'faktur_kunci',
          pesan: 'No. Faktur atau Nama Supplier kosong — blok di-skip',
        });
        i += 2;
        continue;
      }

      const tanggalFakturIso = coerceTanggal(dataRow[1]);
      const tanggalInputIso = coerceTanggal(dataRow[2]);
      const jatuhTempoIso = coerceTanggal(dataRow[13]);
      const jenisBayarRaw = normalizeText(dataRow[12]);
      const jenisBayar = jenisBayarRaw
        ? String(jenisBayarRaw).trim().toUpperCase()
        : null;

      const current = {
        no_faktur: noFaktur,
        nama_supplier: namaSupplier,
        no_po: normalizeText(dataRow[3]),
        jenis_po: normalizeText(dataRow[4]),
        status_faktur: normalizeText(dataRow[5]),
        tanggal_faktur: isoToDateOnly(tanggalFakturIso),
        tanggal_input: tanggalInputIso,
        gudang: normalizeText(dataRow[9]),
        petugas: normalizeText(dataRow[11]),
        jenis_bayar: jenisBayar,
        jatuh_tempo: jatuhTempoIso,
        no_faktur_pajak: normalizeText(dataRow[14]),
        subtotal: null,
        diskon_tunai: null,
        diskon: null,
        pajak: null,
        biaya: null,
        total_transaksi: null,
        items: [],
        _baris_header: i + 1,
      };

      i += 2;

      while (i < allRows.length) {
        const r = allRows[i] || [];
        const lb = labelOf(r);
        if (FILE_SUMMARY_LABELS.has(lb)) {
          stop = true;
          break;
        }
        if (isFakturHeaderLabel(lb)) break;
        if (isItemHeaderLabel(lb)) {
          i += 1;
          break;
        }
        if (FAKTUR_FOOTER_LABELS.has(lb)) break;
        if (isEmptyRow(r)) {
          i += 1;
          continue;
        }
        i += 1;
      }

      if (stop) {
        fakturList.push(current);
        break;
      }

      while (i < allRows.length) {
        const r = allRows[i] || [];
        const lb = labelOf(r);

        if (FILE_SUMMARY_LABELS.has(lb)) {
          stop = true;
          break;
        }
        if (isFakturHeaderLabel(lb)) break;
        if (FAKTUR_FOOTER_LABELS.has(lb)) break;

        if (isEmptyRow(r)) {
          i += 1;
          continue;
        }

        const kodeObat = normalizeText(r[0]);
        if (!kodeObat) {
          itemTanpaKode += 1;
          warnings.push({
            baris: i + 1,
            jenis: 'item_kode',
            pesan: `Item tanpa kode_obat di faktur ${noFaktur} — di-skip`,
            no_faktur: noFaktur,
          });
          i += 1;
          continue;
        }

        const harga = coerceAngka(r[3]);
        const jumlah = coerceAngka(r[4]);
        const diskon1 = coerceAngka(r[5]) ?? 0;
        const diskon2 = coerceAngka(r[6]) ?? 0;
        const diskon3 = coerceAngka(r[7]) ?? 0;
        const total = coerceAngka(r[14]);
        const tanggalExpIso = coerceTanggal(r[10]);
        const maksBln = coerceAngka(r[13]);

        const mismatch = totalMismatch(
          harga,
          jumlah,
          diskon1,
          diskon2,
          diskon3,
          total
        );
        if (mismatch) {
          totalMismatchCount += 1;
          warnings.push({
            baris: i + 1,
            jenis: 'total_mismatch',
            pesan:
              'Total item beda tipis dari Harga×Jumlah×diskon (tetap disimpan)',
            no_faktur: noFaktur,
            kode_obat: kodeObat,
          });
        }

        current.items.push({
          kode_obat: kodeObat,
          nama_obat: normalizeText(r[1]),
          satuan: normalizeText(r[2]),
          harga,
          jumlah,
          diskon_1: diskon1,
          diskon_2: diskon2,
          diskon_3: diskon3,
          hpp: coerceAngka(r[8]),
          hna_ppn: coerceAngka(r[9]),
          tanggal_exp: isoToDateOnly(tanggalExpIso),
          no_batch: normalizeText(r[11]),
          ketentuan_retur: normalizeText(r[12]),
          maks_bln_sblm_ed:
            maksBln !== null && Number.isFinite(maksBln)
              ? Math.round(maksBln)
              : null,
          total,
          _total_mismatch: mismatch,
        });

        i += 1;
      }

      while (i < allRows.length) {
        const r = allRows[i] || [];
        const lb = labelOf(r);

        if (FILE_SUMMARY_LABELS.has(lb)) {
          stop = true;
          break;
        }
        if (isFakturHeaderLabel(lb)) break;
        if (isEmptyRow(r)) {
          i += 1;
          continue;
        }
        if (!FAKTUR_FOOTER_LABELS.has(lb)) break;

        const amount = coerceAngka(r[14]);
        if (lb === 'subtotal :') current.subtotal = amount;
        else if (lb === 'diskon tunai :') current.diskon_tunai = amount;
        else if (lb === 'diskon :') current.diskon = amount;
        else if (lb === 'pajak :') current.pajak = amount;
        else if (lb === 'biaya :') current.biaya = amount;
        else if (lb === 'total transaksi :') current.total_transaksi = amount;

        i += 1;
      }

      fakturList.push(current);
      continue;
    }

    i += 1;
  }

  const totalItem = fakturList.reduce((n, f) => n + f.items.length, 0);

  const sample = [];
  for (const f of fakturList) {
    if (sample.length >= SAMPLE_LIMIT) break;
    sample.push({
      no_faktur: f.no_faktur,
      nama_supplier: f.nama_supplier,
      tanggal_faktur: f.tanggal_faktur,
      jenis_bayar: f.jenis_bayar,
      total_transaksi: f.total_transaksi,
      jumlah_item: f.items.length,
    });
  }

  return {
    faktur: fakturList,
    total_faktur: fakturList.length,
    total_item: totalItem,
    baris_kosong: barisKosong,
    item_tanpa_kode: itemTanpaKode,
    total_mismatch: totalMismatchCount,
    repaired,
    style_replacements,
    warnings: {
      list: warnings.slice(0, 50),
      total: warnings.length,
      item_tanpa_kode: itemTanpaKode,
      total_mismatch: totalMismatchCount,
    },
    sample,
  };
}

module.exports = {
  parsePembelianExcel,
  fakturKey,
  SAMPLE_LIMIT,
  READ_ERROR,
  TOTAL_TOLERANCE_ABS,
  TOTAL_TOLERANCE_REL,
};
