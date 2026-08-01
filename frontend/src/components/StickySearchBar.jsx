import { Search } from 'lucide-react';
import SubmitSpinner from './SubmitSpinner';

/**
 * Sticky search strip — skema sama Matching/Pricelist (selalu terlihat di bawah TopBar).
 */
export default function StickySearchBar({
  value = '',
  onChange,
  placeholder = 'Cari…',
  loading = false,
  children = null,
}) {
  return (
    <div className="sticky top-12 z-20 -mx-3 mb-3 space-y-2 bg-bg-surface/80 px-3 pb-2 pt-1 backdrop-blur-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-[4px] border border-border-subtle bg-bg-surface py-1.5 pl-10 pr-9 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
          aria-label="Cari"
        />
        {loading ? (
          <SubmitSpinner className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent-yellow" />
        ) : null}
      </div>
      {children}
    </div>
  );
}
