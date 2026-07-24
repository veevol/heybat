import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { obatDropdownParts } from '../lib/matchingUi';

/**
 * Searchable obat_yelo picker.
 * Display: [Nama Obat bold] [konversi] [Satuan 1]/[Satuan 2] — tanpa kode obat.
 *
 * @param {{
 *   options: Array<object>,
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
  /** Border class for closed trigger; default subtle, Matching uses yellow. */
  borderClassName = 'border-border-subtle',
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
      .filter((o) => {
        const nama = String(o.nama_obat || '').toLowerCase();
        const kode = String(o.kode_obat || '').toLowerCase();
        const sat1 = String(o.satuan_1?.nama || '').toLowerCase();
        const sat2 = String(o.satuan_2?.nama || '').toLowerCase();
        return (
          nama.includes(q) ||
          kode.includes(q) ||
          sat1.includes(q) ||
          sat2.includes(q)
        );
      })
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

  function renderLabel(obat, { truncate = true } = {}) {
    const { nama, meta } = obatDropdownParts(obat);
    return (
      <span
        className={`min-w-0 flex-1 text-[13px] leading-snug text-text-primary ${
          truncate ? 'truncate' : ''
        }`}
      >
        <span className="font-bold">{nama}</span>
        {meta ? <span className="font-normal"> {meta}</span> : null}
      </span>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 rounded-[4px] border ${borderClassName} bg-bg-surface px-3 py-1.5 text-left outline-none focus:border-accent-yellow`}
      >
        {selected ? (
          renderLabel(selected)
        ) : (
          <span className="min-w-0 flex-1 text-[13px] text-text-muted">
            {placeholder}
          </span>
        )}
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
                      className={`flex w-full items-center px-3 py-1.5 text-left hover:bg-bg-surface-hover ${
                        active ? 'bg-bg-surface-hover' : ''
                      }`}
                    >
                      {renderLabel(o)}
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
