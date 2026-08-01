import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Flag } from 'lucide-react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';
import {
  formatHargaPecahan,
  formatSatuanGabung,
  formatStokPecahan,
} from '../lib/obatYelo';

const cardClass = 'rounded-[4px] bg-bg-base px-2.5 py-2';

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-1.5 text-[13px] leading-snug">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 text-text-primary">{children || '—'}</dd>
    </div>
  );
}

function formatNumberPlain(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function satuan1Nama(obat) {
  return (
    obat?.satuan_1?.nama ||
    obat?.satuan_1_nama ||
    (typeof obat?.satuan_1 === 'string' ? obat.satuan_1 : null) ||
    null
  );
}

function formatMinJual(obat) {
  const min = obat?.min_jual;
  if (min === null || min === undefined || min === '') return null;
  const sat1 = satuan1Nama(obat);
  return sat1 ? `${min} ${sat1}` : String(min);
}

/** Stok & harga — tanpa label section, HJ 1 / HJ 3 polos. */
function StokHargaSection({ obat, stokRingkasan, kodeObat }) {
  const navigate = useNavigate();
  const belumAdaData =
    !stokRingkasan ||
    stokRingkasan.stok_total === null ||
    stokRingkasan.stok_total === undefined;

  const stokLabel = formatStokPecahan(
    stokRingkasan?.stok_total,
    obat,
    stokRingkasan?.satuan
  );
  const h1Label = formatHargaPecahan(
    stokRingkasan?.harga_1,
    obat,
    stokRingkasan?.satuan
  );
  const h3Label = formatHargaPecahan(
    stokRingkasan?.harga_3,
    obat,
    stokRingkasan?.satuan
  );

  const flagBtn = stokRingkasan?.ada_penandaan_terbuka ? (
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
  ) : null;

  return (
    <section className={cardClass}>
      {belumAdaData ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] text-text-muted">Belum ada data</p>
          {flagBtn}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 text-[16px] font-bold leading-snug text-text-primary">
              {stokLabel || '—'}
            </p>
            {flagBtn}
          </div>

          {(stokRingkasan.gudang_list || []).length > 1 ? (
            <ul className="space-y-0.5 text-[11px] text-text-secondary">
              {stokRingkasan.gudang_list.map((g) => (
                <li key={g.gudang} className="flex justify-between gap-2">
                  <span>{g.gudang}</span>
                  <span className="font-medium text-text-primary">
                    {formatStokPecahan(g.stok_total, obat, g.satuan) ||
                      formatNumberPlain(g.stok_total) ||
                      '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="space-y-0.5 text-[11px] leading-snug text-text-secondary">
            <p>HJ 1: {h1Label || '—'}</p>
            <p>HJ 3: {h3Label || '—'}</p>
          </div>
        </div>
      )}
    </section>
  );
}

/** Header sama gaya Section 1 kartu list: nama bold + pill kode. */
export function ObatModalTitle({ nama, kode }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <h2 className="min-w-0 flex-1 truncate text-[13px] font-bold leading-none text-text-primary">
        {nama || 'Obat'}
      </h2>
      {kode ? (
        <span className="shrink-0 rounded-[4px] bg-[#2e2d34] px-1.5 py-1 text-[10px] font-semibold leading-none text-text-secondary">
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
  const isiKemasan = formatSatuanGabung(obat);
  const minJualLabel = formatMinJual(obat);
  const supplierText = (suppliers || [])
    .map((s) => s.inisial || s.nama)
    .filter(Boolean)
    .join(', ');
  const showVmedis = obat.asal_input === 'app';

  return (
    <SheetModal
      title={<ObatModalTitle nama={obat.nama_obat} kode={obat.kode_obat} />}
      onClose={onClose}
      borderless
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
      <div className="space-y-2">
        <StokHargaSection
          obat={obat}
          stokRingkasan={obat.stok_ringkasan}
          kodeObat={obat.kode_obat}
        />

        <section className={`${cardClass} space-y-1.5`}>
          <dl className="space-y-1.5">
            <Row label="Isi Kemasan">{isiKemasan}</Row>
            <Row label="Min Jual">{minJualLabel}</Row>
            <Row label="Kandungan">{obat.kandungan?.nama}</Row>
            <Row label="Substitusi">{obat.grup_substitusi?.nama || 'Non Subtitusi'}</Row>
            <Row label="Golongan">{golonganNama || null}</Row>
            <Row label="Supplier">{supplierText || null}</Row>
          </dl>
        </section>

        {showVmedis && onToggleVmedis ? (
          <label
            className={`flex cursor-pointer items-center gap-2 ${cardClass}`}
          >
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
          <section className="overflow-hidden rounded-[4px] bg-bg-base">
            <button
              type="button"
              onClick={() => setDangerOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-bg-surface-hover"
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
              <div className="border-t border-border-subtle px-2.5 py-2">
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
