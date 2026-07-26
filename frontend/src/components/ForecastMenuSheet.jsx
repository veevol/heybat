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

function FormRow({ label, children }) {
  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-1.5">
      <span className="text-[13px] leading-snug text-text-muted">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * Menu titik tiga Forecasting — Riwayat + Hitung (gaya Filter sheet).
 */
export default function ForecastMenuSheet({
  open,
  onClose,
  riwayat = [],
  riwayatLoading = false,
  activeRunId = null,
  onSelectRun,
  canHitung = false,
  periodeHistori,
  onPeriodeHistoriChange,
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
          Menu Forecasting
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
                        <span className="shrink-0 text-[11px] text-text-muted">
                          Periode {run.periode_forecast_hari}/
                          {run.periode_histori_hari}
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
              <FormRow label="Periode Histori (hari)">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={periodeHistori}
                  onChange={(e) => onPeriodeHistoriChange?.(e.target.value)}
                  disabled={running}
                  className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow disabled:opacity-60"
                />
              </FormRow>
              <FormRow label="Periode Proyeksi (hari)">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={periodeForecast}
                  onChange={(e) => onPeriodeForecastChange?.(e.target.value)}
                  disabled={running}
                  className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow disabled:opacity-60"
                />
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
