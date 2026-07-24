import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

function formatNumber(value) {
  return new Intl.NumberFormat('id-ID').format(Number(value) || 0);
}

function labelBulan(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return String(isoDate);
  return new Intl.DateTimeFormat('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

/**
 * Konfirmasi destruktif untuk Ringkas Data Lama (preview → konfirmasi).
 */
export default function StokRingkasConfirmModal({
  preview,
  submitting = false,
  onClose,
  onConfirm,
}) {
  if (!preview) return null;

  const kosong = (preview.baris_detail || 0) < 1 && (preview.pasangan_kode_bulan || 0) < 1;

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-state-error">
          Ringkas Data Lama
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
            className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary sm:w-auto"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || kosong}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-state-error px-3 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {submitting ? <SubmitSpinner /> : 'Konfirmasi Ringkas'}
          </button>
        </div>
      }
    >
      <div className="space-y-2 text-[13px] leading-snug text-text-secondary">
        <p>
          Proses ini memadatkan snapshot stok lebih dari 3 bulan ke ringkasan bulanan,
          lalu <span className="font-semibold text-state-error">menghapus detail aslinya</span>.
          Tidak bisa dibatalkan.
        </p>
        {kosong ? (
          <p className="rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2 text-[12px]">
            Tidak ada data lama yang perlu diringkas saat ini.
          </p>
        ) : (
          <ul className="list-inside list-disc space-y-1 text-[12px]">
            <li>
              <strong className="text-text-primary">
                {formatNumber(preview.pasangan_kode_bulan)}
              </strong>{' '}
              kombinasi kode×bulan akan diringkas
            </li>
            <li>
              <strong className="text-text-primary">{formatNumber(preview.kode_obat)}</strong>{' '}
              kode obat
            </li>
            <li>
              <strong className="text-text-primary">
                {formatNumber(preview.baris_detail)}
              </strong>{' '}
              baris detail akan dihapus
            </li>
            <li>
              Rentang:{' '}
              <strong className="text-text-primary">
                {labelBulan(preview.bulan_dari)} — {labelBulan(preview.bulan_sampai)}
              </strong>
            </li>
          </ul>
        )}
      </div>
    </SheetModal>
  );
}
