import { ChevronRight, Download } from 'lucide-react';
import { formatNumberId, formatRupiahId } from '../lib/obatYelo';
import SubmitSpinner from './SubmitSpinner';

const KATEGORI_LABEL = {
  retail: 'Retail',
  mitra: 'Mitra',
  gabung: 'Gabung',
};

function kategoriLabel(kategori) {
  return KATEGORI_LABEL[kategori] || kategori;
}

/** Switch kecil ala ToggleSwitch di JadwalEditor, lokal ke card ini. */
function MiniSwitch({ checked, onChange, disabled, offLabel, onLabel, activeClass }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? onLabel : offLabel}
      onClick={() => !disabled && onChange?.(!checked)}
      disabled={disabled}
      className="flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <span className="text-[10px] font-medium leading-none text-text-secondary">
        {checked ? onLabel : offLabel}
      </span>
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          checked ? activeClass : 'bg-bg-surface-hover'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Turunkan teks status (Section 4 kiri) dari dokumen_terbaru — BUKAN dari lock,
 * supaya tetap akurat walau switch lagi kebuka (mis. abis Batalkan SP tapi
 * dokumen revisi barunya belum dikirim — jangan mundur ke "Belum SP" yang
 * menyesatkan). Lock cuma dipakai buat kunci switch, bukan buat status teks.
 */
export function computeStatusTeks(card) {
  if (card.dibatalkan) return 'Dibatalkan';
  if (!card.dokumen_terbaru?.ada) return 'Disetujui, Belum SP';
  const versi = card.dokumen_terbaru.versi ?? 0;
  const terkirim = card.dokumen_terbaru.status === 'dikirim';
  const prefix = versi > 0 ? `Revisi ${versi} Terbit` : 'SP Terbit';
  return terkirim ? `${prefix} — Dikirim ke Sales` : `${prefix} — Belum Dikirim`;
}

/**
 * Card 1 PBF di halaman Pembuatan SP — 4 section:
 * 1) header (inisial+nama, total item+nominal)
 * 2) breakdown per golongan
 * 3) breakdown per kategori (retail/mitra)
 * 4) status + aksi (switch Setuju/Batal, switch Gabung/Pisah, Generate/Batalkan SP, Kirim WA)
 */
