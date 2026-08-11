import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

/**
 * Konfirmasi aksi (bukan hapus) — tanpa ketik ulang nama.
 */
export default function ConfirmActionModal({
  open,
  title = 'Konfirmasi',
  description = '',
  confirmLabel = 'Konfirmasi',
  submitting = false,
  danger = false,
  onClose,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <SheetModal
      title={
        <h2
          className={`text-[15px] font-semibold leading-none ${
            danger ? 'text-state-error' : 'text-text-primary'
          }`}
        >
          {title}
        </h2>
      }
      onClose={onClose}
      busy={submitting}
      footer={
        <div className="flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary hover:bg-bg-surface-hover disabled:opacity-50 sm:w-auto"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={onConfirm}
            className={`inline-flex w-full items-center justify-center rounded-[4px] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50 sm:w-auto ${
              danger ? 'bg-state-error' : 'bg-accent-navy'
            }`}
          >
            {submitting ? <SubmitSpinner /> : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="text-[13px] leading-snug text-text-secondary">{description}</p>
    </SheetModal>
  );
}
