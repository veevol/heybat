/**
 * Horizontal Defekta filter pills — Semua / Belum Dipilih / per-PBF.
 */
export default function DefektaFilterPills({
  activeKey = 'semua',
  totalBelumDipilih = 0,
  pbfTerpilih = [],
  onChange,
  disabled = false,
}) {
  const pills = [
    { key: 'semua', label: 'Semua' },
    {
      key: 'belum',
      label: `Belum Dipilih (${Number(totalBelumDipilih) || 0})`,
    },
    ...(pbfTerpilih || [])
      .filter((p) => p?.supplier_id && (Number(p.jumlah_obat) || 0) > 0)
      .map((p) => ({
        key: `pbf:${p.supplier_id}`,
        label: `${p.inisial || p.nama || 'PBF'} (${p.jumlah_obat})`,
      })),
  ];

  return (
    <div className="-mx-3 mb-2 flex gap-1 overflow-x-auto px-3 scrollbar-hide">
      {pills.map((p) => {
        const active = activeKey === p.key;
        return (
          <button
            key={p.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(p.key)}
            className={`shrink-0 rounded-[4px] px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50 ${
              active
                ? 'bg-accent-yellow text-bg-base'
                : 'bg-bg-surface text-text-secondary hover:bg-bg-surface-hover'
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
