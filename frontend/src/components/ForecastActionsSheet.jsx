import { Calculator, FileText } from 'lucide-react';
import SheetModal from './SheetModal';

/**
 * Menu pendek titik tiga Forecasting — 2 pilihan sebelum sheet Hitung / navigasi SP.
 */
export default function ForecastActionsSheet({
  open,
  onClose,
  onHitungForecasting,
  onPembuatanSp,
  canPembuatanSp = false,
}) {
  if (!open) return null;

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
          Menu Forecasting
        </h2>
      }
      onClose={onClose}
      borderless
    >
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={onHitungForecasting}
          className="flex w-full items-center gap-2.5 rounded-[4px] bg-bg-base px-2.5 py-2.5 text-left transition hover:bg-bg-surface-hover"
        >
          <Calculator
            className="h-4 w-4 shrink-0 text-accent-yellow"
            strokeWidth={2}
          />
          <span className="text-[13px] font-medium text-text-primary">
            Hitung Forecasting
          </span>
        </button>
        <button
          type="button"
          onClick={onPembuatanSp}
          disabled={!canPembuatanSp}
          className="flex w-full items-center gap-2.5 rounded-[4px] bg-bg-base px-2.5 py-2.5 text-left transition hover:bg-bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileText
            className="h-4 w-4 shrink-0 text-accent-yellow"
            strokeWidth={2}
          />
          <span className="text-[13px] font-medium text-text-primary">
            Pembuatan SP
          </span>
        </button>
      </div>
    </SheetModal>
  );
}
