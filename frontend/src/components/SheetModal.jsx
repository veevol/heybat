export default function SheetModal({
  title,
  onClose,
  children,
  footer = null,
  busy = false,
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-3">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Tutup"
        onClick={onClose}
        disabled={busy}
      />
      <div
        className="relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-[4px] border border-border-subtle border-b-0 bg-bg-surface shadow-sm shadow-black/20 sm:max-w-lg sm:rounded-[4px] sm:border-b"
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mt-1.5 h-0.5 w-8 shrink-0 rounded-[4px] bg-border-subtle sm:hidden" />
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2">
          <div className="min-w-0 flex-1">{title}</div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="shrink-0 text-[18px] leading-none text-text-muted hover:text-text-primary disabled:opacity-50"
            aria-label="Tutup"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-3 py-2.5">{children}</div>
        {footer ? (
          <div className="border-t border-border-subtle px-3 py-2">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function SupplierModalTitle({ nama, inisial }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <h2 className="truncate text-[15px] font-semibold leading-none text-text-primary">
        {nama || 'Supplier'}
      </h2>
      {inisial ? (
        <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-bg-base">
          {inisial}
        </span>
      ) : null}
    </div>
  );
}
