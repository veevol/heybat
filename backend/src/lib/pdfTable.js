const CELL_PADDING_X = 3;
const CELL_PADDING_Y = 2.2;
const BORDER_COLOR = '#000000';
const WARN_COLOR = '#b91c1c';

/**
 * Cell bisa berupa string biasa, atau { text, warn, align } untuk teks
 * peringatan (mis. "Data belum lengkap") yang dirender merah/bold-italic,
 * atau override alignment per-cell.
 */
function cellText(cell) {
  if (cell && typeof cell === 'object') return cell.text ?? '';
  return cell ?? '';
}
function cellWarn(cell) {
  return Boolean(cell && typeof cell === 'object' && cell.warn);
}
function cellAlign(cell, fallback) {
  if (cell && typeof cell === 'object' && cell.align) return cell.align;
  return fallback;
}

function computeCellHeights(doc, cells, columns, fontSize) {
  return columns.map((col, i) => {
    doc.font(cellWarn(cells[i]) ? 'Helvetica-BoldOblique' : 'Helvetica').fontSize(fontSize);
    const text = cellText(cells[i]) || ' ';
    return doc.heightOfString(text, { width: col.width - CELL_PADDING_X * 2 });
  });
}

function drawGridLines(doc, x, y, columns, height) {
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);
  doc.lineWidth(0.75).strokeColor(BORDER_COLOR);
  doc.rect(x, y, totalWidth, height).stroke();
  let cx = x;
  columns.forEach((col) => {
    doc.moveTo(cx, y).lineTo(cx, y + height).stroke();
    cx += col.width;
  });
  doc.moveTo(cx, y).lineTo(cx, y + height).stroke();
}

/** Header selalu bold + center (horizontal & vertical), tanpa shading — sesuai referensi. */
function drawTableHeader(doc, x, y, columns, fontSize) {
  const cellHeights = columns.map((col) => {
    doc.font('Helvetica-Bold').fontSize(fontSize);
    return doc.heightOfString(col.header, { width: col.width - CELL_PADDING_X * 2 });
  });
  const headerHeight = Math.max(...cellHeights) + CELL_PADDING_Y * 2;

  doc.fillColor('#000000');
  let cx = x;
  columns.forEach((col, i) => {
    const ty = y + (headerHeight - cellHeights[i]) / 2;
    doc.font('Helvetica-Bold').fontSize(fontSize).text(col.header, cx + CELL_PADDING_X, ty, {
      width: col.width - CELL_PADDING_X * 2,
      align: 'center',
    });
    cx += col.width;
  });

  drawGridLines(doc, x, y, columns, headerHeight);
  return y + headerHeight;
}

/** Body row: alignment per-kolom (default kolom.align), vertically centered. */
function drawTableRow(doc, x, y, columns, cells, rowHeight, fontSize) {
  const cellHeights = computeCellHeights(doc, cells, columns, fontSize);
  let cx = x;
  columns.forEach((col, i) => {
    const warn = cellWarn(cells[i]);
    const ty = y + (rowHeight - cellHeights[i]) / 2;
    doc
      .font(warn ? 'Helvetica-BoldOblique' : 'Helvetica')
      .fontSize(fontSize)
      .fillColor(warn ? WARN_COLOR : '#000000')
      .text(cellText(cells[i]), cx + CELL_PADDING_X, ty, {
        width: col.width - CELL_PADDING_X * 2,
        align: cellAlign(cells[i], col.align || 'left'),
      });
    cx += col.width;
  });
  doc.fillColor('#000000');
  drawGridLines(doc, x, y, columns, rowHeight);
  return y + rowHeight;
}

function computeRowHeight(doc, cells, columns, fontSize) {
  const heights = computeCellHeights(doc, cells, columns, fontSize);
  return Math.max(...heights) + CELL_PADDING_Y * 2;
}

/**
 * Render tabel grid penuh (tanpa shading header) dengan teks center vertikal
 * per cell, auto page-break, dan header yang diulang di tiap halaman baru.
 * Cell bisa string atau { text, warn, align }.
 * @returns {number} y setelah tabel selesai digambar
 */
function drawTable(doc, { x, columns, rows, startY, fontSize = 8, bottomMargin }) {
  const pageBottom = doc.page.height - (bottomMargin ?? doc.page.margins.bottom);
  let y = drawTableHeader(doc, x, startY, columns, fontSize);

  for (const cells of rows) {
    const rowHeight = computeRowHeight(doc, cells, columns, fontSize);
    if (y + rowHeight > pageBottom) {
      doc.addPage();
      y = doc.page.margins.top;
      y = drawTableHeader(doc, x, y, columns, fontSize);
    }
    y = drawTableRow(doc, x, y, columns, cells, rowHeight, fontSize);
  }
  return y;
}

module.exports = { drawTable, CELL_PADDING_X, CELL_PADDING_Y };
