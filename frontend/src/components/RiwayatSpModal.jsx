import { Download } from 'lucide-react';
import { formatTanggalDibuat } from '../lib/obatYelo';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

const KATEGORI_LABEL = {
  retail: 'Retail',
  mitra: 'Mitra',
  gabung: 'Gabung',
};

function kategoriLabel(kategori) {
  return KATEGORI_LABEL[kategori] || kategori;
}

/** Modal riwayat semua versi dokumen_sp untuk 1 PBF (append-only, versi terbaru dulu). */
export default function RiwayatSpModal({
  open,
  onClose,
  supplierNama,
  loading = false,
  error = null,
  dokumen = [],
}) {
  if (!open) return null;

  return (
    <SheetModal
      title={
        <h2 className="min-w-0 truncate text-[15px] font-semibold leading-none text-text-primary">
          Riwayat SP — {supplierNama || 'PBF'}
        </h2>
      }
      onClose={onClose}
    >
      {loading ? (
        <div className="flex justify-center py-6">
          <SubmitSpinner className="h-5 w-5" />
        </div>
      ) : error ? (
        <p className="rounded-[4px] bg-state-error/10 px-3 py-2 text-[13px] text-state-error">
          {error}
        </p>
      ) : dokumen.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-text-muted">
          Belum ada dokumen SP untuk PBF ini.
        </p>
      ) : (
        <div className="space-y-2">
          {dokumen.map((d) => (
            <div
              key={d.id}
              className="rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold leading-snug text-text-primary">
                    Versi {d.versi}{d.versi > 0 ? ' (Revisi)' : ' (Asli)'} — {d.golongan}
                    {d.kategori && d.kategori !== 'gabung'
                      ? ` · ${kategoriLabel(d.kategori)}`
                      : ''}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-secondary">{d.nomor_sp}</p>
                </div>
                <span
                  className={`shrink-0 rounded-[4px] px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                    d.status === 'dikirim'
                      ? 'bg-state-success/20 text-state-success'
                      : 'bg-accent-yellow/20 text-accent-yellow'
                  }`}
                >
                  {d.status === 'dikirim' ? 'Dikirim' : 'Terbit'}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-text-muted">
                Terbit {formatTanggalDibuat(d.tanggal_terbit)}
                {d.tanggal_kirim
                  ? ` · Dikirim ${formatTanggalDibuat(d.tanggal_kirim)}`
                  : ''}
              </p>
              {d.file_path ? (
                <a
                  href={d.file_path}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent-yellow hover:underline"
                >
                  <Download className="h-3 w-3" strokeWidth={2.5} />
                  Unduh PDF
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </SheetModal>
  );
}
