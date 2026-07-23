function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('id-ID').format(num);
}

export default function PricelistCard({ item }) {
  return (
    <article className="rounded-[4px] border border-border-subtle bg-bg-surface p-2.5 shadow-sm shadow-black/10">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[14px] font-bold leading-none text-text-primary">
              {item.nama_barang}
            </h3>
            <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-bg-base">
              {item.kode_pbf}
            </span>
            {item.auto_kosong ? (
              <span className="shrink-0 rounded-[4px] bg-state-warning/20 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-state-warning">
                Auto Kosong
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] leading-snug text-text-secondary">
            {item.satuan ? (
              <span>
                Satuan{' '}
                <strong className="font-semibold text-text-primary">{item.satuan}</strong>
              </span>
            ) : null}
            <span>
              Qty{' '}
              <strong className="font-semibold text-text-primary">{formatNumber(item.qty)}</strong>
            </span>
            <span>
              Harga{' '}
              <strong className="font-semibold text-text-primary">
                {formatNumber(item.harga_dasar)}
              </strong>
            </span>
          </div>
          {item.catatan_kondisi ? (
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-text-muted">
              {item.catatan_kondisi}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
