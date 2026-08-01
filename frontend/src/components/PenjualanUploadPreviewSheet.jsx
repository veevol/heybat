import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('id-ID').format(num);
}

function formatTanggal(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

/**
 * Preview session upload penjualan — CTA selaras UploadPreviewSheet pricelist.
 */
export default function PenjualanUploadPreviewSheet({
  preview,
  onConfirm,
  onRetry,
  submitting = false,
}) {
  if (!preview) return null;

  const warnings = preview.warnings || {};
  const warningList = warnings.list || [];
  const hasParseWarnings =
    (warnings.gagal_tanggal || 0) > 0 ||
    (warnings.gagal_angka || 0) > 0 ||
    (warnings.total || 0) > 0;
  const perluCek = preview.perlu_cek_sample || [];
  const jumlahBaru = preview.jumlah_baru ?? 0;
  const sample = preview.sample || [];

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
          Preview Hasil Upload
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
            File Salah, Ulangi
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || jumlahBaru < 1}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50 sm:w-auto"
          >
            {submitting ? <SubmitSpinner /> : 'Lanjutkan, Simpan Data'}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {hasParseWarnings ? (
          <div
            className="rounded-[4px] border border-state-warning/40 bg-state-warning/15 px-2.5 py-2 text-[12px] leading-snug text-state-warning"
            role="alert"
          >
            <p className="font-semibold">Ada peringatan pada hasil parse</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
              {(warnings.gagal_tanggal || 0) > 0 ? (
                <li>{warnings.gagal_tanggal} baris tanggal gagal diparse</li>
              ) : null}
              {(warnings.gagal_angka || 0) > 0 ? (
                <li>{warnings.gagal_angka} baris angka gagal diparse</li>
              ) : null}
              {warningList.slice(0, 5).map((w, i) => (
                <li key={`${w.baris}-${i}`}>
                  Baris {w.baris}: {w.pesan}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          <span>
            Total baris terdeteksi:{' '}
            <strong className="text-text-primary">
              {preview.total_baris ?? 0}
            </strong>
          </span>
          <span>
            Baris baru:{' '}
            <strong className="text-text-primary">{jumlahBaru}</strong>
          </span>
          <span>
            Duplikat (skip):{' '}
            <strong className="text-text-primary">
              {preview.jumlah_sudah_ada ?? 0}
            </strong>
          </span>
          {(preview.jumlah_perlu_cek || 0) > 0 ? (
            <span className="text-state-warning">
              Perlu cek: {preview.jumlah_perlu_cek}
            </span>
          ) : null}
          {preview.repaired ? (
            <span className="text-text-muted">
              Styles diperbaiki
              {preview.style_replacements
                ? ` (${preview.style_replacements})`
                : ''}
            </span>
          ) : null}
        </div>

        {(preview.jumlah_perlu_cek || 0) > 0 ? (
          <div
            className="rounded-[4px] border border-state-warning/40 bg-state-warning/10 px-2.5 py-2 text-[12px] leading-snug text-text-primary"
            role="status"
          >
            <p className="font-semibold text-state-warning">
              {preview.jumlah_perlu_cek} baris kategori “perlu cek”
            </p>
            <p className="mt-0.5 text-[11px] text-text-secondary">
              Hanya salah satu syarat mitra/titip terpenuhi. Bisa ditandai manual
              setelah simpan.
            </p>
            {perluCek.length > 0 ? (
              <ul className="mt-1.5 max-h-28 space-y-1 overflow-y-auto text-[11px] text-text-secondary">
                {perluCek.map((row) => (
                  <li key={`${row.no_faktur}-${row.kode_obat}-${row.baris}`}>
                    <span className="text-text-primary">
                      {row.nama_obat || row.kode_obat}
                    </span>
                    {' · '}
                    dokter: {row.nama_dokter || '—'} · {row.harga_jual_label || '—'}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-[4px] border border-border-subtle">
          <table className="w-full text-left text-[11px]">
            <thead className="bg-bg-base text-text-secondary">
              <tr>
                <th className="px-2 py-1.5 font-medium">Faktur</th>
                <th className="px-2 py-1.5 font-medium">Obat</th>
                <th className="px-2 py-1.5 font-medium">Tgl</th>
                <th className="px-2 py-1.5 font-medium">Harga</th>
                <th className="px-2 py-1.5 font-medium">Kat.</th>
              </tr>
            </thead>
            <tbody>
              {sample.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-2 py-4 text-center text-text-muted"
                  >
                    Tidak ada baris untuk ditampilkan
                  </td>
                </tr>
              ) : (
                sample.map((row, idx) => (
                  <tr
                    key={`${row.no_faktur}-${row.kode_obat}-${idx}`}
                    className="border-t border-border-subtle/60 align-top"
                  >
                    <td className="px-2 py-1.5 text-text-secondary">
                      {row.no_faktur || '—'}
                    </td>
                    <td className="px-2 py-1.5 text-text-primary">
                      <div className="font-medium leading-snug">
                        {row.nama_obat || row.kode_obat || '—'}
                      </div>
                      {row.kode_obat ? (
                        <div className="text-[10px] text-text-muted">
                          {row.kode_obat}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-text-secondary">
                      {formatTanggal(row.tanggal_transaksi)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-text-secondary">
                      {formatNumber(row.subtotal ?? row.harga)}
                    </td>
                    <td className="px-2 py-1.5">
                      <span
                        className={
                          row.kategori_pelanggan === 'perlu_cek'
                            ? 'text-state-warning'
                            : row.kategori_pelanggan === 'mitra' ||
                                row.kategori_pelanggan === 'titip'
                              ? 'text-accent-yellow'
                              : 'text-text-muted'
                        }
                      >
                        {row.kategori_pelanggan || '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {sample.length > 0 && jumlahBaru > sample.length ? (
          <p className="text-[10px] text-text-muted">
            Menampilkan {sample.length} sampel dari {jumlahBaru} baris baru.
          </p>
        ) : null}

        {jumlahBaru < 1 ? (
          <p className="text-[12px] text-text-secondary">
            Semua baris sudah ada di database — tidak ada yang disimpan.
          </p>
        ) : null}
      </div>
    </SheetModal>
  );
}
