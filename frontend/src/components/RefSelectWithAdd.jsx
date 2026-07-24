import { useState } from 'react';
import SubmitSpinner from './SubmitSpinner';

const selectClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] leading-snug text-text-primary outline-none transition focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow disabled:cursor-not-allowed disabled:opacity-60';

const inputClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] leading-snug text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow';

const ADD_VALUE = '__add_new__';

/**
 * Dropdown referensi + opsi "+ Tambah baru" di bawah.
 * onCreate(nama) harus return { id, nama } dari API.
 */
export default function RefSelectWithAdd({
  label,
  value,
  options,
  onChange,
  onCreate,
  allowEmpty = false,
  emptyLabel = '—',
  disabled = false,
  required = false,
}) {
  const [adding, setAdding] = useState(false);
  const [newNama, setNewNama] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function handleSelect(event) {
    const next = event.target.value;
    if (next === ADD_VALUE) {
      setAdding(true);
      setNewNama('');
      setError('');
      return;
    }
    onChange(next === '' ? '' : next);
  }

  async function handleSaveNew() {
    const nama = newNama.trim();
    if (!nama) {
      setError('Nama wajib diisi');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await onCreate(nama);
      onChange(created.id);
      setAdding(false);
      setNewNama('');
    } catch (err) {
      setError(err.message || 'Gagal menambah');
    } finally {
      setBusy(false);
    }
  }

  function handleCancelAdd() {
    if (busy) return;
    setAdding(false);
    setNewNama('');
    setError('');
  }

  return (
    <div className="block space-y-0.5">
      <span className="text-[11px] leading-none text-text-secondary">
        {label}
        {required ? <span className="text-accent-yellow"> *</span> : null}
      </span>

      {!adding ? (
        <select
          value={value || ''}
          onChange={handleSelect}
          disabled={disabled}
          required={required}
          className={selectClass}
        >
          {allowEmpty ? <option value="">{emptyLabel}</option> : null}
          {!allowEmpty && !value ? (
            <option value="" disabled>
              Pilih…
            </option>
          ) : null}
          {(options || []).map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.nama}
            </option>
          ))}
          <option value={ADD_VALUE}>+ Tambah baru</option>
        </select>
      ) : (
        <div className="space-y-1 rounded-[4px] border border-border-subtle p-2">
          <input
            type="text"
            value={newNama}
            onChange={(e) => setNewNama(e.target.value)}
            placeholder="Ketik nilai baru"
            disabled={busy}
            className={inputClass}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveNew();
              }
            }}
          />
          {error ? (
            <p className="text-[11px] text-state-error">{error}</p>
          ) : null}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleCancelAdd}
              disabled={busy}
              className="rounded-[4px] border border-border-subtle px-2 py-1 text-[12px] text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveNew}
              disabled={busy}
              className="inline-flex items-center justify-center rounded-[4px] bg-accent-navy px-2 py-1 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-80"
            >
              {busy ? <SubmitSpinner /> : 'Simpan'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
