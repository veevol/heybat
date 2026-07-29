import SubmitSpinner from './SubmitSpinner';
import JadwalEditor from './JadwalEditor';
import SheetModal, { SupplierModalTitle } from './SheetModal';
import { JENIS_PBF_OPTIONS } from '../lib/supplier';

const inputClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] leading-snug text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow disabled:cursor-not-allowed disabled:opacity-60';

function Field({
  label,
  name,
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = '',
  hint = null,
  as = 'input',
}) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[11px] leading-none text-text-secondary">
        {label}
        {required ? <span className="text-accent-yellow"> *</span> : null}
      </span>
      {as === 'textarea' ? (
        <textarea
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          rows={2}
          className={`${inputClass} resize-y`}
        />
      ) : (
        <input
          type="text"
          name={name}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          readOnly={disabled}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
      {hint ? <p className="text-[10px] leading-snug text-text-muted">{hint}</p> : null}
    </label>
  );
}

export default function SupplierFormModal({
  mode,
  values,
  onChange,
  onJenisPbfToggle,
  onJadwalChange,
  submitting,
  error,
  onClose,
  onSubmit,
}) {
  const isEdit = mode === 'edit';
  const title = isEdit ? (
    <SupplierModalTitle nama={values.nama} inisial={values.inisial} />
  ) : (
    <h2 className="text-[15px] font-semibold leading-none text-text-primary">
      Tambah Supplier
    </h2>
  );

  return (
    <SheetModal
      title={title}
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
            type="submit"
            form="supplier-form"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-80 sm:w-auto sm:min-w-24"
          >
            {submitting ? <SubmitSpinner /> : 'Simpan'}
          </button>
        </div>
      }
    >
      <form id="supplier-form" onSubmit={onSubmit} className="space-y-1.5">
        <Field
          label="Nama"
          name="nama"
          value={values.nama}
          onChange={onChange}
          required
          placeholder="Nama PBF / supplier"
        />
        <Field
          label="Inisial"
          name="inisial"
          value={values.inisial}
          onChange={onChange}
          required={!isEdit}
          disabled={isEdit}
          placeholder="Contoh: KMF"
          hint={
            isEdit
              ? 'Inisial terkunci setelah dibuat.'
              : 'Inisial tidak bisa diubah setelah disimpan — pastikan benar.'
          }
        />

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <Field
            label="No. Telp PBF"
            name="no_telp_pbf"
            value={values.no_telp_pbf}
            onChange={onChange}
            placeholder="021..."
          />
          <Field
            label="Nama Sales"
            name="nama_sales"
            value={values.nama_sales}
            onChange={onChange}
            placeholder="Nama sales"
          />
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <Field
            label="No. WA Sales"
            name="no_wa_sales"
            value={values.no_wa_sales}
            onChange={onChange}
            placeholder="08..."
          />
          <label className="block space-y-0.5">
            <span className="text-[11px] leading-none text-text-secondary">
              Jenis Kelamin Sales
            </span>
            <select
              name="jenis_kelamin_sales"
              value={values.jenis_kelamin_sales}
              onChange={onChange}
              className={inputClass}
            >
              <option value="">(kosongkan)</option>
              <option value="L">L — Laki-laki</option>
              <option value="P">P — Perempuan</option>
            </select>
          </label>
        </div>

        <Field
          label="Alamat"
          name="alamat"
          value={values.alamat}
          onChange={onChange}
          as="textarea"
          placeholder="Alamat PBF"
        />

        <label className="block space-y-0.5">
          <span className="text-[11px] leading-none text-text-secondary">
            Termin (hari)
          </span>
          <input
            type="number"
            name="termin_hari"
            min={0}
            step={1}
            value={values.termin_hari ?? ''}
            onChange={onChange}
            placeholder="Contoh: 30"
            className={inputClass}
          />
          <p className="text-[10px] leading-snug text-text-muted">
            Dipakai hitung jatuh tempo tagihan (tanggal faktur + termin).
          </p>
        </label>

        <fieldset className="space-y-0.5">
          <legend className="text-[11px] leading-none text-text-secondary">Jenis PBF</legend>
          <div className="flex flex-wrap gap-1">
            {JENIS_PBF_OPTIONS.map((option) => {
              const checked = values.jenis_pbf.includes(option);
              return (
                <label
                  key={option}
                  className={`inline-flex cursor-pointer items-center rounded-[4px] border px-2 py-1 text-[11px] ${
                    checked
                      ? 'border-accent-yellow bg-accent-yellow/10 text-text-primary'
                      : 'border-border-subtle text-text-secondary'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onJenisPbfToggle(option)}
                    className="sr-only"
                  />
                  {option}
                </label>
              );
            })}
          </div>
        </fieldset>

        <section className="space-y-1 pt-0.5">
          <h3 className="text-[11px] font-semibold leading-none text-text-primary">
            Jadwal Order & Kirim
          </h3>
          <JadwalEditor value={values.jadwal} onChange={onJadwalChange} />
        </section>

        {error ? (
          <p className="rounded-[4px] border border-state-error/40 bg-state-error/10 px-2.5 py-1.5 text-[11px] text-state-error">
            {error}
          </p>
        ) : null}
      </form>
    </SheetModal>
  );
}
