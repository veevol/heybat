import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { formatHarga } from '../lib/matchingUi';
import {
  formatSatuanGabung,
  golonganBadgeClass,
  golonganInisial,
} from '../lib/obatYelo';

/** Lebar kolom inisial patokan "Global" agar SBS & nama sejajar antar baris. */
const INISIAL_COL_CLASS = 'w-[4.25rem]';

function satuanNama(satuan) {
  if (!satuan) return null;
  if (typeof satuan === 'string') return satuan.trim() || null;
  return satuan.nama ? String(satuan.nama).trim() : null;
}

/** Satuan display HJ: satuan_2 jika konv > 1, else satuan_1. */
function satuanHargaLabel(obat) {
  const konv = Number(obat?.konversi);
  const sat2 = satuanNama(obat?.satuan_2);
  const sat1 = satuanNama(obat?.satuan_1);
  if (Number.isFinite(konv) && konv > 1 && sat2) return sat2;
  return sat1;
}

/**
 * Harga yang ditampilkan: konv × HJ jika konv > 1, else HJ mentah.
 * Label satuan mengikuti satuanHargaLabel.
 */
function formatHjDisplay(hargaSatuan1, obat) {
  if (hargaSatuan1 === null || hargaSatuan1 === undefined || hargaSatuan1 === '') {
    return null;
  }
  const base = Number(hargaSatuan1);
  if (!Number.isFinite(base)) return null;

  const konv = Number(obat?.konversi);
  const amount =
    Number.isFinite(konv) && konv > 1 ? base * konv : base;
  const harga = formatHarga(amount);
  if (!harga) return null;

  const sat = satuanHargaLabel(obat);
  return sat ? `${harga}/${sat}` : harga;
}

export default function MatchingMatchCard({
  card,
  inisialPbf,
  onEditMatch = null,
  canEditMatch = false,
}) {
  const obat = card.obat || {};
  const kemasan = formatSatuanGabung(obat);
  const hj1 = formatHjDisplay(obat.harga_1, obat);
  const hj3 = formatHjDisplay(obat.harga_3, obat);
  const golonganNama = obat.golongan?.nama || null;
  const golonganLabel = golonganInisial(golonganNama);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDoc(e) {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <article className="flex flex-col gap-1.5 rounded-[4px] border border-border-subtle bg-bg-surface p-2.5 shadow-sm shadow-black/10 transition hover:bg-bg-surface-hover">
      {/* Baris 1: kiri Match · kanan kode + golongan + ⋮ */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center rounded-[4px] border border-state-success/30 bg-state-success/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-state-success">
          Match
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {obat.kode_obat ? (
            <span className="rounded-[4px] bg-[#2e2d34] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-text-secondary">
              {obat.kode_obat}
            </span>
          ) : null}
          {golonganLabel ? (
            <span
              className={`rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none ${golonganBadgeClass(golonganNama)}`}
              title={golonganNama}
            >
              {golonganLabel}
            </span>
          ) : null}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="text-text-muted hover:text-text-primary"
              aria-label="Opsi match"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[9.5rem] overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface shadow-lg shadow-black/40"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canEditMatch || !onEditMatch}
                  onClick={() => {
                    setMenuOpen(false);
                    onEditMatch?.(card);
                  }}
                  className="flex w-full items-center px-3 py-2.5 text-left text-[13px] font-medium text-text-primary transition hover:bg-bg-surface-hover disabled:opacity-50"
                >
                  Edit Match
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Nama Obat Yelo */}
      <div className="flex flex-col gap-1 border-b border-border-subtle pb-1.5">
        <h2 className="truncate text-[14px] font-bold leading-snug text-text-primary">
          {obat.nama_obat || '—'}
        </h2>

        {/* Kiri kemasan · kanan HJ1 & HJ3 sebaris */}
        {(kemasan || hj1 || hj3) && (
          <div className="flex items-start justify-between gap-2 text-[11px] leading-snug">
            <span className="min-w-0 text-text-secondary">
              {kemasan || '\u00a0'}
            </span>
            {(hj1 || hj3) && (
              <span className="shrink-0 inline-flex items-center justify-end gap-2 whitespace-nowrap text-right text-text-primary">
                {hj1 ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-text-muted">HJ1</span>
                    {hj1}
                  </span>
                ) : null}
                {hj3 ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="text-text-muted">HJ3</span>
                    {hj3}
                  </span>
                ) : null}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Data obat PBF — kolom inisial lebar tetap (patokan Global) */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        {(card.pricelist_rows || []).map((row) => {
          const harga = formatHarga(row.harga_dasar);
          const qtyLabel = [row.qty, row.satuan].filter(Boolean).join(' ');
          return (
            <div
              key={`${row.pricelist_pbf_id}-${row.pricelist_kode_pbf}`}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-1.5 gap-y-0.5"
            >
              <span
                className={`${INISIAL_COL_CLASS} mt-0.5 shrink-0 truncate rounded-[4px] bg-bg-surface-hover px-1.5 py-0.5 text-center text-[10px] font-semibold leading-none text-white`}
              >
                {row.inisial || inisialPbf || '—'}
              </span>
              <span className="truncate text-[12px] leading-snug text-text-secondary">
                {row.nama_barang}
              </span>
              {harga ? (
                <span className="shrink-0 text-right text-[12px] leading-snug text-text-secondary">
                  {harga}
                </span>
              ) : (
                <span />
              )}

              <span className={INISIAL_COL_CLASS} aria-hidden="true" />
              <div className="col-span-2 flex items-center justify-between gap-2">
                <span className="min-w-0 text-[11px] leading-snug text-left text-text-muted whitespace-nowrap">
                  {qtyLabel || '—'}
                </span>
                {row.catatan_kondisi ? (
                  <span className="rounded-[4px] bg-state-success/10 px-1.5 py-0.5 text-[10px] italic leading-none text-state-success">
                    {row.catatan_kondisi}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
