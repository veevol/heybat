import { golonganBadgeClass } from '../lib/obatYelo';

export default function ObatYeloCard({ obat, onOpen }) {
  const golonganNama = obat.golongan?.nama;

  return (
    <article className="rounded-[4px] border border-border-subtle bg-bg-surface shadow-sm shadow-black/10 transition hover:bg-bg-surface-hover">
      <button
        type="button"
        onClick={() => onOpen(obat)}
        className="w-full p-2.5 text-left"
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[14px] font-bold leading-snug text-text-primary">
              {obat.nama_obat}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-bg-base">
                {obat.kode_obat}
              </span>
              {golonganNama ? (
                <span
                  className={`shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none ${golonganBadgeClass(golonganNama)}`}
                >
                  {golonganNama}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {obat.kandungan?.nama ? (
          <p className="mt-1 truncate text-[11px] leading-snug text-text-muted">
            {obat.kandungan.nama}
          </p>
        ) : null}
      </button>
    </article>
  );
}
