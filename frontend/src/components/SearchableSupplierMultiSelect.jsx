import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

/**
 * Multi-select searchable supplier picker (chips + dropdown).
 *
 * @param {{
 *   options: Array<{ id: string, nama?: string | null, inisial?: string | null }>,
 *   value: Array<{ id: string, nama?: string | null, inisial?: string | null, pricelist_kode_pbf?: string | null }>,
 *   onAdd: (supplier: object) => void,
 *   onRemove: (supplierId: string) => void,
 *   placeholder?: string,
 *   disabled?: boolean,
 *   hint?: string | null,
 * }} props
 */
export default function SearchableSupplierMultiSelect({
  options = [],
  value = [],
  onAdd,
  onRemove,
  placeholder = 'Cari supplier…',
  disabled = false,
  hint = null,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const selectedIds = useMemo(
    () => new Set((value || []).map((s) => s.id)),
    [value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = (options || []).filter((s) => !selectedIds.has(s.id));
    if (!q) return available.slice(0, 80);
    return available
      .filter((s) => {
        const nama = String(s.nama || '').toLowerCase();
        const inisial = String(s.inisial || '').toLowerCase();
        return nama.includes(q) || inisial.includes(q);
      })
      .slice(0, 80);
  }, [options, query, selectedIds]);

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

  function chipLabel(s) {
    return s.inisial || s.nama || s.id;
  }

  return (
    <div className="block space-y-0.5">
      <span className="text-[11px] leading-none text-text-secondary">
        Supplier
      </span>

      {value.length > 0 ? (
        <div className="mb-1 flex flex-wrap gap-1">
          {value.map((s) => (
            <span
              key={s.id}
              className="inline-flex max-w-full items-center gap-1 rounded-[4px] bg-bg-surface-hover px-1.5 py-0.5 text-[11px] font-semibold text-text-primary"
            >
              <span className="truncate">{chipLabel(s)}</span>
              {s.pricelist_kode_pbf ? (
                <span className="truncate font-normal text-text-muted">
                  · {s.pricelist_kode_pbf}
                </span>
              ) : null}
              {!disabled ? (
                <button
                  type="button"
                  onClick={() => onRemove(s.id)}
                  className="shrink-0 text-text-muted hover:text-state-error"
                  aria-label={`Hapus ${chipLabel(s)}`}
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <div ref={rootRef} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-left outline-none focus:border-accent-yellow disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="min-w-0 flex-1 text-[13px] text-text-muted">
            {placeholder}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
        </button>

        {open && !disabled ? (
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
                filtered.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onAdd(s);
                        setOpen(false);
                      }}
                      className="flex w-full items-center px-3 py-1.5 text-left text-[13px] text-text-primary hover:bg-bg-surface-hover"
                    >
                      <span className="font-bold">{s.inisial || '—'}</span>
                      <span className="ml-1.5 truncate font-normal text-text-secondary">
                        {s.nama || ''}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>

      {hint ? (
        <p className="text-[10px] leading-snug text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
