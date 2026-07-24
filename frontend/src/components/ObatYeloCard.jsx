import { golonganBadgeClass } from '../lib/obatYelo';

/**
 * @param {{
 *   obat: object,
 *   suppliers?: Array<{ id?: string, inisial?: string | null, nama?: string | null }>,
 *   onOpen: (obat: object) => void,
 * }} props
 */
export default function ObatYeloCard({ obat, suppliers = [], onOpen }) {
  const golonganNama = obat.golongan?.nama;
  const substitusi = obat.grup_substitusi?.nama || '';
  const pills = (suppliers || [])
    .map((s) => s.inisial || s.nama)
    .filter(Boolean);

  return (
    <article className="rounded-[4px] border border-border-subtle bg-bg-surface shadow-sm shadow-black/10 transition hover:bg-bg-surface-hover">
      <button
        type="button"
        onClick={() => onOpen(obat)}
        className="w-full space-y-1.5 p-2.5 text-left"
      >
        {/* Section 1 — nama + kode */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-bold leading-snug text-text-primary">
            {obat.nama_obat}
          </h3>
          <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-bg-base">
            {obat.kode_obat}
          </span>
        </div>

        {/* Section 2 — stok/harga placeholder + golongan */}
        <div className="flex min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[11px] leading-snug text-text-muted">
            Stok & Harga
          </span>
          {golonganNama ? (
            <span
              className={`shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none ${golonganBadgeClass(golonganNama)}`}
            >
              {golonganNama}
            </span>
          ) : (
            <span className="shrink-0 text-[10px] text-text-muted">—</span>
          )}
        </div>

        {/* Section 3 — substitusi + supplier pills */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          {substitusi ? (
            <span className="min-w-0 flex-1 truncate text-[12px] leading-snug text-text-secondary">
              {substitusi}
            </span>
          ) : (
            <span className="min-w-0 flex-1" />
          )}
          {pills.length > 0 ? (
            <div className="flex max-w-[55%] flex-wrap justify-end gap-1">
              {pills.map((label) => (
                <span
                  key={label}
                  className="shrink-0 rounded-[4px] bg-bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <span className="shrink-0 text-[10px] text-text-muted">—</span>
          )}
        </div>
      </button>
    </article>
  );
}
