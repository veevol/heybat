import SubmitSpinner from './SubmitSpinner';
import SheetModal from './SheetModal';
import RefSelectWithAdd from './RefSelectWithAdd';
import SearchableSupplierMultiSelect from './SearchableSupplierMultiSelect';
import { ObatModalTitle } from './ObatYeloDetailSheet';
import { createRef } from '../api/refData';

const cardClass = 'rounded-[4px] bg-bg-base px-2.5 py-2 space-y-1.5';

const inputClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-[13px] leading-snug text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow disabled:cursor-not-allowed disabled:opacity-60';

function FormRow({ label, required = false, hint = null, children }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-1.5">
      <span className="pt-1.5 text-[13px] leading-snug text-text-muted">
        {label}
        {required ? <span className="text-accent-yellow"> *</span> : null}
      </span>
      <div className="min-w-0">
        {children}
        {hint ? (
          <p className="mt-0.5 text-[10px] leading-snug text-text-muted">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Form create/edit obat Yelo.
 * Edit: layout card + label kiri (selaras Detail). Tanpa Stok & Harga.
 */
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
  showSupplierField = false,
  supplierOptions = [],
  supplierValue = [],
  onSupplierAdd,
  onSupplierRemove,
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
      borderless
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
      <form id="obat-yelo-form" onSubmit={onSubmit} className="space-y-2">
        <section className={cardClass}>
          <FormRow
            label="Kode Obat"
            required={!isEdit}
            hint={
              isEdit
                ? 'Kode obat terkunci setelah dibuat.'
                : 'Kode dari Vmedis / input manual — tidak bisa diubah setelah disimpan.'
            }
          >
            <input
              type="text"
              name="kode_obat"
              value={values.kode_obat}
              onChange={onChange}
              disabled={isEdit}
              required={!isEdit}
              readOnly={isEdit}
              placeholder="Contoh: OBT2606030003"
              className={inputClass}
            />
          </FormRow>
          <FormRow label="Nama Obat" required>
            <input
              type="text"
              name="nama_obat"
              value={values.nama_obat}
              onChange={onChange}
              required
              placeholder="Nama obat"
              className={inputClass}
            />
          </FormRow>
        </section>

        <section className={cardClass}>
          <FormRow label="Min Jual">
            <input
              type="number"
              name="min_jual"
              value={values.min_jual}
              onChange={onChange}
              placeholder="0"
              className={inputClass}
              step="any"
            />
          </FormRow>
          <FormRow label="Satuan 1">
            <RefSelectWithAdd
              hideLabel
              label="Satuan 1"
              value={values.satuan_1_id}
              options={refs.satuan}
              onChange={(id) => onField('satuan_1_id', id)}
              onCreate={makeCreateHandler('satuan')}
              allowEmpty
              emptyLabel="Tidak ada"
            />
          </FormRow>
          <FormRow label="Konversi">
            <input
              type="number"
              name="konversi"
              value={values.konversi}
              onChange={onChange}
              placeholder="0"
              className={inputClass}
              step="any"
            />
          </FormRow>
          <FormRow label="Satuan 2">
            <RefSelectWithAdd
              hideLabel
              label="Satuan 2"
              value={values.satuan_2_id}
              options={refs.satuan}
              onChange={(id) => onField('satuan_2_id', id)}
              onCreate={makeCreateHandler('satuan')}
              allowEmpty
              emptyLabel="Tidak ada"
            />
          </FormRow>
        </section>

        <section className={cardClass}>
          <FormRow label="Substitusi">
            <RefSelectWithAdd
              hideLabel
              label="Substitusi"
              value={values.grup_substitusi_id}
              options={refs['grup-substitusi']}
              onChange={(id) => onField('grup_substitusi_id', id)}
              onCreate={makeCreateHandler('grup-substitusi')}
              allowEmpty
              emptyLabel="Non Subtitusi"
            />
          </FormRow>
          <FormRow label="Kandungan">
            <RefSelectWithAdd
              hideLabel
              label="Kandungan"
              value={values.kandungan_id}
              options={refs.kandungan}
              onChange={(id) => onField('kandungan_id', id)}
              onCreate={makeCreateHandler('kandungan')}
              allowEmpty
              emptyLabel="Tidak ada"
            />
          </FormRow>
          <FormRow label="Golongan">
            <RefSelectWithAdd
              hideLabel
              label="Golongan"
              value={values.golongan_id}
              options={refs.golongan}
              onChange={(id) => onField('golongan_id', id)}
              onCreate={makeCreateHandler('golongan')}
              allowEmpty
              emptyLabel="Tidak ada"
            />
          </FormRow>
          {showSupplierField ? (
            <FormRow
              label="Supplier"
              hint="Hanya owner. Tambah → matching langsung terverifikasi. Hapus → status ditolak (riwayat tetap)."
            >
              <SearchableSupplierMultiSelect
                hideLabel
                options={supplierOptions}
                value={supplierValue}
                onAdd={onSupplierAdd}
                onRemove={onSupplierRemove}
                disabled={submitting}
                placeholder="Tambah supplier…"
              />
            </FormRow>
          ) : null}
        </section>

        {error ? (
          <p className="rounded-[4px] border border-state-error/40 bg-state-error/10 px-2 py-1.5 text-[12px] text-state-error">
            {error}
          </p>
        ) : null}
      </form>
    </SheetModal>
  );
}
