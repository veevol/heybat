import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Search } from 'lucide-react';
import SheetModal from './SheetModal';

export const EMPTY_FILTER_OPTION_LABEL = '(Kosong / Tidak ada data)';

/** @param {string[]} [selected] */
export function emptyFilterSection(selected = []) {
  return { selected: [...selected], includeEmpty: false };
}

/** Normalize array legacy atau { selected, includeEmpty }. */
export function normalizeFilterSection(value) {
  if (Array.isArray(value)) {
    return { selected: [...value], includeEmpty: false };
  }
  if (value && typeof value === 'object') {
    return {
      selected: Array.isArray(value.selected) ? [...value.selected] : [],
      includeEmpty: Boolean(value.includeEmpty),
    };
  }
  return emptyFilterSection();
}

function cloneFilterState(state = {}) {
  const next = {};
  for (const [key, value] of Object.entries(state)) {
    next[key] = normalizeFilterSection(value);
  }
  return next;
}

/**
 * Reusable filter / sort / search bottom-sheet.
 * All data & behavior come from props — no page-specific logic.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   title?: string,
 *   searchValue?: string,
 *   onSearchChange?: (value: string) => void,
 *   searchPlaceholder?: string,
 *   showSearch?: boolean,
 *   sortOptions?: Array<{ key: string, label: string }>,
 *   sortState?: { key: string | null, direction: 'asc' | 'desc' },
 *   onSortChange?: (next: { key: string | null, direction: 'asc' | 'desc' }) => void,
 *   filterGroups?: Array<{
 *     key: string,
 *     label: string,
 *     options: string[],
 *     preserveOrder?: boolean,
 *     showEmptyOption?: boolean,
 *     showSearchInline?: boolean,
 *   }>,
 *   filterState?: Record<string, { selected: string[], includeEmpty?: boolean } | string[]>,
 *   onFilterChange?: (next: Record<string, { selected: string[], includeEmpty: boolean }>) => void,
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
  showSearch = true,
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
  const [optionSearch, setOptionSearch] = useState(() => ({}));

  useEffect(() => {
    if (!open) {
      setOptionSearch({});
      setExpanded({});
    }
  }, [open]);

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

  function patchSection(groupKey, patch) {
    if (!onFilterChange) return;
    const current = normalizeFilterSection(filterState?.[groupKey]);
    onFilterChange({
      ...cloneFilterState(filterState),
      [groupKey]: { ...current, ...patch },
    });
  }

  function toggleFilterOption(groupKey, option) {
    const current = normalizeFilterSection(filterState?.[groupKey]);
    const nextSelected = current.selected.includes(option)
      ? current.selected.filter((v) => v !== option)
      : [...current.selected, option];
    patchSection(groupKey, { selected: nextSelected });
  }

  function toggleIncludeEmpty(groupKey) {
    const current = normalizeFilterSection(filterState?.[groupKey]);
    patchSection(groupKey, { includeEmpty: !current.includeEmpty });
  }

  function toggleSelectAll(groupKey, visibleOptions) {
    const current = normalizeFilterSection(filterState?.[groupKey]);
    const allVisibleSelected =
      visibleOptions.length > 0 &&
      visibleOptions.every((opt) => current.selected.includes(opt));
    if (allVisibleSelected) {
      patchSection(groupKey, { selected: [], includeEmpty: false });
      return;
    }
    patchSection(groupKey, {
      selected: [...new Set([...current.selected, ...visibleOptions])],
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
      borderless
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
        {showSearch ? (
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
              className="h-9 w-full rounded-[4px] bg-bg-base py-1.5 pl-8 pr-3 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-accent-yellow"
              aria-label="Cari"
            />
          </div>
        ) : null}

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
                    className={`flex w-full items-center justify-between gap-2 rounded-[4px] px-2.5 py-2 text-left text-[13px] ${
                      active
                        ? 'bg-accent-yellow/10 text-text-primary'
                        : 'bg-bg-base text-text-secondary hover:bg-bg-surface-hover'
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
              const section = normalizeFilterSection(filterState?.[group.key]);
              const selected = section.selected;
              const activeCount =
                selected.length + (section.includeEmpty ? 1 : 0);
              const options = group.preserveOrder
                ? [...(group.options || [])]
                : [...(group.options || [])].sort((a, b) =>
                    String(a).localeCompare(String(b), 'id')
                  );
              const q = group.showSearchInline
                ? String(optionSearch[group.key] || '')
                    .trim()
                    .toLowerCase()
                : '';
              const visibleOptions = q
                ? options.filter((option) =>
                    String(option).toLowerCase().includes(q)
                  )
                : options;
              const allVisibleSelected =
                visibleOptions.length > 0 &&
                visibleOptions.every((opt) => selected.includes(opt));

              return (
                <div
                  key={group.key}
                  className="overflow-hidden rounded-[4px] bg-bg-base"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-bg-surface-hover"
                  >
                    <span className="text-[13px] font-medium text-text-primary">
                      {group.label}
                      {activeCount > 0 ? (
                        <span className="ml-1.5 text-[11px] font-semibold text-accent-yellow">
                          ({activeCount})
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
                    <div className="space-y-1.5 px-2 pb-2 pt-0.5">
                      {group.showSearchInline ? (
                        <div className="relative">
                          <Search
                            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted"
                            strokeWidth={2}
                          />
                          <input
                            type="search"
                            value={optionSearch[group.key] || ''}
                            onChange={(e) =>
                              setOptionSearch((prev) => ({
                                ...prev,
                                [group.key]: e.target.value,
                              }))
                            }
                            placeholder="Cari opsi..."
                            className="h-8 w-full rounded-[4px] bg-bg-surface py-1 pl-7 pr-2 text-[12px] text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-accent-yellow"
                            aria-label={`Cari opsi ${group.label}`}
                          />
                        </div>
                      ) : null}

                      <ul className="max-h-44 space-y-0.5 overflow-y-auto scrollbar-hide">
                        <li className="mb-0.5 border-b border-border-subtle pb-1">
                          <label
                            className={`flex items-center gap-2 rounded-[4px] px-1 py-1.5 ${
                              visibleOptions.length === 0
                                ? 'cursor-not-allowed opacity-40'
                                : 'cursor-pointer hover:bg-bg-surface-hover'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={allVisibleSelected}
                              disabled={visibleOptions.length === 0}
                              onChange={() =>
                                toggleSelectAll(group.key, visibleOptions)
                              }
                              className="h-3.5 w-3.5 shrink-0 accent-accent-yellow"
                            />
                            <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">
                              Pilih Semua
                            </span>
                          </label>
                        </li>

                        {group.showEmptyOption ? (
                          <li>
                            <label className="flex cursor-pointer items-center gap-2 rounded-[4px] px-1 py-1.5 hover:bg-bg-surface-hover">
                              <input
                                type="checkbox"
                                checked={section.includeEmpty}
                                onChange={() => toggleIncludeEmpty(group.key)}
                                className="h-3.5 w-3.5 shrink-0 accent-accent-yellow"
                              />
                              <span className="min-w-0 flex-1 truncate text-[13px] italic text-text-secondary">
                                {EMPTY_FILTER_OPTION_LABEL}
                              </span>
                            </label>
                          </li>
                        ) : null}

                        {options.length === 0 ? (
                          <li className="px-1 py-1 text-[12px] text-text-muted">
                            Tidak ada opsi
                          </li>
                        ) : visibleOptions.length === 0 ? (
                          <li className="px-1 py-1 text-[12px] text-text-muted">
                            Tidak ada yang cocok
                          </li>
                        ) : (
                          visibleOptions.map((option) => {
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
                    </div>
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
