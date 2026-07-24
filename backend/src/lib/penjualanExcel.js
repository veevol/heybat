const XLSX = require('xlsx');
const { repairVmedisXlsx } = require('./xlsxRepair');

const HEADER_SKIP_ROWS = 3;
const SAMPLE_LIMIT = 10;

const READ_ERROR =
  'File Excel tidak bisa dibaca, kemungkinan rusak dari sumbernya. Coba export ulang dari Vmedis.';

const BULAN_ID = {
  // Indonesia
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  mei: 4,
  jun: 5,
  jul: 6,
  agt: 7,
  agu: 7,
  sep: 8,
  okt: 9,
  nov: 10,
  des: 11,
  // Inggris (export Vmedis sering pakai ini)
  may: 4,
  aug: 7,
  oct: 9,
  dec: 11,
};

const COLUMN_ALIASES = {
  no_faktur: ['no. faktur', 'no faktur', 'nofaktur', 'no.faktur', 'nomor faktur'],
  kode_obat: ['kode obat', 'kodeobat', 'kode'],
  tanggal_transaksi: ['tanggal', 'tanggal transaksi', 'tgl transaksi', 'tgl'],
  nama_obat: ['nama obat', 'namaobat', 'nama barang', 'nama'],
  jumlah: ['jumlah', 'qty', 'quantity'],
  satuan: ['satuan', 'sat'],
  harga_jual_label: ['harga jual', 'tipe harga', 'jenis harga'],
  harga: ['harga', 'harga satuan'],
  subtotal: ['total', 'subtotal', 'total harga'],
  nama_dokter: ['nama dokter', 'dokter', 'nama dokter/pelanggan'],
  no_batch_ed: [
    'no. batch & ed',
    'no batch & ed',
    'no. batch/ed',
    'no batch/ed',
    'no. batch ed',
    'no batch ed',
    'batch/ed',
    'no batch',
  ],
  supplier: ['supplier', 'pbf', 'nama supplier'],
  kasir: ['kasir'],
  shift: ['shift'],
};

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isDashEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'number') return false;
  if (value instanceof Date) return Number.isNaN(value.getTime());
  const trimmed = String(value).trim();
  return trimmed === '' || trimmed === '-';
}

function normalizeText(value) {
  if (isDashEmpty(value)) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** Format Indonesia: "255.000,00" → 255000 ; "1.250" → 1250 ; "12,5" → 12.5 */
function parseAngkaIndonesia(value) {
  if (isDashEmpty(value)) return null;
  let raw = String(value).trim();
  raw = raw.replace(/Rp\.?\s*/gi, '').replace(/\s/g, '');
  if (!raw || raw === '-') return null;

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');

  if (hasComma && hasDot) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    raw = raw.replace(',', '.');
  } else if (hasDot) {
    const parts = raw.split('.');
    if (
      parts.length > 2 ||
      (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3)
    ) {
      raw = raw.replace(/\./g, '');
    }
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) return null;
  return num;
}

/**
 * Angka dari sel Excel: number asli dipakai langsung;
 * teks (kadang tetap berformat ID) → parseAngkaIndonesia.
 */
function coerceAngka(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return parseAngkaIndonesia(value);
}

