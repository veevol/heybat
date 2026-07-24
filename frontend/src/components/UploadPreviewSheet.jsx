import { useEffect, useMemo, useState } from 'react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('id-ID').format(num);
}

function scaleValue(value, enabled) {
  if (!enabled) return value;
  if (value === null || value === undefined || value === '') return value;
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return num * 1000;
}

export default function UploadPreviewSheet({
  sample = [],
  warnings = null,
  barisValid = 0,
  scaleBy1000 = false,
  onScaleBy1000Change,
  onConfirm,
  onRetry,
  submitting = false,
}) {
  const [localScale, setLocalScale] = useState(Boolean(scaleBy1000));
  const hasWarning = Boolean(warnings?.ada_peringatan);

  useEffect(() => {
    setLocalScale(Boolean(scaleBy1000));
  }, [scaleBy1000]);

  const displaySample = useMemo(
    () =>
      sample.map((row) => ({
        ...row,
        qty: scaleValue(row.qty, localScale),
        harga_dasar: scaleValue(row.harga_dasar, localScale),
      })),
    [sample, localScale]
  );

  function handleToggle(event) {
    const next = event.target.checked;
    setLocalScale(next);
    onScaleBy1000Change?.(next);
  }

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
              {warnings.baris_digabung > 0 ? (
                <li>
                  {warnings.baris_digabung} baris lanjutan digabung ke nama obat di atasnya
                  (cek badge “Nama digabung” — salah gabung? ulangi mapping)
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
          {warnings?.baris_digabung > 0 ? (
            <span className="text-accent-yellow">
              Digabung: {warnings.baris_digabung}
            </span>
          ) : null}
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
              {displaySample.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-2 py-4 text-center text-text-muted"
                  >
                    Tidak ada baris valid untuk ditampilkan
                  </td>
                </tr>
              ) : (
                displaySample.map((row) => {
                  const merged = Boolean(row.__flags?.nama_digabung);
                  return (
                    <tr
                      key={`${row.__row}-${row.nama_barang}`}
                      className={`border-t align-top ${
                        merged
                          ? 'border-accent-yellow/40 bg-accent-yellow/10'
                          : 'border-border-subtle/60'
                      }`}
                    >
                      <td className="px-2 py-1.5 text-text-primary">
                        <div className="font-medium leading-snug">{row.nama_barang}</div>
                        {merged ? (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <span className="rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-bg-base">
                              Nama digabung
                              {row.__flags?.baris_lanjutan_count
                                ? ` ×${row.__flags.baris_lanjutan_count}`
                                : ''}
                            </span>
                            {row.__lanjutan_rows?.length ? (
                              <span className="text-[10px] text-text-muted">
                                +baris {row.__lanjutan_rows.join(', ')}
                              </span>
                            ) : null}
                          </div>
                        ) : null}
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
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {formatNumber(row.qty)}
                        {row.qty_estimasi || row.__flags?.qty_estimasi ? (
                          <span className="rounded-[4px] bg-state-warning/20 px-1 py-0.5 text-[10px] font-semibold leading-none text-state-warning">
                            Estimasi
                          </span>
                        ) : null}
                      </span>
                    </td>
                      <td className="px-2 py-1.5 text-text-secondary">
                        {formatNumber(row.harga_dasar)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {displaySample.length > 0 && barisValid > displaySample.length ? (
          <p className="text-[10px] text-text-muted">
            Menampilkan {displaySample.length} dari {barisValid} baris valid.
          </p>
        ) : null}

        <label className="flex cursor-pointer items-start gap-2 rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2">
          <input
            type="checkbox"
            checked={localScale}
            onChange={handleToggle}
            disabled={submitting}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent-yellow"
          />
          <span className="text-[12px] leading-snug text-text-secondary">
            Kalikan nilai Harga &amp; Qty dengan 1000?{' '}
            <span className="text-text-muted">
              (aktifkan kalau file ini hasil konversi PDF dan angkanya kelihatan terlalu
              kecil, misal harga muncul sebagai 13,8 padahal aslinya 13.800)
            </span>
          </span>
        </label>

        {localScale ? (
          <p className="text-[11px] leading-snug text-state-warning">
            Skala ×1000 aktif — angka di tabel di atas sudah dikalikan; semua baris valid
            akan disimpan dengan nilai yang sama.
          </p>
        ) : null}
      </div>
    </SheetModal>
  );
}
