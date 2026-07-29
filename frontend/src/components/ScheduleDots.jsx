import { DAY_SHORT, DAYS } from '../lib/supplier';

/**
 * 4-state schedule dots:
 * - both order+kirim → yellow/navy split gradient
 * - order only → solid yellow
 * - kirim only → solid navy
 * - neither → gray
 */
export default function ScheduleDots({ jadwal = [] }) {
  const map = new Map((jadwal || []).map((row) => [row.hari, row]));

  return (
    <div className="flex gap-2" aria-label="Jadwal order dan kirim">
      {DAYS.map((hari) => {
        const row = map.get(hari) || {};
        const orderOn = Boolean(row.bisa_order);
        const kirimOn = Boolean(row.bisa_kirim);
        let className =
          'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold';
        let title = `${hari}: tidak order, tidak kirim`;

        if (orderOn && kirimOn) {
          className +=
            ' text-white [background:linear-gradient(135deg,#FFD500_50%,#12266E_50%)] [text-shadow:0_0_2px_rgba(0,0,0,0.5)]';
          title = `${hari}: bisa order & kirim`;
        } else if (orderOn) {
          className += ' bg-accent-yellow text-bg-base';
          title = `${hari}: hanya order`;
        } else if (kirimOn) {
          className += ' bg-accent-navy text-white';
          title = `${hari}: hanya kirim`;
        } else {
          className += ' bg-border-subtle text-text-secondary';
        }

        const letter = (DAY_SHORT[hari] || hari).charAt(0);
        return (
          <div key={hari} className={className} title={title}>
            {letter}
          </div>
        );
      })}
    </div>
  );
}
