function formatUploadDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function formatPricelistDate(isoDate) {
  if (!isoDate) return null;
  try {
    const d = String(isoDate).slice(0, 10);
    const [y, m, day] = d.split('-').map(Number);
    if (!y || !m || !day) return d;
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return String(isoDate);
  }
}

function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('id-ID').format(num);
}

/**
 * Card riwayat upload pricelist.
 * Kiri: pill inisial + tanggal dokumen · Kanan: jumlah item.
 */
export default function PricelistUploadCard({ batch, onOpen }) {
  const dateLabel =
    formatPricelistDate(batch.tanggal_pricelist) ||
    formatUploadDate(batch.tanggal_upload);

  return (
    <button
      type="button"
      onClick={() => onOpen?.(batch)}
      className="flex w-full items-center justify-between gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-2.5 py-2.5 text-left shadow-sm shadow-black/10 transition hover:bg-bg-surface-hover"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-bg-base">
          {batch.inisial || '—'}
        </span>
        <span className="truncate text-[13px] leading-snug text-text-primary">
          {dateLabel}
        </span>
      </div>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-text-secondary">
        {formatNumber(batch.item_count)} item
      </span>
    </button>
  );
}
