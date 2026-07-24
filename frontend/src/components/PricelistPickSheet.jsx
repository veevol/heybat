import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';
import { formatHarga } from '../lib/matchingUi';

/**
 * Pilih item pricelist PBF saat owner menambah supplier ke obat.
 */
export default function PricelistPickSheet({
  supplier,
  items = [],
  loading = false,
  onClose,
  onPick,
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items || [];
    if (!q) return list.slice(0, 100);
    return list
      .filter((row) => {
        const nama = String(row.nama_barang || '').toLowerCase();
        const kode = String(row.kode_pbf || '').toLowerCase();
        const sat = String(row.satuan || '').toLowerCase();
        return nama.includes(q) || kode.includes(q) || sat.includes(q);
      })
      .slice(0, 100);
  }, [items, query]);

  const titleName = supplier?.inisial || supplier?.nama || 'Supplier';

  return (
    <SheetModal
      title={
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent-yellow">
            Pilih item pricelist
          </p>
          <h2 className="mt-0.5 truncate text-[15px] font-semibold text-text-primary">
            {titleName}
            {supplier?.nama && supplier?.inisial ? (
              <span className="font-normal text-text-secondary">
                {' '}
                · {supplier.nama}
              </span>
            ) : null}
          </h2>
        </div>
      }
      onClose={onClose}
    >
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-[4px] border border-border-subtle bg-bg-base px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama / kode PBF…"
            className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <SubmitSpinner />
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-[4px] border border-dashed border-border-subtle px-3 py-4 text-center text-[13px] text-text-muted">
            Tidak ada item pricelist untuk supplier ini.
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto scrollbar-hide">
            {filtered.map((row) => {
              const harga = formatHarga(row.harga_dasar);
              return (
                <li key={row.kode_pbf}>
                  <button
                    type="button"
                    onClick={() => onPick(row)}
                    className="flex w-full flex-col gap-0.5 rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2 text-left hover:bg-bg-surface-hover"
                  >
                    <span className="text-[13px] font-bold leading-snug text-text-primary">
                      {row.nama_barang || row.kode_pbf}
                    </span>
                    <span className="text-[11px] text-text-muted">
                      {[row.kode_pbf, row.satuan, harga].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SheetModal>
  );
}
