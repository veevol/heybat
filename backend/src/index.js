require('dotenv').config();

const express = require('express');
const cors = require('cors');
const suppliersRouter = require('./routes/suppliers');
const pricelistTemplateRouter = require('./routes/pricelistTemplate');
const pricelistRouter = require('./routes/pricelist');
const obatYeloRouter = require('./routes/obatYelo');
const refDataRouter = require('./routes/refData');
const matchingRouter = require('./routes/matching');
const penjualanRouter = require('./routes/penjualan');
const pembelianRouter = require('./routes/pembelian');
const pembayaranHutangRouter = require('./routes/pembayaranHutang');
const rencanaBayarRouter = require('./routes/rencanaBayar');
const stokRouter = require('./routes/stok');
const forecastRouter = require('./routes/forecast');
const dokumenSpRouter = require('./routes/dokumenSp');
const meRouter = require('./routes/me');
const kelolaAksesRouter = require('./routes/kelolaAkses');

const app = express();
const PORT = process.env.PORT || 3001;

/** Comma-separated list, e.g. https://heybat.vercel.app,http://localhost:5173 */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://heybat.vercel.app',
  'http://localhost:5173',
];

function parseAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (raw && String(raw).trim()) {
    return String(raw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

const allowedOrigins = parseAllowedOrigins();

function isOriginAllowed(origin) {
  if (!origin) return true; // curl / server-to-server / same-origin tools
  if (allowedOrigins.includes(origin)) return true;
  // Any local Vite port during development
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;
  // Heybat production + Vercel preview URLs (heybat-xxx.vercel.app)
  if (/^https:\/\/heybat([a-z0-9-]*?)\.vercel\.app$/.test(origin)) return true;
  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      console.warn(`[cors] blocked origin: ${origin}`);
      return callback(null, false);
    },
  })
);
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'heybat-api' });
});

app.use('/api/me', meRouter);
app.use('/api/kelola-akses', kelolaAksesRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/pricelist-template', pricelistTemplateRouter);
app.use('/api/pricelist', pricelistRouter);
app.use('/api/obat-yelo', obatYeloRouter);
app.use('/api/ref', refDataRouter);
app.use('/api/matching', matchingRouter);
app.use('/api/penjualan', penjualanRouter);
app.use('/api/pembelian', pembelianRouter);
app.use('/api/pembelian', pembayaranHutangRouter);
app.use('/api/pembelian', rencanaBayarRouter);
app.use('/api/stok', stokRouter);
app.use('/api/forecast', forecastRouter);
app.use('/api/dokumen-sp', dokumenSpRouter);

app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Terjadi kesalahan server' });
});

app.listen(PORT, () => {
  console.log(`Heybat API listening on http://localhost:${PORT}`);
  console.log(`[cors] allowed origins (env/default): ${allowedOrigins.join(', ')}`);
  console.log('[cors] also allowing localhost:* and heybat*.vercel.app');
});
