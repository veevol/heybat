import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import {
  confirmPenjualanUpload,
  parsePenjualanPreview,
} from '../api/penjualan';
import PenjualanUploadPreviewSheet from './PenjualanUploadPreviewSheet';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

/**
 * Bottom sheet upload penjualan — skema sama pricelist:
 * form (pilih file → Upload) → preview session → confirm.
 * Format Vmedis fixed (tanpa mapping kolom).
 */
export default function PenjualanUploadSheet({
  open,
  onClose,
  onSuccess = null,
  onToast = null,
}) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const fileInputRef = useRef(null);
  const formVisible = open && !previewOpen;

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setError('');
    setBusy(false);
    setPreview(null);
    setPreviewOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open]);

  function toast(msg) {
    onToast?.(msg);
  }

  function resetPipeline() {
    setPreview(null);
    setPreviewOpen(false);
    setError('');
  }

  function handleClose() {
    if (busy) return;
    resetPipeline();
    setFile(null);
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
      const result = await parsePenjualanPreview(file);
      setPreview(result);
      setPreviewOpen(true);
    } catch (err) {
      const msg = err.message || 'Gagal parse Excel';
      setError(msg);
      toast(msg);
      setPreview(null);
      setPreviewOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function handleRetry() {
    if (busy) return;
    setPreviewOpen(false);
    setPreview(null);
    setError('');
  }

  async function handleConfirm() {
    if (!preview?.session_id || busy) return;
    setBusy(true);
    setError('');
    try {
      const summary = await confirmPenjualanUpload(preview.session_id);
      toast(
        `Masuk ${summary.masuk}, di-skip ${summary.di_skip}` +
          (summary.perlu_cek ? `, perlu cek ${summary.perlu_cek}` : '')
      );
      resetPipeline();
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSuccess?.(summary);
      onClose?.();
    } catch (err) {
      const msg = err.message || 'Gagal menyimpan';
      setError(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  }

  if (!open && !previewOpen) return null;

  return (
    <>
      {formVisible ? (
        <SheetModal
          title={
            <h2 className="text-[15px] font-semibold leading-none text-text-primary">
              Upload Penjualan
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
              Excel Vmedis (.xlsx). File yang styles-nya rusak diperbaiki otomatis
              saat parse.
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
                <span className="text-[11px] text-text-muted">
                  Excel (.xlsx, .xls)
                </span>
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
      ) : null}

      {previewOpen && preview ? (
        <PenjualanUploadPreviewSheet
          preview={preview}
          onConfirm={handleConfirm}
          onRetry={handleRetry}
          submitting={busy}
        />
      ) : null}
    </>
  );
}
