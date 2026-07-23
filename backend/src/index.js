require('dotenv').config();

const express = require('express');
const cors = require('cors');
const suppliersRouter = require('./routes/suppliers');
const pricelistTemplateRouter = require('./routes/pricelistTemplate');
const pricelistRouter = require('./routes/pricelist');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'heybat-api' });
});

app.use('/api/suppliers', suppliersRouter);
app.use('/api/pricelist-template', pricelistTemplateRouter);
app.use('/api/pricelist', pricelistRouter);

app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  if (err?.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Terjadi kesalahan server' });
});

app.listen(PORT, () => {
  console.log(`Heybat API listening on http://localhost:${PORT}`);
});
