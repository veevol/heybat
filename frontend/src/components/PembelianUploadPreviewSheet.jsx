import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('id-ID').format(num);
}

function formatTanggal(value) {
  if (!value) return '—';
  // DATE-only (YYYY-MM-DD) atau ISO
  const raw = String(value);
  const d = raw.length <= 10 ? new Date(`${raw}T00:00:00+07:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

function BayarBadge({ jenis }) {
  const raw = String(jenis || '').toUpperCase();
  if (raw === 'TUNAI') {
    return (
      <span className="inline-flex rounded-[4px] bg-state-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-success">
        TUNAI
      </span>
    );
  }
  if (raw === 'HUTANG') {
    return (
      <span className="inline-flex rounded-[4px] bg-state-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning">
        HUTANG
      </span>
    );
  }
  if (!raw) return <span className="text-text-muted">—</span>;
  return (
    <span className="inline-flex rounded-[4px] bg-bg-base px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">
      {raw}
    </span>
  );
}

/**
 * Preview session upload pembelian — ringkasan faktur baru/dilewati.
 */
export default function PembelianUploadPreviewSheet({
  preview,
  onConfirm,
  onRetry,
  submitting = false,
}) {
  if (!preview) return null;

  const warnings = preview.warnings || {};
  const warningList = warnings.list || [];
  const jumlahBaru = preview.jumlah_faktur_baru ?? 0;
  const jumlahDilewati = preview.jumlah_faktur_dilewati ?? 0;
  const fakturBaru = preview.faktur_baru_preview || [];
  const fakturDilewati = preview.faktur_dilewati || [];
  const hasWarnings =
    (warnings.total_mismatch || 0) > 0 ||
    (warnings.item_tanpa_kode || 0) > 0 ||
    (warnings.total || 0) > 0;

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
            {submitting ? <SubmitSpinner /> : 'Simpan'}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {hasWarnings ? (
          <div
            className="rounded-[4px] border border-state-warning/40 bg-state-warning/15 px-2.5 py-2 text-[12px] leading-snug text-state-warning"
            role="alert"
          >
            <p className="font-semibold">Ada peringatan pada hasil parse</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px]">
              {(warnings.total_mismatch || 0) > 0 ? (
                <li>
                  {warnings.total_mismatch} item total beda tipis (tetap
                  disimpan)
                </li>
              ) : null}
              {(warnings.item_tanpa_kode || 0) > 0 ? (
                <li>{warnings.item_tanpa_kode} baris tanpa kode obat di-skip</li>
              ) : null}
              {warningList.slice(0, 5).map((w, i) => (
                <li key={`${w.baris}-${i}`}>
                  Baris {w.baris}: {w.pesan}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">
              Faktur baru
            </p>
            <p className="text-[16px] font-bold leading-tight text-text-primary">
              {jumlahBaru}
            </p>
          </div>
          <div className="rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">
              Dilewati
            </p>
            <p className="text-[16px] font-bold leading-tight text-text-primary">
              {jumlahDilewati}
            </p>
          </div>
          <div className="rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-text-muted">
              Item baru
            </p>
            <p className="text-[16px] font-bold leading-tight text-text-primary">
              {preview.jumlah_item_baru ?? 0}
            </p>
          </div>
        </div>

        {preview.repaired ? (
          <p className="text-[11px] text-text-muted">
            Styles Excel diperbaiki
            {preview.style_replacements
              ? ` (${preview.style_replacements})`
              : ''}
          </p>
        ) : null}

        <div>
          <h3 className="mb-1 text-[12px] font-semibold text-text-primary">
            Akan disimpan
          </h3>
          <div className="overflow-hidden rounded-[4px] border border-border-subtle">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-bg-base text-text-secondary">
                <tr>
                  <th className="px-2 py-1.5 font-medium">No Faktur</th>
                  <th className="px-2 py-1.5 font-medium">Supplier</th>
                  <th className="px-2 py-1.5 font-medium">Tgl</th>
                  <th className="px-2 py-1.5 font-medium">Bayar</th>
                  <th className="px-2 py-1.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {fakturBaru.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-2 py-4 text-center text-text-muted"
                    >
                      Tidak ada faktur baru
                    </td>
                  </tr>
                ) : (
                  fakturBaru.map((row) => (
                    <tr
                      key={`${row.no_faktur}-${row.nama_supplier}`}
                      className="border-t border-border-subtle/60 align-top"
                    >
                      <td className="px-2 py-1.5 font-medium text-text-primary">
                        {row.no_faktur}
                        <div className="text-[10px] font-normal text-text-muted">
                          {row.jumlah_item ?? 0} item
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-text-secondary">
                        {row.nama_supplier}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-text-secondary">
                        {formatTanggal(row.tanggal_faktur)}
                      </td>
                      <td className="px-2 py-1.5">
                        <BayarBadge jenis={row.jenis_bayar} />
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold text-text-primary">
                        {formatNumber(row.total_transaksi)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {fakturDilewati.length > 0 ? (
          <div>
            <h3 className="mb-1 text-[12px] font-semibold text-text-secondary">
              Dilewati (sudah ada)
            </h3>
            <ul className="max-h-28 space-y-1 overflow-y-auto rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2 text-[11px] text-text-secondary">
              {fakturDilewati.map((row) => (
                <li key={`skip-${row.no_faktur}-${row.nama_supplier}`}>
                  <span className="text-text-primary">{row.no_faktur}</span>
                  {' · '}
                  {row.nama_supplier}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SheetModal>
  );
}
