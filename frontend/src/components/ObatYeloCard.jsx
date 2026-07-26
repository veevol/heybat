import {
  formatStokHargaKartu,
  golonganBadgeClass,
  golonganInisial,
} from '../lib/obatYelo';

/**
 * @param {{
 *   obat: object,
 *   suppliers?: Array<{ id?: string, inisial?: string | null, nama?: string | null }>,
 *   onOpen: (obat: object) => void,
 * }} props
 */
export default function ObatYeloCard({ obat, suppliers = [], onOpen }) {
  const golonganNama = obat.golongan?.nama;
  const golonganLabel = golonganInisial(golonganNama);
  const substitusi = obat.grup_substitusi?.nama || '';
  const pills = (suppliers || [])
    .map((s) => s.inisial || s.nama)
    .filter(Boolean);
  const stokHarga = formatStokHargaKartu(obat.stok_ringkasan, obat);

  return (
    <article className="group overflow-hidden rounded-[4px] border border-bg-surface bg-bg-surface shadow-sm shadow-black/10 transition hover:border-bg-surface-hover">
      <button
        type="button"
        onClick={() => onOpen(obat)}
        className="w-full text-left"
      >
        {/* Section 1 — nama + kode + golongan */}
        <div className="flex min-w-0 items-center justify-between gap-2 bg-bg-surface px-2.5 py-1.5 transition group-hover:bg-bg-surface-hover">
          <h3 className="min-w-0 flex-1 truncate text-[13px] font-bold leading-none text-text-primary">
            {obat.nama_obat}
          </h3>
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
            ) : (
              <span className="text-[10px] text-text-muted">—</span>
            )}
          </div>
        </div>

        {/* Section 2 — stok/harga, substitusi, supplier (tinggi baris tetap) */}
        <div className="space-y-1.5 bg-[#2e2d34] px-2.5 py-1.5 transition group-hover:bg-[#35343c]">
          <div className="flex min-h-[18px] min-w-0 items-center">
            {stokHarga ? (
              <span className="min-w-0 flex-1 truncate text-[11px] leading-snug text-text-secondary">
                <span className="font-bold text-text-primary">
                  {stokHarga.stok}
                </span>
                {stokHarga.harga ? (
                  <span className="font-normal"> {stokHarga.harga}</span>
                ) : null}
              </span>
            ) : (
              <span className="min-w-0 flex-1">{'\u00a0'}</span>
            )}
          </div>

          <div className="flex min-h-[18px] min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 flex-1 truncate text-[12px] leading-snug text-text-secondary">
              {substitusi || '\u00a0'}
            </span>
            <div className="flex min-h-[18px] max-w-[55%] flex-wrap items-center justify-end gap-1">
              {pills.map((label) => (
                <span
                  key={label}
                  className="shrink-0 rounded-[4px] bg-bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}
