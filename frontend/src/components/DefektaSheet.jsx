import { useEffect, useMemo, useState } from 'react';
import {
  formatNumberId,
  formatStokPecahan,
  golonganBadgeClass,
  golonganInisial,
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

/**
 * Modal Defekta — pilih PBF untuk 1 obat forecast.
 */
export default function DefektaSheet({
  open,
  obat,
  candidates = [],
  loading = false,
  saving = false,
  selectedSupplierId = null,
  recommendedSupplierId = null,
  onSelectSupplier,
  onSave,
  onReset,
  onClose,
}) {
  const [localSelected, setLocalSelected] = useState(null);

  useEffect(() => {
    if (open) {
      setLocalSelected(selectedSupplierId || recommendedSupplierId || null);
    }
  }, [open, selectedSupplierId, recommendedSupplierId, obat?.kode_obat]);

  const golonganNama = obat?.golongan?.nama;
  const golonganLabel = golonganInisial(golonganNama);

  const sorted = useMemo(
    () => [...(candidates || [])].sort((a, b) => (b.skor || 0) - (a.skor || 0)),
    [candidates]
  );

  if (!open || !obat) return null;

  const activeId = localSelected;

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
              const rec = recommendedSupplierId;
              setLocalSelected(rec);
              onReset?.(rec);
            }}
            disabled={saving || loading}
            className="flex-1 rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary hover:bg-bg-surface-hover disabled:opacity-50 sm:flex-none sm:min-w-24"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => onSave?.(activeId)}
            disabled={saving || loading || !activeId}
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
                  return (
                    <li key={`${row.supplier_id}-${row.pricelist_kode_pbf || ''}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setLocalSelected(row.supplier_id);
                          onSelectSupplier?.(row.supplier_id);
                        }}
                        disabled={saving}
                        className={`grid w-full grid-cols-[52px_1fr_1fr] gap-2 px-2.5 py-2 text-left text-[13px] hover:bg-bg-surface-hover disabled:opacity-50 ${
                          selected ? 'bg-accent-yellow/10' : ''
                        }`}
                      >
                        <span className="truncate font-semibold text-text-primary">
                          {row.inisial || row.nama || '—'}
                        </span>
                        <span className="truncate text-text-secondary">
                          {formatStokSupplier(row)}
                        </span>
                        <span className="truncate text-right font-medium text-text-primary">
                          {formatHarga(row.harga_dasar)}
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
