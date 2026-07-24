import { useEffect, useState } from 'react';
import SubmitSpinner from './SubmitSpinner';
import SheetModal from './SheetModal';
import RefSelectWithAdd from './RefSelectWithAdd';
import { createRef } from '../api/refData';

const inputClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] leading-snug text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow disabled:cursor-not-allowed disabled:opacity-60';

function Field({
  label,
  name,
  value,
  onChange,
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
        required={required}
        placeholder={placeholder}
        className={inputClass}
        step={type === 'number' ? 'any' : undefined}
      />
      {hint ? <p className="text-[10px] leading-snug text-text-muted">{hint}</p> : null}
    </label>
  );
}

/**
 * Modal "Tambah Obat" — dari Matching (dengan pricelist) atau standalone dari Data Obat.
 * @param {{ variant?: 'matching' | 'standalone' }} props
 */
export default function TambahObatDariMatchingModal({
  variant = 'matching',
  pricelistRow = null,
  values,
  onChange,
  onField,
  refs,
  onRefCreated,
  submitting,
  error,
  onClose,
  onSubmit,
  kodeLoading = false,
  submitLabel = null,
  kodeHint = null,
}) {
  const [localError, setLocalError] = useState('');
  const isStandalone = variant === 'standalone';

  useEffect(() => {
    setLocalError('');
  }, [values, error]);

  const namaPricelist = pricelistRow?.nama_barang || '—';
  const satuanPricelist = pricelistRow?.satuan || '';

  function makeCreateHandler(jenis) {
    return async (nama) => {
      const created = await createRef(jenis, nama);
      onRefCreated(jenis, created);
      return created;
    };
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!values.kode_obat?.trim()) {
      setLocalError('Kode obat wajib diisi');
      return;
    }
    if (!values.nama_obat?.trim()) {
      setLocalError('Nama obat wajib diisi');
      return;
    }
    onSubmit(e);
  }

  const title = isStandalone ? (
    <h2 className="text-[15px] font-semibold leading-none text-text-primary">
      Tambah Obat Baru
    </h2>
  ) : (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-yellow">
        Tambah Obat
      </p>
      <h2 className="mt-0.5 truncate text-[15px] font-semibold leading-snug text-text-primary">
        {namaPricelist}
        {satuanPricelist ? (
          <span className="font-normal text-text-secondary"> {satuanPricelist}</span>
        ) : null}
      </h2>
    </div>
  );

  const displayError = localError || error;
  const buttonLabel =
    submitLabel || (isStandalone ? 'Simpan' : 'Simpan & Ajukan');
  const kodeFieldHint =
    kodeHint ||
    'Otomatis APP+tanggal+urut — bisa diedit manual.';
  const kodePlaceholder = kodeLoading
    ? 'Menghasilkan kode…'
    : kodeHint
      ? 'Kode dari Vmedis'
      : 'APP…';

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
            form="tambah-obat-matching-form"
            disabled={submitting || kodeLoading}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-80 sm:w-auto sm:min-w-28"
          >
            {submitting ? <SubmitSpinner /> : buttonLabel}
          </button>
        </div>
      }
    >
      <form
        id="tambah-obat-matching-form"
        onSubmit={handleSubmit}
        className="space-y-1.5"
      >
        <Field
          label="Kode Obat"
          name="kode_obat"
          value={values.kode_obat}
          onChange={onChange}
          required
          placeholder={kodePlaceholder}
          hint={kodeFieldHint}
        />
        <Field
          label="Nama Obat"
          name="nama_obat"
          value={values.nama_obat}
          onChange={onChange}
          required
          placeholder="Nama obat"
        />

        <p className="pt-1 text-[10px] text-text-muted">
          Field di bawah opsional — boleh dilewati, lengkapi nanti di Data Obat Yelo.
        </p>

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

        {displayError ? (
          <p className="rounded-[4px] border border-state-error/40 bg-state-error/10 px-2 py-1.5 text-[12px] text-state-error">
            {displayError}
          </p>
        ) : null}
      </form>
    </SheetModal>
  );
}
