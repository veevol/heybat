import { useState } from 'react';
import { DAYS, DAY_SHORT } from '../lib/supplier';

function ToggleSwitch({ checked, onChange, label, activeClass }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-[4px] px-1 py-0.5"
    >
      <span className="text-[13px] text-text-primary">{label}</span>
      {/* Track ~70% of previous h-7/w-12 size */}
      <span
        className={`relative inline-flex h-5 w-[2.1rem] shrink-0 items-center rounded-full transition-colors ${
          checked ? activeClass : 'bg-bg-surface-hover'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[1.05rem]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function chipClass({ active, orderOn, kirimOn, expanded }) {
  if (!active) {
    return expanded
      ? 'border-border-subtle bg-bg-surface-hover text-text-secondary'
      : 'border-border-subtle bg-bg-base text-text-muted';
  }

  if (orderOn && kirimOn) {
    return 'border-accent-yellow bg-accent-yellow/10 text-text-primary ring-1 ring-accent-cyan/60';
  }
  if (orderOn) {
    return 'border-accent-yellow bg-accent-yellow/10 text-text-primary';
  }
  return 'border-accent-cyan bg-accent-cyan/10 text-text-primary';
}

export default function JadwalEditor({ value, onChange }) {
  const [expandedHari, setExpandedHari] = useState(null);

  function rowFor(hari) {
    return (
      value.find((item) => item.hari === hari) || {
        hari,
        bisa_order: false,
        bisa_kirim: false,
        jam_cutoff: '',
      }
    );
  }

  function updateDay(hari, patch) {
    onChange(
      value.map((row) => {
        if (row.hari !== hari) return row;
        const next = { ...row, ...patch };
        // Cutoff hanya untuk order — kosongkan saat order dimatikan
        if (!next.bisa_order) {
          next.jam_cutoff = '';
        }
        return next;
      })
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {DAYS.map((hari) => {
          const row = rowFor(hari);
          const orderOn = Boolean(row.bisa_order);
          const kirimOn = Boolean(row.bisa_kirim);
          const active = orderOn || kirimOn;
          const expanded = expandedHari === hari;

          return (
            <button
              key={hari}
              type="button"
              onClick={() => setExpandedHari(expanded ? null : hari)}
              className={`relative shrink-0 rounded-[4px] border px-2.5 py-1.5 text-[12px] font-medium leading-none transition ${chipClass(
                { active, orderOn, kirimOn, expanded }
              )} ${expanded ? 'ring-1 ring-text-secondary/40' : ''}`}
            >
              {DAY_SHORT[hari]}
              {active ? (
                <span className="mt-1 flex items-center justify-center gap-0.5">
                  {orderOn ? (
                    <span className="h-1 w-1 rounded-full bg-accent-yellow" />
                  ) : null}
                  {kirimOn ? (
                    <span className="h-1 w-1 rounded-full bg-accent-cyan" />
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {expandedHari ? (
        <div className="overflow-hidden rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2 transition-all">
          <p className="mb-1.5 text-[11px] font-medium text-text-secondary">
            {expandedHari}
          </p>
          <div className="space-y-1">
            <ToggleSwitch
              label="Order"
              checked={Boolean(rowFor(expandedHari).bisa_order)}
              onChange={(checked) => updateDay(expandedHari, { bisa_order: checked })}
              activeClass="bg-accent-yellow"
            />
            <ToggleSwitch
              label="Kirim"
              checked={Boolean(rowFor(expandedHari).bisa_kirim)}
              onChange={(checked) => updateDay(expandedHari, { bisa_kirim: checked })}
              activeClass="bg-accent-cyan"
            />
          </div>

          {rowFor(expandedHari).bisa_order ? (
            <label className="mt-2 block space-y-1">
              <span className="text-[11px] text-text-muted">Cutoff Order</span>
              <input
                type="text"
                value={rowFor(expandedHari).jam_cutoff || ''}
                onChange={(event) =>
                  updateDay(expandedHari, { jam_cutoff: event.target.value })
                }
                placeholder="10:00, 15:00"
                className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow"
              />
            </label>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-text-muted">Tap hari untuk atur order/kirim.</p>
      )}
    </div>
  );
}
