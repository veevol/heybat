import { useEffect, useMemo, useState } from 'react';
import {
  computeQtyOrderDefekta,
  formatNumberId,
  formatStokPecahan,
  golonganBadgeClass,
  golonganInisial,
  qtyOrderSatuanLabel,
} from '../lib/obatYelo';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

function satuan1Label(obatRow) {
  return (
    obatRow?.satuan_1?.nama ||
    obatRow?.satuan_1_nama ||
    (typeof obatRow?.satuan_1 === 'string' ? obatRow.satuan_1 : null) ||
    null
  );
}

function formatQtyDenganSatuan(qty, obatRow) {
  const num = formatNumberId(qty) ?? '0';
  const sat = satuan1Label(obatRow);
  return sat ? `${num} ${sat}` : num;
}

function formatKebutuhan(obatRow) {
  const label = formatStokPecahan(obatRow.kebutuhan_beli, {
    konversi: obatRow.konversi,
    satuan_1: obatRow.satuan_1,
    satuan_2: obatRow.satuan_2,
  });
  return label || `${formatNumberId(obatRow.kebutuhan_beli) ?? 0}`;
}

function formatStokSupplier(row) {
  if (row.qty == null || row.qty === '') return 'Tersedia';
  const num = formatNumberId(row.qty) ?? String(row.qty);
  const sat = row.satuan ? ` ${row.satuan}` : '';
  if (row.qty_estimasi) return `~${num}${sat}`;
  return `${num}${sat}`;
}

function formatHarga(harga) {
  if (harga == null || harga === '') return '—';
  const n = Number(harga);
  if (!Number.isFinite(n)) return '—';
  return `Rp ${formatNumberId(n) ?? n}`;
}

function formatHargaNet(row) {
  const net = row.harga_net != null ? row.harga_net : row.harga_dasar;
  const base = formatHarga(net);
  if (!row.diskon_keterangan) return base;
  return `${base} · ${row.diskon_keterangan}`;
}

function resolveDefaultQty(obat, defaultQtyOrder, qtyTersimpan) {
  if (qtyTersimpan != null && qtyTersimpan !== '') {
    const n = Number(qtyTersimpan);
    if (Number.isFinite(n)) return String(Math.round(n));
  }
  if (defaultQtyOrder != null && defaultQtyOrder !== '') {
    const n = Number(defaultQtyOrder);
    if (Number.isFinite(n)) return String(Math.round(n));
  }
  const computed = computeQtyOrderDefekta(obat?.kebutuhan_beli, obat);
  return computed == null ? '' : String(computed);
}

/**
 * Modal Defekta — pilih PBF (multi) + qty_order bulat + batalkan.
 */
