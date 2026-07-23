import { useState } from 'react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

export default function ConfirmDeleteModal({
  supplierName,
  submitting,
  onClose,
  onConfirm,
}) {
  const [typed, setTyped] = useState('');
  const matched = typed.trim() === supplierName;

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-state-error">
          Hapus Supplier
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
            className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary hover:bg-bg-surface-hover sm:w-auto"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!matched || submitting}
            onClick={onConfirm}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-state-error px-3 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {submitting ? <SubmitSpinner /> : 'Hapus Permanen'}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <p className="text-[13px] leading-snug text-text-secondary">
          Tindakan ini tidak bisa dibatalkan. Ketik nama supplier{' '}
          <span className="font-semibold text-text-primary">{supplierName}</span> untuk
          konfirmasi.
        </p>
        <input
          type="text"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={supplierName}
          className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-state-error focus:ring-1 focus:ring-state-error"
          autoFocus
        />
      </div>
    </SheetModal>
  );
}
