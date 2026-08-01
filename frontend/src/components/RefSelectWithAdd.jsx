import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import SubmitSpinner from './SubmitSpinner';

const triggerClass =
  'flex w-full items-center gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-left text-[13px] leading-snug outline-none transition focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow disabled:cursor-not-allowed disabled:opacity-60';

const inputClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] leading-snug text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow';

/**
 * Dropdown referensi + opsi "+ Tambah baru".
 * Skema sama SearchableObatSelect: A–Z, scroll ke pilihan saat buka,
 * yang tidak terpilih abu-abu.
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
  hideLabel = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [newNama, setNewNama] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const activeItemRef = useRef(null);

  const selected = useMemo(() => {
    if (!value) return null;
    return (options || []).find((o) => o.id === value) || null;
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byNama = (a, b) =>
      String(a.nama || '').localeCompare(String(b.nama || ''), 'id', {
        sensitivity: 'base',
      });

    let list = [...(options || [])];
    if (q) {
      list = list.filter((o) => String(o.nama || '').toLowerCase().includes(q));
    }
    list.sort(byNama);
    return list;
  }, [options, query]);

  const triggerLabel = selected
    ? selected.nama
    : allowEmpty
      ? emptyLabel
      : 'Pilih…';
  const triggerMuted = !selected;

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');

    function scrollSelectedToTop() {
      const list = listRef.current;
      const item = activeItemRef.current;
      if (!list || !item) return;
      list.scrollTop +=
        item.getBoundingClientRect().top - list.getBoundingClientRect().top;
    }

    requestAnimationFrame(() => {
      searchRef.current?.focus();
      requestAnimationFrame(scrollSelectedToTop);
    });
    return undefined;
  }, [open]);

  function pick(id) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  function startAdd() {
    setOpen(false);
    setAdding(true);
    setNewNama('');
    setError('');
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

  const showEmptyRow =
    allowEmpty &&
    (!query.trim() || emptyLabel.toLowerCase().includes(query.trim().toLowerCase()));
  const emptyActive = !value;

  return (
    <div
      ref={rootRef}
      className={hideLabel ? 'relative block' : 'relative block space-y-0.5'}
    >
      {!hideLabel ? (
        <span className="text-[11px] leading-none text-text-secondary">
          {label}
          {required ? <span className="text-accent-yellow"> *</span> : null}
        </span>
      ) : null}

      {adding ? (
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
      ) : (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setQuery('');
              setOpen((v) => !v);
            }}
            className={triggerClass}
            aria-expanded={open}
            aria-haspopup="listbox"
          >
            <span
              className={`min-w-0 flex-1 truncate ${
                triggerMuted ? 'text-text-muted' : 'font-medium text-text-primary'
              }`}
            >
              {triggerLabel}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
          </button>

          {/* native required hook untuk form HTML5 */}
          {required ? (
            <input
              tabIndex={-1}
              aria-hidden
              className="sr-only"
              value={value || ''}
              onChange={() => {}}
              required
            />
          ) : null}

          {open ? (
            <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface shadow-sm">
              <div className="flex items-center gap-2 border-b border-border-subtle px-2 py-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Cari ${label || 'opsi'}…`}
                  className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
                />
              </div>
              <ul
                ref={listRef}
                role="listbox"
                className="relative max-h-52 overflow-y-auto scrollbar-hide"
              >
                {showEmptyRow ? (
                  <li ref={emptyActive ? activeItemRef : undefined}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={emptyActive}
                      onClick={() => pick('')}
                      className={`flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-bg-surface-hover ${
                        emptyActive
                          ? 'bg-bg-surface-hover font-medium text-text-primary'
                          : 'text-text-muted'
                      }`}
                    >
                      {emptyLabel}
                    </button>
                  </li>
                ) : null}

                {filtered.length === 0 && !showEmptyRow ? (
                  <li className="px-3 py-2 text-[12px] text-text-muted">
                    Tidak ada hasil
                  </li>
                ) : (
                  filtered.map((opt) => {
                    const active = opt.id === value;
                    return (
                      <li
                        key={opt.id}
                        ref={active ? activeItemRef : undefined}
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => pick(opt.id)}
                          className={`flex w-full items-center px-3 py-1.5 text-left text-[13px] hover:bg-bg-surface-hover ${
                            active
                              ? 'bg-bg-surface-hover font-medium text-text-primary'
                              : 'text-text-muted'
                          }`}
                        >
                          <span className="truncate">{opt.nama}</span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
              <div className="border-t border-border-subtle">
                <button
                  type="button"
                  onClick={startAdd}
                  className="flex w-full items-center px-3 py-1.5 text-left text-[13px] font-medium text-accent-yellow hover:bg-bg-surface-hover"
                >
                  + Tambah baru
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
