import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Flag } from 'lucide-react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';
import {
  formatNumberId,
  formatRupiahId,
  formatSatuanGabung,
  golonganBadgeClass,
} from '../lib/obatYelo';

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

/** Section "Stok & Harga" pada detail: total gabungan, breakdown per gudang, 3 harga, badge tindak lanjut. */
function StokHargaSection({ stokRingkasan, kodeObat }) {
  const navigate = useNavigate();
  const belumAdaData =
    !stokRingkasan ||
    stokRingkasan.stok_total === null ||
    stokRingkasan.stok_total === undefined;

  return (
    <section className="rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-text-muted">Stok & Harga</p>
        {stokRingkasan?.ada_penandaan_terbuka ? (
          <button
            type="button"
            onClick={() =>
              navigate(
                `/stok?tab=tindak&kode_obat=${encodeURIComponent(kodeObat)}`
              )
            }
            className="inline-flex shrink-0 items-center gap-1 rounded-[4px] bg-state-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-state-warning hover:bg-state-warning/25"
          >
            <Flag className="h-3 w-3" />
            Ada tindak lanjut
          </button>
        ) : null}
      </div>

      {belumAdaData ? (
        <p className="mt-1 text-[13px] text-text-muted">Belum ada data</p>
      ) : (
        <>
          <p className="mt-1 text-[16px] font-semibold leading-none text-text-primary">
            {formatNumberId(stokRingkasan.stok_total)}
            {stokRingkasan.satuan ? (
              <span className="ml-1 text-[12px] font-normal text-text-muted">
                {stokRingkasan.satuan}
              </span>
            ) : null}
          </p>

          {(stokRingkasan.gudang_list || []).length > 1 ? (
            <ul className="mt-1.5 space-y-0.5 text-[11px] text-text-secondary">
              {stokRingkasan.gudang_list.map((g) => (
                <li key={g.gudang} className="flex justify-between gap-2">
                  <span>{g.gudang}</span>
                  <span className="font-medium text-text-primary">
                    {formatNumberId(g.stok_total)}
                    {g.satuan ? ` ${g.satuan}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-secondary">
            <span>H1 (Retail): {formatRupiahId(stokRingkasan.harga_1) || '—'}</span>
            <span>H2 (Kontrol Margin): {formatRupiahId(stokRingkasan.harga_2) || '—'}</span>
            <span>
              H3 (Grosir Mitra/Karyawan): {formatRupiahId(stokRingkasan.harga_3) || '—'}
            </span>
          </div>
        </>
      )}
    </section>
  );
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
        <StokHargaSection
          stokRingkasan={obat.stok_ringkasan}
          kodeObat={obat.kode_obat}
        />

        <dl className="space-y-1.5">
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
