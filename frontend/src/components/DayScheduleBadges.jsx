import { DAY_SHORT, DAYS } from '../lib/supplier';

export default function DayScheduleBadges({ jadwal = [] }) {
  const map = new Map((jadwal || []).map((row) => [row.hari, row]));

  return (
    <div className="flex items-end gap-0.5" aria-label="Jadwal order dan kirim">
      {DAYS.map((hari) => {
        const row = map.get(hari) || {};
        const orderOn = Boolean(row.bisa_order);
        const kirimOn = Boolean(row.bisa_kirim);
        return (
          <div key={hari} className="flex w-4 flex-col items-center gap-0.5">
            <span
              className={`h-0.5 w-full rounded-[4px] ${
                orderOn ? 'bg-accent-yellow' : 'bg-text-muted/40'
              }`}
              title={orderOn ? 'Bisa order' : 'Tidak order'}
            />
            <span className="text-[9px] font-medium leading-none text-text-secondary">
              {DAY_SHORT[hari]}
            </span>
            <span
              className={`h-0.5 w-full rounded-[4px] ${
                kirimOn ? 'bg-accent-cyan' : 'bg-text-muted/40'
              }`}
              title={kirimOn ? 'Bisa kirim' : 'Tidak kirim'}
            />
          </div>
        );
      })}
    </div>
  );
}
