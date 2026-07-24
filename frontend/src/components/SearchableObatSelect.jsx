import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

/**
 * Searchable obat_yelo picker.
 * @param {{
 *   options: Array<{ kode_obat: string, nama_obat: string }>,
 *   value: string,
 *   onChange: (kode: string) => void,
 *   placeholder?: string,
 * }} props
 */
export default function SearchableObatSelect({
  options = [],
  value,
  onChange,
  placeholder = 'Cari obat Yelo…',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selected = useMemo(
    () => options.find((o) => o.kode_obat === value) || null,
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 80);
    return options
      .filter(
        (o) =>
          String(o.nama_obat || '')
            .toLowerCase()
            .includes(q) ||
          String(o.kode_obat || '')
            .toLowerCase()
            .includes(q)
      )
      .slice(0, 80);
  }, [options, query]);

  useEffect(() => {
    function onDocClick(e) {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-left outline-none focus:border-accent-yellow"
      >
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate text-[13px] font-semibold leading-tight text-text-primary">
                {selected.nama_obat}
              </span>
              <span className="block truncate text-[11px] text-text-muted">
                {selected.kode_obat}
              </span>
            </>
          ) : (
            <span className="text-[13px] text-text-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface shadow-sm">
          <div className="flex items-center gap-2 border-b border-border-subtle px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto scrollbar-hide">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-text-muted">
                Tidak ada hasil
              </li>
            ) : (
              filtered.map((o) => {
                const active = o.kode_obat === value;
                return (
                  <li key={o.kode_obat}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(o.kode_obat);
                        setOpen(false);
                      }}
                      className={`flex w-full flex-col px-3 py-1.5 text-left hover:bg-bg-surface-hover ${
                        active ? 'bg-bg-surface-hover' : ''
                      }`}
                    >
                      <span className="truncate text-[13px] font-medium text-text-primary">
                        {o.nama_obat}
                      </span>
                      <span className="truncate text-[11px] text-text-muted">
                        {o.kode_obat}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
