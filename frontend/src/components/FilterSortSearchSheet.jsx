import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Search } from 'lucide-react';
import SheetModal from './SheetModal';

/**
 * Reusable filter / sort / search bottom-sheet.
 * All data & behavior come from props — no page-specific logic.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   title?: string,
 *   searchValue: string,
 *   onSearchChange: (value: string) => void,
 *   searchPlaceholder?: string,
 *   sortOptions?: Array<{ key: string, label: string }>,
 *   sortState?: { key: string | null, direction: 'asc' | 'desc' },
 *   onSortChange?: (next: { key: string | null, direction: 'asc' | 'desc' }) => void,
 *   filterGroups?: Array<{ key: string, label: string, options: string[], preserveOrder?: boolean }>,
 *   filterState?: Record<string, string[]>,
 *   onFilterChange?: (next: Record<string, string[]>) => void,
 *   onApply: () => void,
 *   onReset: () => void,
 * }} props
 */
export default function FilterSortSearchSheet({
  open,
  onClose,
  title = 'Filter',
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Cari…',
  sortOptions = [],
  sortState = { key: null, direction: 'asc' },
  onSortChange,
  filterGroups = [],
  filterState = {},
  onFilterChange,
  onApply,
  onReset,
}) {
  const [expanded, setExpanded] = useState(() => ({}));

  if (!open) return null;

  function toggleSort(key) {
    if (!onSortChange) return;
    if (sortState?.key === key) {
      onSortChange({
        key,
        direction: sortState.direction === 'asc' ? 'desc' : 'asc',
      });
    } else {
      onSortChange({ key, direction: 'asc' });
    }
  }

  function toggleFilterOption(groupKey, option) {
    if (!onFilterChange) return;
    const current = filterState?.[groupKey] || [];
    const nextSelected = current.includes(option)
      ? current.filter((v) => v !== option)
      : [...current, option];
    onFilterChange({
      ...filterState,
      [groupKey]: nextSelected,
    });
  }

  function toggleGroup(groupKey) {
    setExpanded((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
          {title}
        </h2>
      }
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            className="flex-1 rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary hover:bg-bg-surface-hover sm:flex-none sm:min-w-24"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={onApply}
            className="flex-1 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110 sm:flex-none sm:min-w-28"
          >
            Terapkan
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted"
            strokeWidth={2}
          />
          <input
            type="search"
            value={searchValue}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-[4px] border border-border-subtle bg-bg-base py-1.5 pl-8 pr-3 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow"
            aria-label="Cari"
          />
        </div>

        {sortOptions.length > 0 ? (
          <section>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Urutkan
            </p>
            <div className="space-y-1">
              {sortOptions.map((opt) => {
                const active = sortState?.key === opt.key;
                const dir = active ? sortState.direction : null;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleSort(opt.key)}
                    className={`flex w-full items-center justify-between gap-2 rounded-[4px] border px-2.5 py-2 text-left text-[13px] ${
                      active
                        ? 'border-accent-yellow bg-accent-yellow/10 text-text-primary'
                        : 'border-border-subtle text-text-secondary hover:bg-bg-surface-hover'
                    }`}
                  >
                    <span className="font-medium">{opt.label}</span>
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                      {dir === 'asc' ? (
                        <>
                          <ArrowUp className="h-3.5 w-3.5 text-accent-yellow" />
                          Naik
                        </>
                      ) : dir === 'desc' ? (
                        <>
                          <ArrowDown className="h-3.5 w-3.5 text-accent-yellow" />
                          Turun
                        </>
                      ) : (
                        <span className="text-text-muted">Tap untuk aktif</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {filterGroups.length > 0 ? (
          <section className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Filter
            </p>
            {filterGroups.map((group) => {
              const isOpen = Boolean(expanded[group.key]);
              const selected = filterState?.[group.key] || [];
              const options = group.preserveOrder
                ? [...(group.options || [])]
                : [...(group.options || [])].sort((a, b) =>
                    String(a).localeCompare(String(b), 'id')
                  );
              return (
                <div
                  key={group.key}
                  className="overflow-hidden rounded-[4px] border border-border-subtle"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center justify-between gap-2 bg-bg-base px-2.5 py-2 text-left hover:bg-bg-surface-hover"
                  >
                    <span className="text-[13px] font-medium text-text-primary">
                      {group.label}
                      {selected.length > 0 ? (
                        <span className="ml-1.5 text-[11px] font-semibold text-accent-yellow">
                          ({selected.length})
                        </span>
                      ) : null}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-text-muted transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen ? (
                    <ul className="max-h-44 space-y-0.5 overflow-y-auto border-t border-border-subtle bg-bg-surface px-2 py-1.5 scrollbar-hide">
                      {options.length === 0 ? (
                        <li className="px-1 py-1 text-[12px] text-text-muted">
                          Tidak ada opsi
                        </li>
                      ) : (
                        options.map((option) => {
                          const checked = selected.includes(option);
                          return (
                            <li key={option}>
                              <label className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1 py-1.5 hover:bg-bg-surface-hover">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    toggleFilterOption(group.key, option)
                                  }
                                  className="h-3.5 w-3.5 shrink-0 accent-accent-yellow"
                                />
                                <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                                  {option}
                                </span>
                              </label>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </section>
        ) : null}
      </div>
    </SheetModal>
  );
}
