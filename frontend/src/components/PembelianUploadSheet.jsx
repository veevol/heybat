import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import {
  confirmPembelianUpload,
  parsePembelianPreview,
} from '../api/pembelian';
import PembelianUploadPreviewSheet from './PembelianUploadPreviewSheet';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

/**
 * Bottom sheet upload pembelian — two-stage: parse-preview → confirm.
 * Format Vmedis LapDetailDataPembelianObat (blok per-faktur).
 */
export default function PembelianUploadSheet({
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
      const result = await parsePembelianPreview(file);
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
      const summary = await confirmPembelianUpload(preview.session_id);
      toast(
        `Faktur ${summary.faktur_tersimpan}, item ${summary.item_tersimpan}` +
          (summary.faktur_dilewati
            ? `, dilewati ${summary.faktur_dilewati}`
            : '')
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
              Upload Pembelian
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
              Excel Vmedis LapDetailDataPembelianObat (.xlsx). Styles rusak
              diperbaiki otomatis. Faktur yang sudah ada di-skip.
            </p>

            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-text-secondary">
                File Excel
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.files?.[0] || null;
                  setFile(next);
                  setError('');
                }}
                className="block w-full text-[12px] text-text-secondary file:mr-3 file:rounded-[4px] file:border-0 file:bg-bg-base file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-text-primary"
              />
            </label>

            {file ? (
              <div className="flex items-start gap-2 rounded-[4px] border border-border-subtle bg-bg-base px-2.5 py-2">
                <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-accent-yellow" />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-text-primary">
                    {file.name}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="text-[12px] text-state-error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </SheetModal>
      ) : null}

      {previewOpen && preview ? (
        <PembelianUploadPreviewSheet
          preview={preview}
          onConfirm={handleConfirm}
          onRetry={handleRetry}
          submitting={busy}
        />
      ) : null}
    </>
  );
}
