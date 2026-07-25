import { X } from 'lucide-react';

export default function SheetModal({
  title,
  onClose,
  children,
  footer = null,
  busy = false,
  borderless = false,
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
        className={`relative z-10 flex max-h-[92vh] w-full flex-col rounded-t-[4px] bg-bg-surface shadow-sm shadow-black/20 sm:max-w-lg sm:rounded-[4px] ${
          borderless
            ? ''
            : 'border border-border-subtle border-b-0 sm:border-b'
        }`}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mt-1.5 h-0.5 w-8 shrink-0 rounded-[4px] bg-border-subtle sm:hidden" />
        <div
          className={`flex items-center justify-between gap-2 px-3 py-2 ${
            borderless ? '' : 'border-b border-border-subtle'
          }`}
        >
          <div className="flex min-h-6 min-w-0 flex-1 items-center">
            {title}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-border-subtle text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
            aria-label="Tutup"
          >
            <X className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hide px-3 py-2.5">{children}</div>
        {footer ? (
          <div
            className={`px-3 py-2 ${
              borderless ? '' : 'border-t border-border-subtle'
            }`}
          >
            {footer}
          </div>
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
