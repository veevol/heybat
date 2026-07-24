import SheetModal from './SheetModal';
import { golonganBadgeClass } from '../lib/obatYelo';

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

export default function ObatYeloDetailSheet({ obat, onClose, onEdit, onDelete }) {
  if (!obat) return null;

  const golonganNama = obat.golongan?.nama;

  return (
    <SheetModal
      title={<ObatModalTitle nama={obat.nama_obat} kode={obat.kode_obat} />}
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={() => onEdit(obat)}
          className="w-full rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110"
        >
          Edit
        </button>
      }
    >
      <div className="space-y-3">
        <dl className="space-y-1.5">
          <Row label="Kandungan">{obat.kandungan?.nama}</Row>
          <Row label="Golongan">
            {golonganNama ? (
              <span
                className={`inline-block rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none ${golonganBadgeClass(golonganNama)}`}
              >
                {golonganNama}
              </span>
            ) : null}
          </Row>
          <Row label="Satuan 1">{obat.satuan_1?.nama}</Row>
          <Row label="Konversi">{formatNumber(obat.konversi)}</Row>
          <Row label="Satuan 2">{obat.satuan_2?.nama}</Row>
          <Row label="Min Jual">{formatNumber(obat.min_jual)}</Row>
          <Row label="Grup Substitusi">
            {obat.grup_substitusi?.nama || 'Tidak ada substitusi'}
          </Row>
        </dl>

        <section className="rounded-[4px] border border-state-error/50 p-2.5">
          <h4 className="text-[13px] font-semibold leading-none text-state-error">
            Danger Zone
          </h4>
          <p className="mt-1 text-[11px] leading-snug text-text-muted">
            Hapus obat dari master data Yelo. Tidak bisa dibatalkan.
          </p>
          <button
            type="button"
            onClick={() => onDelete(obat)}
            className="mt-2 w-full rounded-[4px] border border-state-error/50 px-3 py-2 text-[13px] font-medium text-state-error hover:bg-state-error/10"
          >
            Hapus Obat
          </button>
        </section>
      </div>
    </SheetModal>
  );
}
