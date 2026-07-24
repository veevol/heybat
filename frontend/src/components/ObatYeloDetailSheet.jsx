import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';
import { formatSatuanGabung, golonganBadgeClass } from '../lib/obatYelo';

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-1.5 text-[13px] leading-snug">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{children || '—'}</dd>
    </div>
  );
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function ObatModalTitle({ nama, kode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <h2 className="truncate text-[15px] font-semibold leading-none text-text-primary">
        {nama || 'Obat'}
      </h2>
      {kode ? (
        <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-bg-base">
          {kode}
        </span>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   obat: object,
 *   suppliers?: Array<{ id?: string, inisial?: string | null, nama?: string | null }>,
 *   onClose: () => void,
 *   onEdit: (obat: object) => void,
 *   onDelete: (obat: object) => void,
 *   onToggleVmedis?: (obat: object, checked: boolean) => Promise<void> | void,
 *   vmedisBusy?: boolean,
 * }} props
 */
export default function ObatYeloDetailSheet({
  obat,
  suppliers = [],
  onClose,
  onEdit,
  onDelete,
  onToggleVmedis,
  vmedisBusy = false,
}) {
  const [dangerOpen, setDangerOpen] = useState(false);

  if (!obat) return null;

  const golonganNama = obat.golongan?.nama;
  const satuanGabung = formatSatuanGabung(obat);
  const pills = (suppliers || [])
    .map((s) => s.inisial || s.nama)
    .filter(Boolean);
  const showVmedis = obat.asal_input === 'app';

  return (
    <SheetModal
      title={<ObatModalTitle nama={obat.nama_obat} kode={obat.kode_obat} />}
      onClose={onClose}
      footer={
        onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(obat)}
            className="w-full rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110"
          >
            Edit
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        <dl className="space-y-1.5">
          <Row label="Stok & Harga">
            <span className="text-text-muted">Belum tersedia</span>
          </Row>
          <Row label="Min Jual">{formatNumber(obat.min_jual)}</Row>
          <Row label="Satuan">{satuanGabung}</Row>
          <Row label="Kandungan">{obat.kandungan?.nama}</Row>
          <Row label="Substitusi">
            {obat.grup_substitusi?.nama || null}
          </Row>
          <Row label="Golongan">
            {golonganNama ? (
              <span
                className={`inline-block rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none ${golonganBadgeClass(golonganNama)}`}
              >
                {golonganNama}
              </span>
            ) : null}
          </Row>
          <Row label="Supplier">
            {pills.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {pills.map((label) => (
                  <span
                    key={label}
                    className="rounded-[4px] bg-bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                  >
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
          </Row>
        </dl>

        {showVmedis && onToggleVmedis ? (
          <label className="flex cursor-pointer items-center gap-2 rounded-[4px] border border-border-subtle px-2.5 py-2">
            <input
              type="checkbox"
              checked={Boolean(obat.sudah_ditambah_vmedis)}
              disabled={vmedisBusy}
              onChange={(e) => onToggleVmedis(obat, e.target.checked)}
              className="h-3.5 w-3.5 shrink-0 accent-accent-yellow"
            />
            <span className="flex-1 text-[13px] text-text-primary">
              Sudah Ditambahkan ke Vmedis
            </span>
            {vmedisBusy ? <SubmitSpinner className="h-3.5 w-3.5" /> : null}
          </label>
        ) : null}

        {onDelete ? (
          <section className="overflow-hidden rounded-[4px] border border-state-error/50">
            <button
              type="button"
              onClick={() => setDangerOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-state-error/5"
            >
              <span className="text-[13px] font-semibold text-state-error">
                Danger Zone
              </span>
              <ChevronDown
                className={`h-4 w-4 text-state-error transition-transform ${
                  dangerOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {dangerOpen ? (
              <div className="border-t border-state-error/40 px-2.5 py-2">
                <p className="text-[11px] leading-snug text-text-muted">
                  Hapus obat dari master data Yelo. Tidak bisa dibatalkan.
                </p>
                <button
                  type="button"
                  onClick={() => onDelete(obat)}
                  className="mt-2 w-full rounded-[4px] border border-state-error/50 px-3 py-2 text-[13px] font-medium text-state-error hover:bg-state-error/10"
                >
                  Hapus Obat
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </SheetModal>
  );
}