export default function PembuatanSpCard({
  card,
  pisah,
  onTogglePisah,
  setuju,
  onToggleSetuju,
  busy = false,
  busyLabel = null,
  generatedDocs = null,
  onGenerate,
  onBatalkanSp,
  onKirimWa,
  onLihatRiwayat,
}) {
  const locked = Boolean(card.lock?.locked);
  const dibatalkan = Boolean(card.dibatalkan);
  const statusTeks = computeStatusTeks(card);
  const jumlahVersi = card.dokumen_terbaru?.jumlah_versi || 0;

  return (
    <article className="overflow-hidden rounded-[4px] border border-bg-surface bg-bg-surface shadow-sm shadow-black/10">
      {/* Section 1 — inisial+nama PBF, total item+nominal */}
      <div className="flex min-w-0 items-center justify-between gap-2 bg-bg-surface px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-bg-base">
            {card.supplier_inisial || '—'}
          </span>
          <h3 className="truncate text-[13px] font-bold leading-none text-text-primary">
            {card.supplier_nama || 'Supplier'}
          </h3>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[13px] font-bold leading-none text-text-primary">
            {formatRupiahId(card.total_nominal) ?? 'Rp 0'}
          </div>
          <div className="mt-0.5 text-[10px] leading-none text-text-muted">
            {formatNumberId(card.total_item) ?? 0} item
          </div>
        </div>
      </div>

      {/* Section 2 — breakdown per golongan */}
      <div className="space-y-1 bg-[#2e2d34] px-2.5 py-1.5">
        <p className="text-[10px] font-semibold uppercase leading-none tracking-wider text-text-muted">
          Per Golongan
        </p>
        {(card.breakdown_golongan || []).length === 0 ? (
          <p className="text-[11px] text-text-muted">Tidak ada data</p>
        ) : (
          card.breakdown_golongan.map((g) => (
            <div
              key={g.golongan}
              className="flex items-center justify-between gap-2 text-[11px] leading-snug"
            >
              <span className="min-w-0 truncate text-text-secondary">{g.golongan}</span>
              <span className="shrink-0 font-medium text-text-primary">
                {formatNumberId(g.jumlah_item) ?? 0} item · {formatRupiahId(g.nominal) ?? 'Rp 0'}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Section 3 — breakdown per kategori (retail/mitra) */}
      {(card.breakdown_kategori || []).length > 0 ? (
        <div className="space-y-1 bg-bg-surface px-2.5 py-1.5">
          <p className="text-[10px] font-semibold uppercase leading-none tracking-wider text-text-muted">
            Per Kategori
          </p>
          {card.breakdown_kategori.map((k) => (
            <div
              key={k.kategori}
              className="flex items-center justify-between gap-2 text-[11px] leading-snug"
            >
              <span className="min-w-0 truncate text-text-secondary">
                {kategoriLabel(k.kategori)}
              </span>
              <span className="shrink-0 font-medium text-text-primary">
                {formatNumberId(k.jumlah_item) ?? 0} item · {formatRupiahId(k.nominal) ?? 'Rp 0'}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Section 4 — status + aksi */}
      <div className="flex flex-col gap-1.5 bg-[#2e2d34] px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-medium text-text-secondary">
            {statusTeks}
            {busy ? <SubmitSpinner className="h-3 w-3" /> : null}
          </span>
          {jumlahVersi > 0 ? (
            <button
              type="button"
              onClick={onLihatRiwayat}
              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-accent-yellow hover:underline"
            >
              Lihat riwayat SP ({jumlahVersi} versi)
              <ChevronRight className="h-3 w-3" strokeWidth={2.5} />
            </button>
          ) : null}
        </div>

        {busy && busyLabel ? (
          <p className="text-right text-[10px] text-text-muted">{busyLabel}</p>
        ) : null}

        {generatedDocs && generatedDocs.length > 0 ? (
          <div className="space-y-1 rounded-[4px] bg-bg-base px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase leading-none tracking-wider text-text-muted">
              Dokumen dibuat
            </p>
            {generatedDocs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 text-[11px] leading-snug"
              >
                <span className="min-w-0 truncate text-text-secondary">
                  {d.golongan}
                  {d.kategori && d.kategori !== 'gabung' ? ` · ${kategoriLabel(d.kategori)}` : ''}
                  {' — '}
                  {d.nomor_sp}
                </span>
                {d.file_path ? (
                  <a
                    href={d.file_path}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-0.5 font-medium text-accent-yellow hover:underline"
                  >
                    <Download className="h-3 w-3" strokeWidth={2.5} />
                    Unduh
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {dibatalkan ? null : (
          <div className="flex flex-wrap items-center justify-end gap-2.5">
            <MiniSwitch
              checked={setuju}
              onChange={onToggleSetuju}
              disabled={locked || busy}
              offLabel="Batal"
              onLabel="Setuju"
              activeClass="bg-state-success"
            />
            <MiniSwitch
              checked={pisah}
              onChange={onTogglePisah}
              disabled={locked || busy}
              offLabel="Gabung"
              onLabel="Pisah"
              activeClass="bg-accent-cyan"
            />
            {!locked ? (
              <button
                type="button"
                onClick={onGenerate}
                disabled={busy}
                className="rounded-[4px] bg-accent-navy px-2.5 py-1.5 text-[11px] font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                Generate SP
              </button>
            ) : (
              <button
                type="button"
                onClick={onBatalkanSp}
                disabled={busy}
                className="rounded-[4px] border border-state-error px-2.5 py-1.5 text-[11px] font-medium text-state-error hover:bg-state-error/10 disabled:opacity-50"
              >
                Batalkan SP
              </button>
            )}
            {card.dokumen_terbaru?.ada ? (
              <button
                type="button"
                onClick={onKirimWa}
                disabled={busy}
                className="rounded-[4px] bg-state-success px-2.5 py-1.5 text-[11px] font-medium text-white hover:brightness-110 disabled:opacity-50"
              >
                Kirim WA
              </button>
            ) : null}
          </div>
        )}
      </div>
    </article>
  );
}
