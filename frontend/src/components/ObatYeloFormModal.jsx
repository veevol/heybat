import SubmitSpinner from './SubmitSpinner';
import SheetModal from './SheetModal';
import RefSelectWithAdd from './RefSelectWithAdd';
import { ObatModalTitle } from './ObatYeloDetailSheet';
import { createRef } from '../api/refData';

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
  type = 'text',
}) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[11px] leading-none text-text-secondary">
        {label}
        {required ? <span className="text-accent-yellow"> *</span> : null}
      </span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
        readOnly={disabled}
        placeholder={placeholder}
        className={inputClass}
        step={type === 'number' ? 'any' : undefined}
      />
      {hint ? <p className="text-[10px] leading-snug text-text-muted">{hint}</p> : null}
    </label>
  );
}

export default function ObatYeloFormModal({
  mode,
  values,
  onChange,
  onField,
  refs,
  onRefCreated,
  submitting,
  error,
  onClose,
  onSubmit,
}) {
  const isEdit = mode === 'edit';
  const title = isEdit ? (
    <ObatModalTitle nama={values.nama_obat} kode={values.kode_obat} />
  ) : (
    <h2 className="text-[15px] font-semibold leading-none text-text-primary">
      Tambah Obat
    </h2>
  );

  function makeCreateHandler(jenis) {
    return async (nama) => {
      const created = await createRef(jenis, nama);
      onRefCreated(jenis, created);
      return created;
    };
  }

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
            form="obat-yelo-form"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-80 sm:w-auto sm:min-w-24"
          >
            {submitting ? <SubmitSpinner /> : 'Simpan'}
          </button>
        </div>
      }
    >
      <form id="obat-yelo-form" onSubmit={onSubmit} className="space-y-1.5">
        <Field
          label="Kode Obat"
          name="kode_obat"
          value={values.kode_obat}
          onChange={onChange}
          required={!isEdit}
          disabled={isEdit}
          placeholder="Contoh: OBT2606030003"
          hint={
            isEdit
              ? 'Kode obat terkunci setelah dibuat.'
              : 'Kode dari Vmedis / input manual — tidak bisa diubah setelah disimpan.'
          }
        />
        <Field
          label="Nama Obat"
          name="nama_obat"
          value={values.nama_obat}
          onChange={onChange}
          required
          placeholder="Nama obat"
        />

        <RefSelectWithAdd
          label="Kandungan"
          value={values.kandungan_id}
          options={refs.kandungan}
          onChange={(id) => onField('kandungan_id', id)}
          onCreate={makeCreateHandler('kandungan')}
          allowEmpty
          emptyLabel="Tidak ada"
        />

        <RefSelectWithAdd
          label="Golongan"
          value={values.golongan_id}
          options={refs.golongan}
          onChange={(id) => onField('golongan_id', id)}
          onCreate={makeCreateHandler('golongan')}
          allowEmpty
          emptyLabel="Tidak ada"
        />

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <RefSelectWithAdd
            label="Satuan 1"
            value={values.satuan_1_id}
            options={refs.satuan}
            onChange={(id) => onField('satuan_1_id', id)}
            onCreate={makeCreateHandler('satuan')}
            allowEmpty
            emptyLabel="Tidak ada"
          />
          <Field
            label="Konversi"
            name="konversi"
            type="number"
            value={values.konversi}
            onChange={onChange}
            placeholder="0"
          />
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <RefSelectWithAdd
            label="Satuan 2"
            value={values.satuan_2_id}
            options={refs.satuan}
            onChange={(id) => onField('satuan_2_id', id)}
            onCreate={makeCreateHandler('satuan')}
            allowEmpty
            emptyLabel="Tidak ada"
          />
          <Field
            label="Min Jual"
            name="min_jual"
            type="number"
            value={values.min_jual}
            onChange={onChange}
            placeholder="0"
          />
        </div>

        <RefSelectWithAdd
          label="Grup Substitusi"
          value={values.grup_substitusi_id}
          options={refs['grup-substitusi']}
          onChange={(id) => onField('grup_substitusi_id', id)}
          onCreate={makeCreateHandler('grup-substitusi')}
          allowEmpty
          emptyLabel="Tidak ada substitusi"
        />

        {error ? (
          <p className="rounded-[4px] border border-state-error/40 bg-state-error/10 px-2 py-1.5 text-[12px] text-state-error">
            {error}
          </p>
        ) : null}
      </form>
    </SheetModal>
  );
}