export default function DefektaSheet({
  open,
  obat,
  candidates = [],
  loading = false,
  saving = false,
  selectedSupplierId = null,
  recommendedSupplierId = null,
  defaultQtyOrder = null,
  qtyOrderSatuan = null,
  onSelectSupplier,
  onSave,
  onBatalkan,
  onClose,
}) {
  const [localSelected, setLocalSelected] = useState(null);
  const [qtyOrder, setQtyOrder] = useState('');

  const satuanLabel = useMemo(
    () => qtyOrderSatuan || qtyOrderSatuanLabel(obat) || '',
    [qtyOrderSatuan, obat]
  );

  useEffect(() => {
    if (!open) return;
    setLocalSelected(selectedSupplierId || recommendedSupplierId || null);
    const fromCandidate = candidates.find(
      (c) =>
        c.supplier_id ===
        (selectedSupplierId || recommendedSupplierId || null)
    );
    setQtyOrder(
      resolveDefaultQty(
        obat,
        defaultQtyOrder,
        fromCandidate?.qty_order_tersimpan
      )
    );
  }, [
    open,
    selectedSupplierId,
    recommendedSupplierId,
    obat?.kode_obat,
    defaultQtyOrder,
    candidates,
    obat,
  ]);

  const golonganNama = obat?.golongan?.nama;
  const golonganLabel = golonganInisial(golonganNama);

  const sorted = useMemo(
    () => [...(candidates || [])].sort((a, b) => (b.skor || 0) - (a.skor || 0)),
    [candidates]
  );

  const disetujuiList = useMemo(
    () => sorted.filter((c) => c.is_disetujui),
    [sorted]
  );

  if (!open || !obat) return null;

  const activeId = localSelected;

  function selectRow(row) {
    setLocalSelected(row.supplier_id);
    onSelectSupplier?.(row.supplier_id);
    setQtyOrder(
      resolveDefaultQty(obat, defaultQtyOrder, row.qty_order_tersimpan)
    );
  }

  function handleQtyChange(raw) {
    if (raw === '') {
      setQtyOrder('');
      return;
    }
    const cleaned = String(raw).replace(/[^\d]/g, '');
    if (cleaned === '') {
      setQtyOrder('');
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) {
      setQtyOrder('');
      return;
    }
    setQtyOrder(String(Math.trunc(n)));
  }

  function handleSave() {
    const n = Number(qtyOrder);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return;
    }
    onSave?.(activeId, { qty_order: n });
  }

  return (
    <SheetModal
      title={
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-[15px] font-semibold leading-none text-text-primary">
            Def: {obat.nama_obat}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            <span className="rounded-[4px] bg-[#2e2d34] px-1.5 py-1 text-[10px] font-semibold leading-none text-text-secondary">
              {obat.kode_obat}
            </span>
            {golonganLabel ? (
              <span
                className={`rounded-[4px] px-1.5 py-1 text-[10px] font-semibold leading-none ${golonganBadgeClass(golonganNama)}`}
                title={golonganNama}
              >
                {golonganLabel}
              </span>
            ) : null}
          </div>
        </div>
      }
      onClose={() => {
        if (!saving) onClose();
      }}
      busy={saving}
      borderless
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (!saving) onClose();
            }}
            disabled={saving}
            className="flex-1 rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary hover:bg-bg-surface-hover disabled:opacity-50 sm:flex-none sm:min-w-24"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={
              saving ||
              loading ||
              !activeId ||
              qtyOrder === '' ||
              !Number.isInteger(Number(qtyOrder))
            }
            className="flex-1 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50 sm:flex-none sm:min-w-28"
          >
            {saving ? <SubmitSpinner /> : 'Save'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <section className="rounded-[4px] bg-bg-base px-2.5 py-2">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Forecast
          </p>
          <dl className="space-y-1 text-[13px]">
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Stok Sekarang</dt>
              <dd className="font-medium text-text-primary">
                {formatQtyDenganSatuan(obat.stok_sekarang, obat)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Proyeksi</dt>
              <dd className="font-medium text-text-primary">
                {formatQtyDenganSatuan(obat.perkiraan_terjual, obat)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Kebutuhan Beli</dt>
              <dd className="font-bold text-text-primary">
                {formatKebutuhan(obat)}
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Qty Order
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={qtyOrder}
              onChange={(e) => handleQtyChange(e.target.value)}
              disabled={saving || loading}
              className="min-w-0 flex-1 rounded-[4px] border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent-yellow disabled:opacity-50"
              placeholder="Qty order"
            />
            {satuanLabel ? (
              <span className="shrink-0 rounded-[4px] bg-bg-surface-hover px-2 py-2 text-[12px] font-semibold text-text-secondary">
                {satuanLabel}
              </span>
            ) : null}
          </div>
        </section>

        {disetujuiList.length > 0 ? (
          <section className="rounded-[4px] border border-accent-cyan/40 bg-accent-cyan/10 px-2.5 py-2">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Sudah Disetujui ({disetujuiList.length})
            </p>
            <ul className="space-y-1.5">
              {disetujuiList.map((row) => (
                <li
                  key={`ok-${row.supplier_id}`}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-text-primary">
                      {row.inisial || row.nama || '—'}
                    </p>
                    <p className="text-[11px] text-text-secondary">
                      Qty{' '}
                      {row.qty_order_tersimpan != null
                        ? `${formatNumberId(Math.round(Number(row.qty_order_tersimpan))) ?? Math.round(Number(row.qty_order_tersimpan))}${satuanLabel ? ` ${satuanLabel}` : ''}`
                        : '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onBatalkan?.(row.supplier_id)}
                    disabled={saving || loading}
                    className="shrink-0 rounded-[4px] border border-state-error/40 bg-state-error/10 px-2 py-1 text-[11px] font-medium text-state-error hover:bg-state-error/20 disabled:opacity-50"
                  >
                    Batalkan Pilihan
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Supplier Ready Stok
          </p>
          <div className="overflow-hidden rounded-[4px] bg-bg-base">
            {loading ? (
              <div className="flex justify-center py-8">
                <SubmitSpinner className="h-5 w-5" />
              </div>
            ) : sorted.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-[12px] text-text-muted">
                Belum ada matching supplier untuk obat ini.
              </p>
            ) : (
              <ul>
                <li className="grid grid-cols-[52px_1fr_1fr] gap-2 border-b border-border-subtle px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  <span>PBF</span>
                  <span>Stok</span>
                  <span className="text-right">Harga</span>
                </li>
                {sorted.map((row) => {
                  const selected = activeId === row.supplier_id;
                  const bobot = row.is_terpilih_bobot;
                  const setuju = row.is_disetujui;
                  return (
                    <li
                      key={`${row.supplier_id}-${row.pricelist_kode_pbf || ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => selectRow(row)}
                        disabled={saving}
                        className={`grid w-full grid-cols-[52px_1fr_1fr] gap-2 px-2.5 py-2 text-left text-[13px] hover:bg-bg-surface-hover disabled:opacity-50 ${
                          selected
                            ? 'bg-accent-yellow/10'
                            : setuju
                              ? 'bg-accent-cyan/10'
                              : ''
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-1 truncate font-semibold text-text-primary">
                          <span className="truncate">
                            {row.inisial || row.nama || '—'}
                          </span>
                          {bobot ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-yellow"
                              title="Pemenang bobot"
                            />
                          ) : null}
                          {setuju ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-cyan"
                              title="Disetujui"
                            />
                          ) : null}
                        </span>
                        <span className="truncate text-text-secondary">
                          {formatStokSupplier(row)}
                        </span>
                        <span className="truncate text-right font-medium text-text-primary">
                          {formatHargaNet(row)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </SheetModal>
  );
}
