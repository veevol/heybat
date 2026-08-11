const express = require('express');
const { supabase } = require('../db');
const { normalizeText } = require('../lib/penjualanExcel');
const {
  requireAuth,
  requireApproved,
  requireMenuAksi,
} = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireApproved);

function actorFromReq(req) {
  return (
    normalizeText(req.user?.nama) ||
    normalizeText(req.user?.email) ||
    normalizeText(req.headers['x-heybat-actor']) ||
    normalizeText(req.body?.actor) ||
    'staf'
  );
}

async function fetchAllRows(buildQuery, pageSize = 1000) {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

function coerceAngka(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '.'));
  return Number.isFinite(n) ? n : null;
}

function coerceDateOnly(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const d = new Date(text);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadPaymentAggByFakturIds(fakturIds) {
  const map = new Map();
  if (!fakturIds.length) return map;

  const chunkSize = 100;
  for (let i = 0; i < fakturIds.length; i += chunkSize) {
    const chunk = fakturIds.slice(i, i + chunkSize);
    const rows = await fetchAllRows(() =>
      supabase
        .from('pembayaran_hutang')
        .select('faktur_id, nominal, ditandai_lunas_manual')
        .in('faktur_id', chunk)
    );
    for (const row of rows) {
      const id = row.faktur_id;
      let agg = map.get(id);
      if (!agg) {
        agg = { total_bayar: 0, lunas_manual: false };
        map.set(id, agg);
      }
      agg.total_bayar += Number(row.nominal) || 0;
      if (row.ditandai_lunas_manual) agg.lunas_manual = true;
    }
  }
  return map;
}

function sisaFromFaktur(faktur, payAgg) {
  const total = Number(faktur.total_transaksi) || 0;
  const bayar = Number(payAgg?.total_bayar) || 0;
  const sisa = total - bayar;
  return sisa < 0 ? 0 : sisa;
}

async function findDraftBySupplier(namaSupplier) {
  const { data, error } = await supabase
    .from('rencana_bayar')
    .select('*')
    .eq('nama_supplier', namaSupplier)
    .eq('status', 'draft')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertDraftItems(rencanaId, items) {
  // items: [{ faktur_id, nominal_rencana, sisa_hutang_saat_disimpan }]
  for (const it of items) {
    const { data: existing, error: findErr } = await supabase
      .from('rencana_bayar_item')
      .select('id')
      .eq('rencana_bayar_id', rencanaId)
      .eq('faktur_id', it.faktur_id)
      .maybeSingle();
    if (findErr) throw findErr;

    if (existing?.id) {
      const { error } = await supabase
        .from('rencana_bayar_item')
        .update({
          nominal_rencana: it.nominal_rencana,
          sisa_hutang_saat_disimpan: it.sisa_hutang_saat_disimpan,
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('rencana_bayar_item').insert({
        rencana_bayar_id: rencanaId,
        faktur_id: it.faktur_id,
        nominal_rencana: it.nominal_rencana,
        sisa_hutang_saat_disimpan: it.sisa_hutang_saat_disimpan,
      });
      if (error) throw error;
    }
  }
}

async function buildDraftDetail(rencana) {
  const items = await fetchAllRows(() =>
    supabase
      .from('rencana_bayar_item')
      .select('id, rencana_bayar_id, faktur_id, nominal_rencana, sisa_hutang_saat_disimpan')
      .eq('rencana_bayar_id', rencana.id)
      .order('id', { ascending: true })
  );

  const fakturIds = items.map((i) => i.faktur_id);
  const fakturRows = fakturIds.length
    ? await fetchAllRows(() =>
        supabase
          .from('pembelian_faktur')
          .select(
            'id, no_faktur, nama_supplier, tanggal_faktur, jatuh_tempo, total_transaksi, jenis_bayar'
          )
          .in('id', fakturIds)
      )
    : [];
  const fakturMap = new Map(fakturRows.map((f) => [f.id, f]));
  const payMap = await loadPaymentAggByFakturIds(fakturIds);

  let totalRencana = 0;
  let adaReset = false;
  const detailItems = items.map((it) => {
    const f = fakturMap.get(it.faktur_id);
    const sisaRealtime = f ? sisaFromFaktur(f, payMap.get(f.id)) : 0;
    const sisaSnapshot = Number(it.sisa_hutang_saat_disimpan);
    const isReset =
      Number.isFinite(sisaSnapshot) && sisaSnapshot !== sisaRealtime;
    const nominal = isReset ? sisaRealtime : Number(it.nominal_rencana) || 0;
    if (isReset) adaReset = true;
    totalRencana += nominal;
    return {
      id: it.id,
      faktur_id: it.faktur_id,
      no_faktur: f?.no_faktur || null,
      nama_supplier: f?.nama_supplier || rencana.nama_supplier,
      tanggal_faktur: f?.tanggal_faktur || null,
      jatuh_tempo: f?.jatuh_tempo || null,
      total_transaksi: f?.total_transaksi ?? null,
      sisa_hutang_saat_disimpan: it.sisa_hutang_saat_disimpan,
      sisa_hutang: sisaRealtime,
      nominal_rencana: nominal,
      nominal_rencana_tersimpan: Number(it.nominal_rencana) || 0,
      is_reset: isReset,
    };
  });

  return {
    ...rencana,
    items: detailItems,
    jumlah_faktur: detailItems.length,
    total_rencana: totalRencana,
    ada_reset: adaReset,
  };
}

// ---------------------------------------------------------------------------
// GET /rencana-bayar — list draft aktif, grouped per supplier
// ---------------------------------------------------------------------------
router.get(
  '/rencana-bayar',
  requireMenuAksi('pembelian', 'lihat'),
  async (_req, res) => {
    try {
      const drafts = await fetchAllRows(() =>
        supabase
          .from('rencana_bayar')
          .select(
            'id, nama_supplier, status, tanggal_rencana, metode_bayar, catatan, dibuat_oleh, tanggal_dibuat'
          )
          .eq('status', 'draft')
          .order('nama_supplier', { ascending: true })
          .order('id', { ascending: false })
      );

      if (!drafts.length) {
        return res.json({ items: [], total: 0 });
      }

      const draftIds = drafts.map((d) => d.id);
      const allItems = await fetchAllRows(() =>
        supabase
          .from('rencana_bayar_item')
          .select(
            'id, rencana_bayar_id, faktur_id, nominal_rencana, sisa_hutang_saat_disimpan'
          )
          .in('rencana_bayar_id', draftIds)
      );

      const fakturIds = [...new Set(allItems.map((i) => i.faktur_id))];
      const fakturRows = fakturIds.length
        ? await fetchAllRows(() =>
            supabase
              .from('pembelian_faktur')
              .select('id, total_transaksi')
              .in('id', fakturIds)
          )
        : [];
      const fakturMap = new Map(fakturRows.map((f) => [f.id, f]));
      const payMap = await loadPaymentAggByFakturIds(fakturIds);

      const itemsByDraft = new Map();
      for (const it of allItems) {
        if (!itemsByDraft.has(it.rencana_bayar_id)) {
          itemsByDraft.set(it.rencana_bayar_id, []);
        }
        itemsByDraft.get(it.rencana_bayar_id).push(it);
      }

      const items = drafts.map((d) => {
        const its = itemsByDraft.get(d.id) || [];
        let total = 0;
        for (const it of its) {
          const f = fakturMap.get(it.faktur_id);
          const sisaRealtime = f ? sisaFromFaktur(f, payMap.get(f.id)) : 0;
          const sisaSnapshot = Number(it.sisa_hutang_saat_disimpan);
          const isReset =
            Number.isFinite(sisaSnapshot) && sisaSnapshot !== sisaRealtime;
          total += isReset ? sisaRealtime : Number(it.nominal_rencana) || 0;
        }
        return {
          id: d.id,
          nama_supplier: d.nama_supplier,
          status: d.status,
          tanggal_rencana: d.tanggal_rencana,
          metode_bayar: d.metode_bayar,
          catatan: d.catatan,
          dibuat_oleh: d.dibuat_oleh,
          tanggal_dibuat: d.tanggal_dibuat,
          jumlah_faktur: its.length,
          total_rencana: total,
        };
      });

      return res.json({ items, total: items.length });
    } catch (err) {
      console.error('[GET /pembelian/rencana-bayar]', err);
      return res.status(500).json({
        error: err.message || 'Gagal memuat jadwal bayar',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /rencana-bayar/:id — detail + is_reset (read-only, tidak update DB)
// ---------------------------------------------------------------------------
router.get(
  '/rencana-bayar/:id',
  requireMenuAksi('pembelian', 'lihat'),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ error: 'id tidak valid' });
      }

      const { data: rencana, error } = await supabase
        .from('rencana_bayar')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!rencana) {
        return res.status(404).json({ error: 'Jadwal bayar tidak ditemukan' });
      }

      const detail = await buildDraftDetail(rencana);
      return res.json({ item: detail });
    } catch (err) {
      console.error('[GET /pembelian/rencana-bayar/:id]', err);
      return res.status(500).json({
        error: err.message || 'Gagal memuat detail jadwal bayar',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /rencana-bayar — buat/gabung draft; auto-split per supplier
// Body: { items: [{ faktur_id, nominal_rencana? }], tanggal_rencana?, metode_bayar?, catatan? }
// ---------------------------------------------------------------------------
router.post(
  '/rencana-bayar',
  requireMenuAksi('pembelian', 'tambah'),
  async (req, res) => {
    try {
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!rawItems.length) {
        return res.status(400).json({ error: 'items tidak boleh kosong' });
      }

      const tanggalRencana = coerceDateOnly(req.body?.tanggal_rencana);
      const metodeBayar = normalizeText(req.body?.metode_bayar);
      const catatan = normalizeText(req.body?.catatan);
      const aktor = actorFromReq(req);
      const nowIso = new Date().toISOString();

      const parsedReq = [];
      const seen = new Set();
      for (let i = 0; i < rawItems.length; i += 1) {
        const it = rawItems[i] || {};
        const fakturId = parseInt(String(it.faktur_id), 10);
        if (!Number.isFinite(fakturId) || fakturId < 1) {
          return res.status(400).json({
            error: `items[${i}]: faktur_id tidak valid`,
          });
        }
        if (seen.has(fakturId)) {
          return res.status(400).json({
            error: `items[${i}]: faktur_id duplikat`,
            faktur_id: fakturId,
          });
        }
        seen.add(fakturId);
        const nominalOpt = coerceAngka(it.nominal_rencana);
        parsedReq.push({
          faktur_id: fakturId,
          nominal_opt: nominalOpt,
        });
      }

      const fakturIds = parsedReq.map((p) => p.faktur_id);
      const fakturRows = await fetchAllRows(() =>
        supabase
          .from('pembelian_faktur')
          .select('id, nama_supplier, jenis_bayar, total_transaksi')
          .in('id', fakturIds)
      );
      const fakturMap = new Map(fakturRows.map((f) => [f.id, f]));
      const payMap = await loadPaymentAggByFakturIds(fakturIds);

      const bySupplier = new Map();
      for (const p of parsedReq) {
        const f = fakturMap.get(p.faktur_id);
        if (!f) {
          return res.status(400).json({
            error: `Faktur ${p.faktur_id} tidak ditemukan`,
            faktur_id: p.faktur_id,
          });
        }
        if (String(f.jenis_bayar || '').toUpperCase() !== 'HUTANG') {
          return res.status(400).json({
            error: `Faktur ${p.faktur_id} bukan jenis HUTANG`,
            faktur_id: p.faktur_id,
          });
        }
        const supplier = normalizeText(f.nama_supplier) || f.nama_supplier;
        if (!supplier) {
          return res.status(400).json({
            error: `Faktur ${p.faktur_id} tidak punya nama_supplier`,
            faktur_id: p.faktur_id,
          });
        }
        const sisa = sisaFromFaktur(f, payMap.get(f.id));
        if (!(sisa > 0)) {
          return res.status(400).json({
            error: `Faktur ${p.faktur_id} sudah lunas / sisa 0`,
            faktur_id: p.faktur_id,
          });
        }
        const nominal =
          p.nominal_opt !== null && p.nominal_opt > 0 ? p.nominal_opt : sisa;

        if (!bySupplier.has(supplier)) bySupplier.set(supplier, []);
        bySupplier.get(supplier).push({
          faktur_id: p.faktur_id,
          nominal_rencana: nominal,
          sisa_hutang_saat_disimpan: sisa,
        });
      }

      const results = [];
      for (const [supplier, items] of bySupplier.entries()) {
        let draft = await findDraftBySupplier(supplier);
        if (draft) {
          const patch = {
            dibuat_oleh: aktor,
            tanggal_dibuat: nowIso,
          };
          if (tanggalRencana) patch.tanggal_rencana = tanggalRencana;
          if (metodeBayar !== null && metodeBayar !== undefined) {
            patch.metode_bayar = metodeBayar;
          }
          if (catatan !== null && catatan !== undefined) {
            patch.catatan = catatan;
          }
          const { data: updated, error: updErr } = await supabase
            .from('rencana_bayar')
            .update(patch)
            .eq('id', draft.id)
            .select('*')
            .single();
          if (updErr) throw updErr;
          draft = updated;
          await upsertDraftItems(draft.id, items);
        } else {
          const { data: created, error: insErr } = await supabase
            .from('rencana_bayar')
            .insert({
              nama_supplier: supplier,
              status: 'draft',
              tanggal_rencana: tanggalRencana,
              metode_bayar: metodeBayar,
              catatan,
              dibuat_oleh: aktor,
              tanggal_dibuat: nowIso,
            })
            .select('*')
            .single();
          if (insErr) throw insErr;
          draft = created;
          await upsertDraftItems(draft.id, items);
        }

        const detail = await buildDraftDetail(draft);
        results.push({
          id: detail.id,
          nama_supplier: detail.nama_supplier,
          jumlah_faktur: detail.jumlah_faktur,
          total_rencana: detail.total_rencana,
          status: detail.status,
        });
      }

      return res.status(201).json({
        drafts: results,
        jumlah_draft: results.length,
        diinput_oleh: aktor,
      });
    } catch (err) {
      console.error('[POST /pembelian/rencana-bayar]', err);
      return res.status(500).json({
        error: err.message || 'Gagal menyimpan jadwal bayar',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// PUT /rencana-bayar/:id — full replace items + meta draft
// ---------------------------------------------------------------------------
router.put(
  '/rencana-bayar/:id',
  requireMenuAksi('pembelian', 'tambah'),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ error: 'id tidak valid' });
      }

      const { data: rencana, error: findErr } = await supabase
        .from('rencana_bayar')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!rencana) {
        return res.status(404).json({ error: 'Jadwal bayar tidak ditemukan' });
      }
      if (rencana.status !== 'draft') {
        return res.status(400).json({ error: 'Hanya draft yang bisa diedit' });
      }

      const tanggalRencana = coerceDateOnly(req.body?.tanggal_rencana);
      const metodeBayar =
        req.body?.metode_bayar === undefined
          ? undefined
          : normalizeText(req.body.metode_bayar);
      const catatan =
        req.body?.catatan === undefined
          ? undefined
          : normalizeText(req.body.catatan);
      const aktor = actorFromReq(req);
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : null;

      if (rawItems !== null && rawItems.length === 0) {
        return res.status(400).json({
          error: 'items tidak boleh kosong — batalkan draft jika ingin kosong',
        });
      }

      let nextItems = null;
      if (rawItems) {
        const parsed = [];
        const seen = new Set();
        for (let i = 0; i < rawItems.length; i += 1) {
          const it = rawItems[i] || {};
          const fakturId = parseInt(String(it.faktur_id), 10);
          if (!Number.isFinite(fakturId) || fakturId < 1) {
            return res.status(400).json({
              error: `items[${i}]: faktur_id tidak valid`,
            });
          }
          if (seen.has(fakturId)) {
            return res.status(400).json({
              error: `items[${i}]: faktur_id duplikat`,
            });
          }
          seen.add(fakturId);
          const nominal = coerceAngka(it.nominal_rencana);
          if (nominal === null || !(nominal > 0)) {
            return res.status(400).json({
              error: `items[${i}]: nominal_rencana harus > 0`,
            });
          }
          parsed.push({ faktur_id: fakturId, nominal_rencana: nominal });
        }

        const fakturIds = parsed.map((p) => p.faktur_id);
        const fakturRows = await fetchAllRows(() =>
          supabase
            .from('pembelian_faktur')
            .select('id, nama_supplier, jenis_bayar, total_transaksi')
            .in('id', fakturIds)
        );
        const fakturMap = new Map(fakturRows.map((f) => [f.id, f]));
        const payMap = await loadPaymentAggByFakturIds(fakturIds);

        nextItems = [];
        for (const p of parsed) {
          const f = fakturMap.get(p.faktur_id);
          if (!f) {
            return res.status(400).json({
              error: `Faktur ${p.faktur_id} tidak ditemukan`,
            });
          }
          if (String(f.jenis_bayar || '').toUpperCase() !== 'HUTANG') {
            return res.status(400).json({
              error: `Faktur ${p.faktur_id} bukan jenis HUTANG`,
            });
          }
          const supplier = normalizeText(f.nama_supplier) || f.nama_supplier;
          if (supplier !== rencana.nama_supplier) {
            return res.status(400).json({
              error: `Faktur ${p.faktur_id} bukan milik supplier ${rencana.nama_supplier}`,
            });
          }
          const sisa = sisaFromFaktur(f, payMap.get(f.id));
          nextItems.push({
            faktur_id: p.faktur_id,
            nominal_rencana: p.nominal_rencana,
            sisa_hutang_saat_disimpan: sisa,
          });
        }
      }

      const patch = {
        dibuat_oleh: aktor,
        tanggal_dibuat: new Date().toISOString(),
      };
      if (req.body?.tanggal_rencana !== undefined) {
        patch.tanggal_rencana = tanggalRencana;
      }
      if (metodeBayar !== undefined) patch.metode_bayar = metodeBayar;
      if (catatan !== undefined) patch.catatan = catatan;

      const { data: updated, error: updErr } = await supabase
        .from('rencana_bayar')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (updErr) throw updErr;

      if (nextItems) {
        const { error: delErr } = await supabase
          .from('rencana_bayar_item')
          .delete()
          .eq('rencana_bayar_id', id);
        if (delErr) throw delErr;

        const { error: insErr } = await supabase
          .from('rencana_bayar_item')
          .insert(
            nextItems.map((it) => ({
              rencana_bayar_id: id,
              faktur_id: it.faktur_id,
              nominal_rencana: it.nominal_rencana,
              sisa_hutang_saat_disimpan: it.sisa_hutang_saat_disimpan,
            }))
          );
        if (insErr) throw insErr;
      }

      const detail = await buildDraftDetail(updated);
      return res.json({ item: detail });
    } catch (err) {
      console.error('[PUT /pembelian/rencana-bayar/:id]', err);
      return res.status(500).json({
        error: err.message || 'Gagal memperbarui jadwal bayar',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// DELETE /rencana-bayar/:id — hapus permanen draft
// ---------------------------------------------------------------------------
router.delete(
  '/rencana-bayar/:id',
  requireMenuAksi('pembelian', 'tambah'),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ error: 'id tidak valid' });
      }

      const { data: rencana, error: findErr } = await supabase
        .from('rencana_bayar')
        .select('id, status')
        .eq('id', id)
        .maybeSingle();
      if (findErr) throw findErr;
      if (!rencana) {
        return res.status(404).json({ error: 'Jadwal bayar tidak ditemukan' });
      }
      if (rencana.status !== 'draft') {
        return res.status(400).json({
          error: 'Hanya draft yang bisa dibatalkan/dihapus',
        });
      }

      const { error } = await supabase
        .from('rencana_bayar')
        .delete()
        .eq('id', id);
      if (error) throw error;

      return res.json({ ok: true, id });
    } catch (err) {
      console.error('[DELETE /pembelian/rencana-bayar/:id]', err);
      return res.status(500).json({
        error: err.message || 'Gagal menghapus jadwal bayar',
      });
    }
  }
);

// ---------------------------------------------------------------------------
// POST /rencana-bayar/:id/konfirmasi — bayar final (RPC atomic)
// ---------------------------------------------------------------------------
router.post(
  '/rencana-bayar/:id/konfirmasi',
  requireMenuAksi('pembelian', 'tambah'),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(400).json({ error: 'id tidak valid' });
      }

      const aktor = actorFromReq(req);
      const { data, error } = await supabase.rpc('konfirmasi_rencana_bayar', {
        p_rencana_id: id,
        p_aktor: aktor,
      });

      if (error) {
        const msg = error.message || 'Gagal konfirmasi jadwal bayar';
        if (
          /tidak ditemukan/i.test(msg) ||
          error.code === 'P0002' ||
          error.code === 'PGRST116'
        ) {
          return res.status(404).json({ error: msg });
        }
        if (
          /bukan status draft|tanggal_rencana|Tidak ada faktur|P0001/i.test(msg)
        ) {
          return res.status(400).json({ error: msg });
        }
        throw error;
      }

      return res.status(201).json({
        hasil: data,
      });
    } catch (err) {
      console.error('[POST /pembelian/rencana-bayar/:id/konfirmasi]', err);
      return res.status(500).json({
        error: err.message || 'Gagal konfirmasi jadwal bayar',
      });
    }
  }
);

module.exports = router;
