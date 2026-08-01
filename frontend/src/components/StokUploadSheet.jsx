import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { parseStokPreview } from '../api/stok';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

/**
 * Bottom sheet upload stok — skema sama penjualan/pricelist:
 * form (pilih file → Upload) → parse → onParsed(preview) untuk sheet preview di page.
 */
export default function StokUploadSheet({
  open,
  onClose,
  onParsed = null,
  onToast = null,
}) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setError('');
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open]);

  function handleClose() {
    if (busy) return;
    setFile(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose?.();
  }

  async function handleUpload() {
    if (!file || busy) return;
    const name = String(file.name || '').toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      setError('Hanya file Excel (.xlsx / .xls) yang diterima');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const result = await parseStokPreview(file);
      onParsed?.(result);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onClose?.();
    } catch (err) {
      const msg = err.message || 'Gagal parse Excel';
      setError(msg);
      onToast?.(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
          Upload Stok
        </h2>
      }
      onClose={handleClose}
      busy={busy}
      borderless
      footer={
        <button
          type="button"
          disabled={busy || !file}
          onClick={handleUpload}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? (
            <SubmitSpinner className="h-4 w-4" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          Upload
        </button>
      }
    >
      <div className="space-y-3">
        <p className="text-[12px] leading-snug text-text-secondary">
          Excel Vmedis (.xlsx). Snapshot menumpuk (tidak mengganti upload
          sebelumnya). Styles rusak diperbaiki otomatis.
        </p>

        <div className="space-y-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            File
          </span>
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-border-subtle bg-bg-base px-3 py-5 text-center transition hover:border-accent-yellow/50 hover:bg-bg-surface-hover ${
              busy ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            <FileSpreadsheet className="h-6 w-6 text-accent-yellow" />
            <span className="text-[13px] font-medium text-text-primary">
              {file ? file.name : 'Pilih file dari perangkat'}
            </span>
            <span className="text-[11px] text-text-muted">Excel (.xlsx, .xls)</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const picked = e.target.files?.[0] || null;
                setFile(picked);
                setError('');
              }}
            />
          </label>
        </div>

        {error ? (
          <p className="rounded-[4px] bg-state-error/10 px-2.5 py-2 text-[12px] text-state-error">
            {error}
          </p>
        ) : null}
      </div>
    </SheetModal>
  );
}
