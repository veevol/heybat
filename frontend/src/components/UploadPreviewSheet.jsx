import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('id-ID').format(num);
}

export default function UploadPreviewSheet({
  sample = [],
  warnings = null,
  barisValid = 0,
  onConfirm,
  onRetry,
  submitting = false,
}) {
  const hasWarning = Boolean(warnings?.ada_peringatan);

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
          Preview Hasil Mapping
        </h2>
      }
      onClose={onRetry}
      busy={submitting}
      footer={
        <div className="flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onRetry}
            disabled={submitting}
            className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary disabled:opacity-50 sm:w-auto"
          >
            Mapping Salah, Ulangi
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || barisValid < 1}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50 sm:w-auto"
          >
            {submitting ? <SubmitSpinner /> : 'Lanjutkan, Simpan Data'}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {hasWarning ? (
          <div
            className="rounded-[4px] border border-state-warning/40 bg-state-warning/15 px-2.5 py-2 text-[12px] leading-snug text-state-warning"
            role="alert"
          >
            <p className="font-semibold">Ada peringatan pada hasil mapping</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
              {warnings.nama_kosong > 0 ? (
                <li>{warnings.nama_kosong} baris Nama Barang kosong (dilewati)</li>
              ) : null}
              {warnings.harga_invalid > 0 ? (
                <li>{warnings.harga_invalid} baris Harga gagal dibaca sebagai angka</li>
              ) : null}
              {warnings.qty_kosong_atau_invalid > 0 ? (
                <li>
                  {warnings.qty_kosong_atau_invalid} baris Qty kosong / gagal dibaca sebagai
                  angka
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          <span>
            Total baris terdeteksi:{' '}
            <strong className="text-text-primary">
              {warnings?.total_baris_terdeteksi ?? 0}
            </strong>
          </span>
          <span>
            Baris valid:{' '}
            <strong className="text-text-primary">{barisValid}</strong>
          </span>
        </div>

        <div className="overflow-hidden rounded-[4px] border border-border-subtle">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-bg-base text-text-secondary">
              <tr>
                <th className="px-2 py-1.5 font-medium">Nama</th>
                <th className="px-2 py-1.5 font-medium">Satuan</th>
                <th className="px-2 py-1.5 font-medium">Qty</th>
                <th className="px-2 py-1.5 font-medium">Harga</th>
              </tr>
            </thead>
            <tbody>
              {sample.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-2 py-4 text-center text-text-muted"
                  >
                    Tidak ada baris valid untuk ditampilkan
                  </td>
                </tr>
              ) : (
                sample.map((row) => (
                  <tr
                    key={`${row.__row}-${row.nama_barang}`}
                    className="border-t border-border-subtle/60 align-top"
                  >
                    <td className="px-2 py-1.5 text-text-primary">
                      <div className="font-medium leading-snug">{row.nama_barang}</div>
                      {row.catatan_kondisi ? (
                        <div className="mt-0.5 line-clamp-1 text-[10px] text-text-muted">
                          {row.catatan_kondisi}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-1.5 text-text-secondary">
                      {row.satuan || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-text-secondary">
                      {formatNumber(row.qty)}
                    </td>
                    <td className="px-2 py-1.5 text-text-secondary">
                      {formatNumber(row.harga_dasar)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {sample.length > 0 && barisValid > sample.length ? (
          <p className="text-[10px] text-text-muted">
            Menampilkan {sample.length} dari {barisValid} baris valid.
          </p>
        ) : null}
      </div>
    </SheetModal>
  );
}