/** "01 Jul 2026 07:51:29" → ISO string */
function parseTanggalVmedis(value) {
  if (isDashEmpty(value)) return null;
  const raw = String(value).trim();
  const m = raw.match(
    /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (!m) return null;

  const day = Number(m[1]);
  const bulanKey = m[2].toLowerCase();
  const month = BULAN_ID[bulanKey];
  const year = Number(m[3]);
  const hour = m[4] != null ? Number(m[4]) : 0;
  const minute = m[5] != null ? Number(m[5]) : 0;
  const second = m[6] != null ? Number(m[6]) : 0;

  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  if (day < 1 || day > 31) return null;

  const iso = `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}+07:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Tanggal dari sel Excel: Date asli / serial Excel → ISO;
 * teks → parseTanggalVmedis.
 */
function coerceTanggal(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Serial date Excel (kalau cellDates tidak mengonversi)
    try {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        const iso = `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}T${String(parsed.H || 0).padStart(2, '0')}:${String(parsed.M || 0).padStart(2, '0')}:${String(Math.floor(parsed.S || 0)).padStart(2, '0')}+07:00`;
        const d = new Date(iso);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
      }
    } catch {
      /* fall through */
    }
  }
  return parseTanggalVmedis(value);
}

function classifyKategoriPelanggan(namaDokter, hargaJualLabel) {
  const dokter = String(namaDokter || '');
  const label = String(hargaJualLabel || '').trim();
  const hasMitra = /mitra/i.test(dokter);
  const hasTitip = /titip/i.test(dokter);
  const isHarga3 = label.toLowerCase() === 'harga jual 3';

  // Kedua syarat Mitra terpenuhi
  if (hasMitra && isHarga3) return 'mitra';
  // Kedua syarat Titip terpenuhi
  if (hasTitip && isHarga3) return 'titip';
  // Hanya salah satu syarat Mitra, atau hanya salah satu syarat Titip
  if (hasMitra || hasTitip || isHarga3) return 'perlu_cek';
  return 'retail';
}

function buildColumnMap(headerCells) {
  const map = {};
  const normalized = headerCells.map(normalizeHeader);

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    // Cari alias berurutan (prioritas: Total sebelum Subtotal, dll.)
    let idx = -1;
    for (const alias of aliases) {
      idx = normalized.findIndex((h) => h === alias);
      if (idx >= 0) break;
    }
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

function cellAt(row, colMap, field) {
  const idx = colMap[field];
  if (idx === undefined || idx < 0) return null;
  return row[idx];
}

/**
 * Baca sheet pertama sebagai array-of-arrays (raw + Date),
 * setelah auto-repair styles Vmedis.
 */
function readPenjualanRows(buffer) {
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
    console.error('[penjualanExcel] XLSX.read gagal setelah repair:', err?.message || err);
    throw new Error(READ_ERROR);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(READ_ERROR);
  }

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
    console.error('[penjualanExcel] sheet_to_json gagal:', err?.message || err);
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
 * Parse buffer Excel Vmedis (.xlsx): repair styles → baca sheet → logic sama CSV.
 */
function parsePenjualanExcel(buffer) {
  const { rows: allRows, repaired, style_replacements } = readPenjualanRows(buffer);

  if (!allRows.length || allRows.length <= HEADER_SKIP_ROWS) {
    throw new Error(
      'File Excel terlalu pendek — butuh 3 baris judul + 1 baris header kolom + data'
    );
  }

  const headerRow = allRows[HEADER_SKIP_ROWS] || [];
  const colMap = buildColumnMap(headerRow);

  const required = ['no_faktur', 'kode_obat', 'tanggal_transaksi'];
  const missing = required.filter((f) => colMap[f] === undefined);
  if (missing.length) {
    throw new Error(
      `Header kolom tidak dikenali. Wajib ada: No. Faktur, Kode Obat, Tanggal. Hilang: ${missing.join(', ')}`
    );
  }

  const dataRows = allRows.slice(HEADER_SKIP_ROWS + 1);
  const items = [];
  const warnings = [];
  const perluCek = [];
  let barisGagalTanggal = 0;
  let barisGagalAngka = 0;
  let barisKosong = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] || [];
    const rowNum = HEADER_SKIP_ROWS + 2 + i;

    const noFaktur = normalizeText(cellAt(row, colMap, 'no_faktur'));
    const kodeObat = normalizeText(cellAt(row, colMap, 'kode_obat'));

    if (!noFaktur && !kodeObat) {
      const any = row.some((c) => !isDashEmpty(c));
      if (!any) {
        barisKosong += 1;
        continue;
      }
    }

    if (!noFaktur || !kodeObat) {
      warnings.push({
        baris: rowNum,
        jenis: 'kunci_kosong',
        pesan: 'No. Faktur atau Kode Obat kosong — baris di-skip',
      });
      continue;
    }

    const tanggalRaw = cellAt(row, colMap, 'tanggal_transaksi');
    const tanggalTransaksi = coerceTanggal(tanggalRaw);
    if (!tanggalTransaksi) {
      barisGagalTanggal += 1;
      warnings.push({
        baris: rowNum,
        jenis: 'tanggal',
        pesan: `Gagal parse tanggal: "${normalizeText(tanggalRaw) || ''}"`,
        no_faktur: noFaktur,
        kode_obat: kodeObat,
      });
      continue;
    }

    const jumlahRaw = cellAt(row, colMap, 'jumlah');
    const hargaRaw = cellAt(row, colMap, 'harga');
    const subtotalRaw = cellAt(row, colMap, 'subtotal');

    const jumlah = coerceAngka(jumlahRaw);
    const harga = coerceAngka(hargaRaw);
    const subtotal = coerceAngka(subtotalRaw);

    let angkaWarning = false;
    if (!isDashEmpty(jumlahRaw) && jumlah === null) {
      barisGagalAngka += 1;
      angkaWarning = true;
      warnings.push({
        baris: rowNum,
        jenis: 'angka',
        pesan: `Gagal parse jumlah: "${normalizeText(jumlahRaw)}"`,
        no_faktur: noFaktur,
        kode_obat: kodeObat,
      });
    }
    if (!isDashEmpty(hargaRaw) && harga === null) {
      if (!angkaWarning) barisGagalAngka += 1;
      warnings.push({
        baris: rowNum,
        jenis: 'angka',
        pesan: `Gagal parse harga: "${normalizeText(hargaRaw)}"`,
        no_faktur: noFaktur,
        kode_obat: kodeObat,
      });
    }
    if (!isDashEmpty(subtotalRaw) && subtotal === null) {
      if (!angkaWarning) barisGagalAngka += 1;
      warnings.push({
        baris: rowNum,
        jenis: 'angka',
        pesan: `Gagal parse total: "${normalizeText(subtotalRaw)}"`,
        no_faktur: noFaktur,
        kode_obat: kodeObat,
      });
    }

    const namaDokter = normalizeText(cellAt(row, colMap, 'nama_dokter'));
    const hargaJualLabel = normalizeText(cellAt(row, colMap, 'harga_jual_label'));
    const kategori = classifyKategoriPelanggan(namaDokter, hargaJualLabel);

    const item = {
      no_faktur: noFaktur,
      kode_obat: kodeObat,
      tanggal_transaksi: tanggalTransaksi,
      nama_obat: normalizeText(cellAt(row, colMap, 'nama_obat')),
      jumlah,
      satuan: normalizeText(cellAt(row, colMap, 'satuan')),
      harga_jual_label: hargaJualLabel,
      harga,
      subtotal,
      nama_dokter: namaDokter,
      kategori_pelanggan: kategori,
      no_batch_ed: normalizeText(cellAt(row, colMap, 'no_batch_ed')),
      supplier: normalizeText(cellAt(row, colMap, 'supplier')),
      kasir: normalizeText(cellAt(row, colMap, 'kasir')),
      shift: normalizeText(cellAt(row, colMap, 'shift')),
      _baris_sumber: rowNum,
    };

    items.push(item);
    if (kategori === 'perlu_cek') {
      perluCek.push({
        baris: rowNum,
        no_faktur: noFaktur,
        kode_obat: kodeObat,
        nama_obat: item.nama_obat,
        nama_dokter: namaDokter,
        harga_jual_label: hargaJualLabel,
        tanggal_transaksi: tanggalTransaksi,
        subtotal,
      });
    }
  }

  return {
    items,
    perlu_cek: perluCek,
    headers: headerRow.map((h) => String(h ?? '').trim()),
    column_map: colMap,
    total_baris_file: dataRows.length,
    total_baris_valid: items.length,
    baris_kosong: barisKosong,
    repaired,
    style_replacements,
    warnings: {
      list: warnings.slice(0, 50),
      total: warnings.length,
      gagal_tanggal: barisGagalTanggal,
      gagal_angka: barisGagalAngka,
    },
    sample: items.slice(0, SAMPLE_LIMIT).map(({ _baris_sumber, ...rest }) => rest),
  };
}

function pairKey(noFaktur, kodeObat) {
  return `${String(noFaktur)}\u0000${String(kodeObat)}`;
}

module.exports = {
  parsePenjualanExcel,
  parseAngkaIndonesia,
  parseTanggalVmedis,
  coerceAngka,
  coerceTanggal,
  classifyKategoriPelanggan,
  normalizeText,
  pairKey,
  SAMPLE_LIMIT,
  READ_ERROR,
};
