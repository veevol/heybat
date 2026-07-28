import { AlertTriangle, ChevronDown, MoreVertical } from 'lucide-react';
import {
  canPecahSatuan,
  formatNumberId,
  formatStokPecahan,
  golonganBadgeClass,
  golonganInisial,
  isSensitiveGolongan,
} from '../lib/obatYelo';

function satuan1Label(obatRow) {
  return (
    obatRow?.satuan_1?.nama ||
    obatRow?.satuan_1_nama ||
    (typeof obatRow?.satuan_1 === 'string' ? obatRow.satuan_1 : null) ||
    null
  );
}

function satuan2Label(obatRow) {
  return (
    obatRow?.satuan_2?.nama ||
    obatRow?.satuan_2_nama ||
    (typeof obatRow?.satuan_2 === 'string' ? obatRow.satuan_2 : null) ||
    null
  );
}

function infoKemasanLabel(obatRow) {
  if (!canPecahSatuan(obatRow)) return null;
  const sat1 = satuan1Label(obatRow);
  const sat2 = satuan2Label(obatRow);
  if (!sat1 || !sat2) return null;
  return `${formatNumberId(obatRow.konversi) ?? obatRow.konversi} ${sat1}/${sat2}`;
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

function uniqueGolongan(obatList) {
  const seen = new Set();
  const list = [];
  for (const obat of obatList || []) {
    const nama = obat.golongan?.nama;
    if (!nama) continue;
    const key = String(nama).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(nama);
  }
  return list;
}

function supplierPillLabel(s) {
  return s?.inisial || s?.nama || '';
}

const pillBase =
  'relative shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none';

/**
 * Badge PBF 3-status:
 * - match saja → abu
 * - terpilih bobot → aksen kuning
 * - disetujui → aksen cyan (biru terang)
 * - kuning+cyan bisa bareng (border kuning + fill cyan)
 */
function pbfBadgeClass({ is_terpilih_bobot, is_disetujui }) {
  if (is_terpilih_bobot && is_disetujui) {
    return `${pillBase} border border-accent-yellow bg-accent-cyan/25 text-accent-cyan`;
  }
  if (is_disetujui) {
    return `${pillBase} border border-accent-cyan/50 bg-accent-cyan/20 text-accent-cyan`;
  }
  if (is_terpilih_bobot) {
    return `${pillBase} border border-accent-yellow/60 bg-accent-yellow/20 text-accent-yellow`;
  }
  return `${pillBase} border border-transparent bg-bg-surface-hover text-white`;
}

const pillNormal = `${pillBase} border border-transparent bg-bg-surface-hover text-white`;
const pillActive = `${pillBase} border border-accent-yellow/60 bg-accent-yellow/20 text-accent-yellow`;

/**
 * Card 1 obat forecast — Section 1/2/3.
 */
export function ForecastObatCard({
  obat,
  suppliers = [],
  activeSupplierId = null,
  onOpenDetail,
  onOpenDefekta,
}) {
  const golonganNama = obat.golongan?.nama;
  const golonganLabel = golonganInisial(golonganNama);
  const stokProyeksi = `Stok ${formatQtyDenganSatuan(obat.stok_sekarang, obat)} · Proyeksi ${formatQtyDenganSatuan(obat.perkiraan_terjual, obat)}`;
  const kemasan = infoKemasanLabel(obat);

  const badges =
    Array.isArray(obat?.pbf_badges) && obat.pbf_badges.length > 0
      ? obat.pbf_badges
          .map((b) => ({
            id: b.supplier_id,
            label: b.inisial || b.nama || '',
            className: pbfBadgeClass(b),
          }))
          .filter((p) => p.label)
      : (suppliers || [])
          .map((s) => ({
            id: s.id,
            label: supplierPillLabel(s),
            className:
              activeSupplierId && s.id === activeSupplierId
                ? pillActive
                : pillNormal,
          }))
          .filter((p) => p.label);

  return (
    <article className="overflow-hidden rounded-[4px] border border-bg-surface bg-bg-surface shadow-sm shadow-black/10">
      {/* Section 1 — nama + kode + golongan + more */}
      <div className="flex min-w-0 items-center justify-between gap-2 bg-bg-surface px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => onOpenDefekta?.(obat)}
          className="min-w-0 flex-1 truncate text-left text-[13px] font-bold leading-none text-text-primary"
        >
          {obat.nama_obat}
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onOpenDefekta?.(obat)}
            className="rounded-[4px] bg-[#2e2d34] px-1.5 py-1 text-[10px] font-semibold leading-none text-text-secondary"
          >
            {obat.kode_obat}
          </button>
          {golonganLabel ? (
            <button
              type="button"
              onClick={() => onOpenDefekta?.(obat)}
              className={`rounded-[4px] px-1.5 py-1 text-[10px] font-semibold leading-none ${golonganBadgeClass(golonganNama)}`}
              title={golonganNama}
            >
              {golonganLabel}
            </button>
          ) : (
            <span className="text-[10px] text-text-muted">—</span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail?.(obat);
            }}
            className="inline-flex h-6 w-6 items-center justify-center rounded-[4px] text-text-muted hover:bg-bg-surface-hover hover:text-accent-yellow"
            aria-label={`Detail ${obat.nama_obat}`}
          >
            <MoreVertical className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Section 2 — stok/proyeksi + kebutuhan */}
      <button
        type="button"
        onClick={() => onOpenDefekta?.(obat)}
        className="flex min-h-[18px] w-full min-w-0 items-center justify-between gap-2 bg-[#2e2d34] px-2.5 py-1.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[11px] font-normal leading-snug text-text-secondary">
          {stokProyeksi}
        </span>
        <span className="shrink-0 text-[11px] font-bold leading-snug text-text-primary">
          {formatKebutuhan(obat)}
        </span>
      </button>

      {/* Section 3 — kemasan + badge PBF */}
      <button
        type="button"
        onClick={() => onOpenDefekta?.(obat)}
        className="flex min-h-[18px] w-full min-w-0 items-center justify-between gap-2 bg-[#2e2d34] px-2.5 pb-1.5 pt-0 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[10px] leading-none text-text-secondary">
          {kemasan || '\u00a0'}
        </span>
        <div className="flex min-h-[18px] max-w-[65%] flex-wrap items-center justify-end gap-1">
          {badges.map((p) => (
            <span key={p.id || p.label} className={p.className}>
              {p.label}
            </span>
          ))}
        </div>
      </button>
    </article>
  );
}

