import { useState } from 'react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

const JENIS_OPTIONS = [
  { value: 'karantina', label: 'Karantina' },
  { value: 'jual_prioritas', label: 'Jual Prioritas' },
  { value: 'lainnya', label: 'Lainnya' },
];

/**
 * Modal kecil: pilih jenis tindakan + catatan opsional.
 */
export default function StokTandaiModal({
  title = 'Tandai untuk Ditindaklanjuti',
  subtitle = null,
  submitting = false,
  onClose,
  onConfirm,
}) {
  const [jenis, setJenis] = useState('karantina');
  const [catatan, setCatatan] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!jenis) {
      setError('Pilih jenis tindakan');
      return;
    }
    setError('');
    onConfirm({
      jenis_tindakan: jenis,
      catatan: catatan.trim() || null,
    });
  }

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
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
            className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary disabled:opacity-50 sm:w-auto"
          >
            Batal
          </button>
          <button
            type="submit"
            form="stok-tandai-form"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50 sm:w-auto"
          >
            {submitting ? <SubmitSpinner /> : 'Tandai'}
          </button>
        </div>
      }
    >
      <form id="stok-tandai-form" onSubmit={handleSubmit} className="space-y-2">
        {subtitle ? (
          <p className="text-[12px] text-text-secondary">{subtitle}</p>
        ) : null}

        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">
            Jenis tindakan <span className="text-accent-yellow">*</span>
          </span>
          <select
            value={jenis}
            onChange={(e) => setJenis(e.target.value)}
            className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
          >
            {JENIS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">Catatan (opsional)</span>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={3}
            placeholder="Catatan bebas untuk tim…"
            className="w-full resize-y rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
          />
        </label>

        {error ? (
          <p className="rounded-[4px] border border-state-error/40 bg-state-error/10 px-2 py-1.5 text-[12px] text-state-error">
            {error}
          </p>
        ) : null}
      </form>
    </SheetModal>
  );
}

export { JENIS_OPTIONS };
