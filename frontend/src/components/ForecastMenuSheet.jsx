import { useRef } from 'react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

const KATEGORI_OPTIONS = [
  { value: 'retail', label: 'Retail' },
  { value: 'mitra', label: 'Mitra' },
];

function formatTanggal(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

const MONTH_MMM = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

/** YYYY-MM-DD → "01 Apr 2026" */
function formatYmdShort(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '—';
  const [y, m, d] = ymd.split('-').map(Number);
  const dd = String(d).padStart(2, '0');
  return `${dd} ${MONTH_MMM[m - 1]} ${y}`;
}

function FormRow({ label, children }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-1.5">
      <span className="text-[13px] leading-snug text-text-muted">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Tampil dd mmm yyyy; tap buka native date picker via showPicker(). */
function DateField({ value, onChange, disabled }) {
  const inputRef = useRef(null);

  function openPicker() {
    const el = inputRef.current;
    if (!el || disabled) return;
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
        return;
      }
    } catch {
      /* fallback di bawah */
    }
    el.focus();
    el.click();
  }

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className="flex w-full items-center rounded-[4px] border border-border-subtle bg-bg-surface px-2 py-1.5 text-left text-[12px] tabular-nums text-text-primary hover:bg-bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{formatYmdShort(value)}</span>
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
      />
    </div>
  );
}

/**
 * Sheet Hitung Forecasting — Riwayat + form Forecast Baru (gaya Filter sheet).
 * Dibuka dari pilihan "Hitung Forecasting" di menu pendek titik tiga.
 */
export default function ForecastMenuSheet({
  open,
  onClose,
  riwayat = [],
  riwayatLoading = false,
  activeRunId = null,
  onSelectRun,
  canHitung = false,
  historiDari,
  onHistoriDariChange,
  historiSampai,
  onHistoriSampaiChange,
  periodeForecast,
  onPeriodeForecastChange,
  kategori = [],
  onToggleKategori,
  onHitung,
  running = false,
}) {
  if (!open) return null;

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
          Hitung Forecasting
        </h2>
      }
      onClose={() => {
        if (!running) onClose();
      }}
      busy={running}
      borderless
    >
      <div className="space-y-3">
        <section>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Riwayat
          </p>
          <div className="overflow-hidden rounded-[4px] bg-bg-base">
            {riwayatLoading ? (
              <div className="flex justify-center py-6">
                <SubmitSpinner className="h-5 w-5" />
              </div>
            ) : riwayat.length === 0 ? (
              <p className="px-2.5 py-4 text-center text-[12px] text-text-muted">
                Belum ada riwayat forecast.
              </p>
            ) : (
              <ul className="max-h-52 overflow-y-auto scrollbar-hide">
                {riwayat.map((run) => {
                  const active = activeRunId === run.id;
                  const kats = Array.isArray(run.kategori_penjualan)
                    ? run.kategori_penjualan
                    : [];
                  const historiLabel =
                    run.histori_dari && run.histori_sampai
                      ? `${formatYmdShort(run.histori_dari)}–${formatYmdShort(run.histori_sampai)}`
                      : `${run.periode_histori_hari}h`;
                  return (
                    <li key={run.id}>
                      <button
                        type="button"
                        onClick={() => onSelectRun?.(run.id)}
                        disabled={running}
                        className={`flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left hover:bg-bg-surface-hover disabled:opacity-50 ${
                          active ? 'bg-accent-yellow/10' : ''
                        }`}
                      >
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                          <span className="truncate text-[13px] font-medium text-text-primary">
                            {formatTanggal(run.dijalankan_saat)}
                          </span>
                          {kats.map((k) => {
                            const label =
                              KATEGORI_OPTIONS.find((o) => o.value === k)
                                ?.label || k;
                            return (
                              <span
                                key={k}
                                className="rounded-[4px] bg-bg-surface px-1.5 py-0.5 text-[10px] font-semibold leading-none text-text-secondary"
                              >
                                {label}
                              </span>
                            );
                          })}
                        </div>
                        <span className="shrink-0 text-right text-[10px] leading-tight text-text-muted">
                          Proyeksi {run.periode_forecast_hari}h
                          <br />
                          {historiLabel}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {canHitung ? (
          <section>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Forecast Baru
            </p>
            <form
              onSubmit={onHitung}
              className="space-y-2.5 rounded-[4px] bg-bg-base px-2.5 py-2.5"
            >
              <FormRow label="Periode History">
                <div className="flex items-center gap-1">
                  <DateField
                    value={historiDari}
                    onChange={onHistoriDariChange}
                    disabled={running}
                  />
                  <span className="shrink-0 text-[12px] text-text-muted">
                    sd
                  </span>
                  <DateField
                    value={historiSampai}
                    onChange={onHistoriSampaiChange}
                    disabled={running}
                  />
                </div>
              </FormRow>
              <FormRow label="Periode Proyeksi">
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={periodeForecast}
                    onChange={(e) => onPeriodeForecastChange?.(e.target.value)}
                    disabled={running}
                    className="w-16 shrink-0 rounded-[4px] border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-center text-[13px] text-text-primary outline-none focus:border-accent-yellow disabled:opacity-60"
                  />
                  <span className="text-[13px] text-text-muted">
                    hari kedepan
                  </span>
                </div>
              </FormRow>
              <div className="flex gap-1.5">
                {KATEGORI_OPTIONS.map((opt) => {
                  const active = kategori.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => onToggleKategori?.(opt.value)}
                      disabled={running}
                      className={`flex-1 rounded-[4px] px-2.5 py-1.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                        active
                          ? 'bg-accent-yellow text-bg-base'
                          : 'border border-border-subtle bg-bg-surface text-text-secondary hover:bg-bg-surface-hover'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                <button
                  type="submit"
                  disabled={running}
                  className="inline-flex flex-[2] items-center justify-center rounded-[4px] bg-accent-navy px-3 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-70"
                >
                  {running ? (
                    <span className="inline-flex items-center gap-2">
                      <SubmitSpinner /> Menghitung…
                    </span>
                  ) : (
                    'Hitung'
                  )}
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </SheetModal>
  );
}