/**
 * Card grup substitusi — collapsible, Section 1/2/3.
 */
export function ForecastGrupCard({
  grup,
  suppliers = [],
  activeSupplierId = null,
  expanded,
  onToggle,
  children,
}) {
  const count = grup.obat?.length || 0;
  const golonganList = uniqueGolongan(grup.obat);
  const stokTotal = formatNumberId(grup.total_stok_sekarang) ?? '0';
  const proyeksiTotal = formatNumberId(grup.total_perkiraan_terjual) ?? '0';
  const kebutuhanTotal = formatNumberId(grup.total_kebutuhan_beli_tab) ?? '0';
  const satuanCampur = Boolean(grup.satuan_campur);
  const satuanLabel = satuanCampur ? '' : grup.satuan_seragam || 'Tab';
  const withSatuan = (num) => (satuanLabel ? `${num} ${satuanLabel}` : num);
  const pills = (suppliers || [])
    .map((s) => ({
      id: s.id,
      label: supplierPillLabel(s),
      active: Boolean(activeSupplierId && s.id === activeSupplierId),
    }))
    .filter((p) => p.label);
  const leftHint = grup.recommended_grup_nama_obat || '\u00a0';

  return (
    <article className="overflow-hidden rounded-[4px] border border-bg-surface bg-bg-surface shadow-sm shadow-black/10">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left"
      >
        {/* Section 1 — nama grup + pills + chevron */}
        <div className="flex min-w-0 items-center justify-between gap-2 bg-accent-yellow/10 px-2.5 py-1.5 hover:bg-accent-yellow/15">
          <h3 className="min-w-0 flex-1 truncate text-[13px] font-bold leading-none text-text-primary">
            {grup.nama}
          </h3>
          <div className="flex shrink-0 items-center gap-1">
            <span className="rounded-[4px] bg-accent-yellow/5 px-1.5 py-1 text-[10px] font-semibold leading-none text-text-secondary">
              {count} obat
            </span>
            {golonganList.map((nama) => {
              const label = golonganInisial(nama);
              return (
                <span
                  key={nama}
                  className={`rounded-[4px] bg-accent-yellow/5 px-1.5 py-1 text-[10px] font-semibold leading-none ${
                    isSensitiveGolongan(nama)
                      ? 'text-accent-yellow'
                      : 'text-text-secondary'
                  }`}
                  title={nama}
                >
                  {label}
                </span>
              );
            })}
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>

        {/* Section 2 — total stok/proyeksi + total kebutuhan */}
        <div className="flex min-h-[18px] min-w-0 items-center justify-between gap-2 bg-accent-yellow/5 px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] font-normal leading-snug text-text-secondary">
            Stok {withSatuan(stokTotal)} · Proyeksi {withSatuan(proyeksiTotal)}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold leading-snug text-text-primary">
            {withSatuan(kebutuhanTotal)}
            {satuanCampur ? (
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0 text-state-warning"
                title="Satuan obat dalam grup ini tidak seragam — cek pengelompokan Substitusi di Data Obat Yelo"
              />
            ) : null}
          </span>
        </div>

        {/* Section 3 — ringkas supplier unik + pill */}
        <div className="flex min-h-[18px] min-w-0 items-center justify-between gap-2 bg-accent-yellow/5 px-2.5 pb-1.5 pt-0">
          <span className="min-w-0 flex-1 truncate text-[10px] leading-none text-text-secondary">
            {leftHint}
          </span>
          <div className="flex min-h-[18px] max-w-[65%] flex-wrap items-center justify-end gap-1">
            {pills.map((p) => (
              <span
                key={p.id || p.label}
                className={p.active ? pillActive : pillNormal}
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="space-y-1.5 bg-accent-yellow/5 px-2 py-2">
          {children}
        </div>
      ) : null}
    </article>
  );
}
