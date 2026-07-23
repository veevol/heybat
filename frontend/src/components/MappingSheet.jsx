import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

const selectClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow';

export default function MappingSheet({
  title = 'Mapping Kolom Excel',
  headers = [],
  previewRows = [],
  values,
  onChange,
  onClose,
  onConfirm,
  submitting = false,
  confirmLabel = 'Simpan & Upload',
}) {
  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">{title}</h2>
      }
      onClose={onClose}
      busy={submitting}
      footer={
        <div className="flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary sm:w-auto"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || !values.nama_kolom_barang}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50 sm:w-auto"
          >
            {submitting ? <SubmitSpinner /> : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">
            Nama Barang <span className="text-accent-yellow">*</span>
          </span>
          <select
            value={values.nama_kolom_barang}
            onChange={(e) => onChange({ ...values, nama_kolom_barang: e.target.value })}
            className={selectClass}
          >
            <option value="">Pilih kolom...</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">Qty</span>
          <select
            value={values.nama_kolom_qty || ''}
            onChange={(e) => onChange({ ...values, nama_kolom_qty: e.target.value || null })}
            className={selectClass}
          >
            <option value="">(opsional)</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">Harga</span>
          <select
            value={values.nama_kolom_harga || ''}
            onChange={(e) => onChange({ ...values, nama_kolom_harga: e.target.value || null })}
            className={selectClass}
          >
            <option value="">(opsional)</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">Kolom Satuan</span>
          <select
            value={values.nama_kolom_satuan || ''}
            onChange={(e) =>
              onChange({ ...values, nama_kolom_satuan: e.target.value || null })
            }
            className={selectClass}
          >
            <option value="">(opsional)</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">Baris mulai data (1-indexed)</span>
          <input
            type="number"
            min={1}
            value={values.baris_mulai_data}
            onChange={(e) =>
              onChange({ ...values, baris_mulai_data: Number(e.target.value) || 1 })
            }
            className={selectClass}
          />
        </label>

        {previewRows?.length ? (
          <div className="rounded-[4px] border border-border-subtle bg-bg-base p-2">
            <p className="mb-1 text-[11px] font-medium text-text-secondary">
              Preview baris awal
            </p>
            <div className="max-h-40 overflow-auto scrollbar-hide text-[10px] text-text-muted">
              {previewRows.slice(0, 5).map((row) => (
                <div key={row.__row} className="border-b border-border-subtle/50 py-1 last:border-0">
                  <span className="text-text-secondary">#{row.__row}</span>{' '}
                  {Object.entries(row)
                    .filter(([k]) => k !== '__row')
                    .slice(0, 4)
                    .map(([k, v]) => `${k}=${v || '—'}`)
                    .join(' · ')}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </SheetModal>
  );
}
