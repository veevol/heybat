import { MoreVertical } from 'lucide-react';
import SearchableObatSelect from './SearchableObatSelect';
import SubmitSpinner from './SubmitSpinner';
import { formatHarga } from '../lib/matchingUi';

const BADGE = {
  pending: {
    label: 'Menunggu Verifikasi',
    className: 'bg-accent-yellow text-bg-base font-semibold',
  },
  unmatched: {
    label: 'Belum Match',
    className: 'bg-state-error/90 text-white font-semibold',
  },
  rejected: {
    label: 'No Match',
    className: 'bg-border-subtle text-text-muted font-semibold',
  },
  ditolak: {
    label: 'Ditolak',
    className: 'bg-state-error/90 text-white font-semibold',
  },
};

export default function MatchingActionCard({
  card,
  inisialPbf,
  katalog,
  selectedKode,
  onSelect,
  onAjukan,
  onNoData,
  onTambahObat,
  onBatalkan,
  onSetujui,
  onTolak,
  busy,
  canUsulkan,
  canTambahObat,
  isOwner = false,
}) {
  const kind = card.kind;
  const badge = BADGE[kind] || BADGE.unmatched;
  const row = card.pricelist || {};
  const hargaLabel = formatHarga(row.harga_dasar);
  const qtyLabel = [row.qty, row.satuan].filter(Boolean).join(' ');
  const isPending = kind === 'pending';
  const isUnmatched = kind === 'unmatched';
  const isRejected = kind === 'rejected';
  const isDitolak = kind === 'ditolak';
  /** Layout padat sama Menunggu / Belum Match / No Match / Ditolak */
  const useAwaitLayout = isPending || isUnmatched || isRejected || isDitolak;
  const diusulkan =
    typeof card.diusulkan_oleh === 'string' ? card.diusulkan_oleh.trim() : '';
  const dipilih =
    typeof card.dipilih_oleh === 'string' ? card.dipilih_oleh.trim() : '';
  const pengajuLabel =
    dipilih || (diusulkan && diusulkan.toLowerCase() !== 'sistem' ? diusulkan : '');

  return (
    <article className="flex flex-col gap-1.5 rounded-[4px] border border-border-subtle bg-bg-surface p-2.5 shadow-sm shadow-black/10 transition hover:bg-bg-surface-hover">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-[10px] uppercase leading-none tracking-wide ${badge.className}`}
        >
          {badge.label}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {(isPending || isRejected || isDitolak) && pengajuLabel ? (
            <span className="max-w-[7.5rem] truncate text-[11px] font-normal leading-none text-text-muted">
              Oleh: {pengajuLabel}
            </span>
          ) : null}
          {useAwaitLayout && inisialPbf ? (
            <span className="rounded-[4px] bg-bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {inisialPbf}
            </span>
          ) : null}
          <button
            type="button"
            className="text-text-muted hover:text-text-primary"
            aria-label="Opsi lain"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Section 2 — data PBF */}
      <div className="flex flex-col gap-1 border-b border-border-subtle pb-1.5">
        {useAwaitLayout ? (
          <>
            <h3 className="min-w-0 truncate text-[14px] font-bold leading-snug text-accent-cyan">
              {row.nama_barang || '—'}
            </h3>
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-normal leading-snug text-text-muted">
              <span className="shrink-0 whitespace-nowrap text-left">
                {[qtyLabel, hargaLabel].filter(Boolean).join(' · ') || '—'}
              </span>
              <span className="min-w-0 flex-1 truncate text-right italic">
                {row.catatan_kondisi || '\u00a0'}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded-[4px] bg-bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {inisialPbf || '—'}
              </span>
              <h3 className="min-w-0 truncate text-[12px] leading-snug text-text-secondary">
                {row.nama_barang || '—'}
              </h3>
            </div>
            <div className="flex min-w-0 items-center gap-2 text-[11px] font-normal leading-snug text-text-muted">
              <span className="shrink-0 whitespace-nowrap text-left">
                {[qtyLabel, hargaLabel].filter(Boolean).join(' · ') || '—'}
              </span>
              <span className="min-w-0 flex-1 truncate text-right italic">
                {row.catatan_kondisi || '\u00a0'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Section 3 — dropdown Yelo (+ aksi) */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        <SearchableObatSelect
          options={katalog}
          value={selectedKode || ''}
          onChange={onSelect}
          borderClassName="border-border-subtle"
          placeholder="Cari obat Yelo..."
        />

        <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1.5">
          {isPending ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-1.5">
              {isOwner ? (
                <>
                  <button
                    type="button"
                    disabled={busy || !selectedKode || !onSetujui}
                    onClick={onSetujui}
                    className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy && <SubmitSpinner className="h-3.5 w-3.5" />}
                    Setujui
                  </button>
                  <button
                    type="button"
                    disabled={busy || !onTolak}
                    onClick={onTolak}
                    className="rounded-[4px] border border-state-error/40 px-3 py-1.5 text-[13px] font-semibold text-state-error hover:bg-state-error/10 disabled:opacity-50"
                  >
                    {busy ? (
                      <SubmitSpinner className="inline h-3.5 w-3.5" />
                    ) : (
                      'Ditolak'
                    )}
                  </button>
                </>
              ) : canUsulkan ? (
                <>
                  <span />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onBatalkan}
                    className="rounded-[4px] border border-border-subtle px-3 py-1.5 text-[13px] text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
                  >
                    {busy ? (
                      <SubmitSpinner className="inline h-3.5 w-3.5" />
                    ) : (
                      'Batalkan'
                    )}
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {isUnmatched || isRejected || isDitolak ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-1.5">
              {canTambahObat && canUsulkan ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onTambahObat}
                  className="rounded-[4px] border border-dashed border-accent-yellow/70 px-3 py-1.5 text-[13px] font-semibold text-accent-yellow hover:bg-accent-yellow/10 disabled:opacity-50"
                >
                  + Data Obat
                </button>
              ) : (
                <span />
              )}
              <div className="flex flex-wrap justify-end gap-1.5">
                {canUsulkan ? (
                  <button
                    type="button"
                    disabled={busy || !selectedKode}
                    onClick={onAjukan}
                    className="inline-flex items-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    {busy && <SubmitSpinner className="h-3.5 w-3.5" />}
                    Ajukan
                  </button>
                ) : null}
                {canUsulkan ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={onNoData}
                    className="rounded-[4px] border border-state-error/40 px-3 py-1.5 text-[13px] text-state-error/80 hover:bg-state-error/10 disabled:opacity-50"
                  >
                    No Data
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
