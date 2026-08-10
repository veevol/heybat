import { useEffect, useState } from 'react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Bottom sheet tambah/edit pembayaran hutang.
 */
export default function PembayaranFormSheet({
  open,
  mode = 'tambah', // tambah | edit
  initial = null,
  fakturLabel = '',
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [tanggalBayar, setTanggalBayar] = useState(todayIsoDate());
  const [nominal, setNominal] = useState('');
  const [metodeBayar, setMetodeBayar] = useState('');
  const [catatan, setCatatan] = useState('');
  const [lunasManual, setLunasManual] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (mode === 'edit' && initial) {
      setTanggalBayar(
        String(initial.tanggal_bayar || '').slice(0, 10) || todayIsoDate()
      );
      setNominal(
        initial.nominal === null || initial.nominal === undefined
          ? ''
          : String(initial.nominal)
      );
      setMetodeBayar(initial.metode_bayar || '');
      setCatatan(initial.catatan || '');
      setLunasManual(Boolean(initial.ditandai_lunas_manual));
    } else {
      setTanggalBayar(todayIsoDate());
      setNominal('');
      setMetodeBayar('');
      setCatatan('');
      setLunasManual(false);
    }
  }, [open, mode, initial]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const tanggal = String(tanggalBayar || '').trim();
    const nom = Number(String(nominal).replace(/,/g, '.'));
    if (!tanggal) {
      setError('Tanggal bayar wajib diisi');
      return;
    }
    if (!Number.isFinite(nom) || nom < 0) {
      setError('Nominal tidak valid');
      return;
    }
    setError('');
    await onSubmit?.({
      tanggal_bayar: tanggal,
      nominal: nom,
      metode_bayar: metodeBayar.trim() || null,
      catatan: catatan.trim() || null,
      ditandai_lunas_manual: lunasManual,
    });
  }

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
          {mode === 'edit' ? 'Edit Pembayaran' : 'Tambah Pembayaran'}
        </h2>
      }
      onClose={onClose}
      busy={submitting}
      footer={
        <div className="flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary disabled:opacity-50 sm:w-auto"
          >
            Batal
          </button>
          <button
            type="submit"
            form="pembayaran-form"
            disabled={submitting}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50 sm:w-auto"
          >
            {submitting ? <SubmitSpinner /> : 'Simpan'}
          </button>
        </div>
      }
    >
      <form id="pembayaran-form" onSubmit={handleSubmit} className="space-y-3">
        {fakturLabel ? (
          <p className="text-[12px] text-text-secondary">{fakturLabel}</p>
        ) : null}

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-text-secondary">
            Tanggal bayar
          </span>
          <input
            type="date"
            value={tanggalBayar}
            onChange={(e) => setTanggalBayar(e.target.value)}
            disabled={submitting}
            className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-text-secondary">
            Nominal
          </span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={nominal}
            onChange={(e) => setNominal(e.target.value)}
            disabled={submitting}
            placeholder="0"
            className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
            required
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-text-secondary">
            Metode bayar <span className="text-text-muted">(opsional)</span>
          </span>
          <input
            type="text"
            value={metodeBayar}
            onChange={(e) => setMetodeBayar(e.target.value)}
            disabled={submitting}
            placeholder="Transfer / Tunai / ..."
            className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-text-secondary">
            Catatan <span className="text-text-muted">(opsional)</span>
          </span>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            disabled={submitting}
            rows={2}
            placeholder="Catatan singkat..."
            className="w-full resize-none rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
          />
        </label>

        <label className="flex items-start gap-2 rounded-[4px] border border-border-subtle bg-bg-base px-3 py-2.5">
          <input
            type="checkbox"
            checked={lunasManual}
            onChange={(e) => setLunasManual(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 h-4 w-4 rounded border-border-subtle accent-accent-yellow"
          />
          <span className="text-[12px] leading-snug text-text-primary">
            <span className="font-medium">Tandai Lunas Manual</span>
            <span className="mt-0.5 block text-text-muted">
              Faktur dianggap lunas meski sisa hutang belum nol.
            </span>
          </span>
        </label>

        {error ? (
          <p className="text-[12px] text-state-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </SheetModal>
  );
}
