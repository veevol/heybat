import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, FileText, Upload } from 'lucide-react';
import {
  confirmPricelistUpload,
  getPricelistTemplate,
  parsePricelistPdfPreview,
  parsePricelistPreview,
  previewPricelistExcel,
  savePricelistPdfMapping,
  setPricelistSessionScale,
} from '../api/pricelist';
import MappingSheet from './MappingSheet';
import PdfMappingSheet from './PdfMappingSheet';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';
import UploadPreviewSheet from './UploadPreviewSheet';

const EMPTY_MAPPING = {
  nama_kolom_barang: '',
  nama_kolom_qty: null,
  nama_kolom_harga: null,
  nama_kolom_satuan: null,
  baris_mulai_data: 2,
};

function mappingFromTemplate(tpl) {
  return {
    nama_kolom_barang: tpl?.nama_kolom_barang || '',
    nama_kolom_qty: tpl?.nama_kolom_qty || null,
    nama_kolom_harga: tpl?.nama_kolom_harga || null,
    nama_kolom_satuan: tpl?.nama_kolom_satuan || null,
    baris_mulai_data: tpl?.baris_mulai_data || 2,
  };
}

const selectClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-base px-3 py-2 text-[13px] text-text-primary outline-none focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow';

/**
 * Bottom sheet upload pricelist (PBF → jenis file → pilih file → Upload).
 * Pipeline mapping/preview sama dengan halaman Pricelist PBF lama.
 */
export default function PricelistUploadSheet({
  open,
  onClose,
  suppliers = [],
  initialPbfId = '',
  onSuccess = null,
  onToast = null,
}) {
  const [pbfId, setPbfId] = useState(initialPbfId || '');
  const [uploadKind, setUploadKind] = useState('pdf');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState(EMPTY_MAPPING);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [pdfMappingOpen, setPdfMappingOpen] = useState(false);
  const [pdfMappingMeta, setPdfMappingMeta] = useState(null);
  const [pdfBarisMulai, setPdfBarisMulai] = useState(1);
  const [pdfFormatAngka, setPdfFormatAngka] = useState('id');
  const [parseResult, setParseResult] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scaleBy1000, setScaleBy1000] = useState(false);

  const fileInputRef = useRef(null);
  const formVisible = open && !mappingOpen && !pdfMappingOpen && !previewOpen;

  useEffect(() => {
    if (!open) return;
    setPbfId(initialPbfId || '');
    setUploadKind('pdf');
    setFile(null);
    setError('');
    setBusy(false);
    setPreview(null);
    setMapping(EMPTY_MAPPING);
    setMappingOpen(false);
    setPdfMappingOpen(false);
    setPdfMappingMeta(null);
    setParseResult(null);
    setPreviewOpen(false);
    setScaleBy1000(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [open, initialPbfId]);

  function toast(msg) {
    onToast?.(msg);
  }

  function resetPipeline() {
    setPreview(null);
    setMapping(EMPTY_MAPPING);
    setMappingOpen(false);
    setPdfMappingOpen(false);
    setPdfMappingMeta(null);
    setParseResult(null);
    setPreviewOpen(false);
    setScaleBy1000(false);
  }

  function handleClose() {
    if (busy) return;
    resetPipeline();
    onClose?.();
  }

  function openMappedPreview(result) {
    setParseResult(result);
    setScaleBy1000(false);
    setPdfMappingOpen(false);
    setMappingOpen(false);
    setPreviewOpen(true);
  }

  async function openHeaderPreview(picked, barisHint, preferredMapping) {
    const result = await previewPricelistExcel(picked, barisHint || 2);
    setPreview(result);
    setMapping({
      ...(preferredMapping || EMPTY_MAPPING),
      baris_mulai_data:
        preferredMapping?.baris_mulai_data ||
        result.suggested_baris_mulai_data ||
        2,
    });
    return result;
  }

  async function runParsePreview(uploadFile, mappingPayload) {
    setBusy(true);
    try {
      const result = await parsePricelistPreview({
        pbfId,
        file: uploadFile,
        mapping: mappingPayload,
      });
      if (result.mapping) {
        setMapping({
          nama_kolom_barang: result.mapping.nama_kolom_barang || '',
          nama_kolom_qty: result.mapping.nama_kolom_qty || null,
          nama_kolom_harga: result.mapping.nama_kolom_harga || null,
          nama_kolom_satuan: result.mapping.nama_kolom_satuan || null,
          baris_mulai_data: result.mapping.baris_mulai_data || 2,
        });
      }
      openMappedPreview(result);
    } catch (err) {
      setError(err.message || 'Gagal mem-preview hasil mapping');
      toast(err.message || 'Gagal mem-preview hasil mapping');
    } finally {
      setBusy(false);
    }
  }

  async function runPdfParse(uploadFile, { forceMapping = false } = {}) {
    setBusy(true);
    try {
      const result = await parsePricelistPdfPreview({
        pbfId,
        file: uploadFile,
        forceMapping,
      });

      if (result.needs_mapping) {
        setPdfMappingMeta(result);
        setPdfBarisMulai(result.baris_mulai_data || 1);
        setPdfFormatAngka(result.format_angka === 'intl' ? 'intl' : 'id');
        setPdfMappingOpen(true);
        setPreviewOpen(false);
        setParseResult(null);
      } else {
        openMappedPreview(result);
      }
    } catch (err) {
      setError(err.message || 'Gagal memproses PDF');
      toast(err.message || 'Gagal memproses PDF');
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    setError('');
    if (!pbfId) {
      setError('Pilih PBF dulu');
      return;
    }
    if (!file) {
      setError('Pilih file dulu');
      return;
    }

    setBusy(true);
    try {
      const tpl = await getPricelistTemplate(pbfId);

      if (uploadKind === 'pdf') {
        await runPdfParse(file);
        return;
      }

      const excelTpl = tpl && (tpl.tipe_sumber || 'excel') === 'excel' ? tpl : null;
      if (!excelTpl) {
        await openHeaderPreview(file, 2, EMPTY_MAPPING);
        setMappingOpen(true);
        setBusy(false);
      } else {
        setMapping(mappingFromTemplate(excelTpl));
        await runParsePreview(file, null);
      }
    } catch (err) {
      setError(err.message || 'Gagal memproses file');
      toast(err.message || 'Gagal memproses file');
      setBusy(false);
    }
  }

  async function confirmMapping() {
    if (!mapping.nama_kolom_barang) {
      setError('Kolom nama barang wajib dipilih');
      return;
    }
    if (!file) {
      setError('File Excel belum dipilih');
      return;
    }
    await runParsePreview(file, mapping);
  }

  async function confirmPdfMapping(kolomPosisi) {
    if (!pdfMappingMeta?.session_id) {
      setError('Sesi PDF tidak valid — upload ulang');
      return;
    }
    setBusy(true);
    try {
      const result = await savePricelistPdfMapping({
        pbfId,
        sessionId: pdfMappingMeta.session_id,
        kolomPosisi,
        barisMulaiData: pdfBarisMulai,
        formatAngka: pdfFormatAngka,
      });
      openMappedPreview(result);
      toast('Mapping PDF tersimpan — cek preview');
    } catch (err) {
      setError(err.message || 'Gagal menyimpan mapping PDF');
      toast(err.message || 'Gagal menyimpan mapping PDF');
    } finally {
      setBusy(false);
    }
  }

  async function handleScaleBy1000Change(next) {
    setScaleBy1000(next);
    if (!parseResult?.session_id) return;
    try {
      await setPricelistSessionScale(parseResult.session_id, next);
    } catch (err) {
      console.warn('[session-scale]', err.message || err);
    }
  }

  async function handleConfirmSave() {
    if (!parseResult?.session_id) {
      setError('Sesi preview tidak valid — upload ulang');
      return;
    }
    setBusy(true);
    try {
      const summary = await confirmPricelistUpload(parseResult.session_id, {
        scaleBy1000,
      });
      toast(
        `Upload selesai: ${summary.baris_diproses} baris, ${summary.barang_baru} barang baru, ${summary.auto_kosong} auto kosong${
          summary.scale_by_1000 ? ' (×1000)' : ''
        }`
      );
      resetPipeline();
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSuccess?.({ pbfId });
      onClose?.();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan pricelist');
      toast(err.message || 'Gagal menyimpan pricelist');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryMapping() {
    setPreviewOpen(false);
    setParseResult(null);
    setScaleBy1000(false);

    if (!file) {
      setError(
        uploadKind === 'pdf'
          ? 'File hilang — pilih PDF lagi'
          : 'File hilang — pilih Excel lagi'
      );
      return;
    }

    try {
      if (uploadKind === 'pdf') {
        await runPdfParse(file, { forceMapping: true });
        return;
      }
      setBusy(true);
      await openHeaderPreview(file, mapping.baris_mulai_data || 2, mapping);
      setMappingOpen(true);
    } catch (err) {
      setError(err.message || 'Gagal membuka form mapping');
      toast(err.message || 'Gagal membuka form mapping');
    } finally {
      setBusy(false);
    }
  }

  if (!open && !mappingOpen && !pdfMappingOpen && !previewOpen) return null;

  return (
    <>
      {formVisible ? (
        <SheetModal
          title={
            <h2 className="text-[15px] font-semibold leading-none text-text-primary">
              Upload Pricelist
            </h2>
          }
          onClose={handleClose}
          busy={busy}
          borderless
          footer={
            <button
              type="button"
              disabled={busy || !pbfId || !file}
              onClick={handleUpload}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {busy ? <SubmitSpinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              Upload
            </button>
          }
        >
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                PBF
              </span>
              <select
                value={pbfId}
                disabled={busy}
                onChange={(e) => setPbfId(e.target.value)}
                className={selectClass}
              >
                <option value="">— Pilih supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.inisial ? `${s.inisial} · ` : ''}
                    {s.nama}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                Jenis file
              </span>
              <div className="flex gap-1.5">
                {[
                  { id: 'excel', label: 'Excel', icon: FileSpreadsheet },
                  { id: 'pdf', label: 'PDF', icon: FileText },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const active = uploadKind === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setUploadKind(opt.id);
                        setFile(null);
                        setError('');
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 py-2 text-[12px] font-semibold ${
                        active
                          ? 'bg-accent-yellow text-bg-base'
                          : 'border border-border-subtle bg-bg-base text-text-secondary hover:bg-bg-surface-hover'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                File
              </span>
              <label
                className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-border-subtle bg-bg-base px-3 py-5 text-center transition hover:border-accent-yellow/50 hover:bg-bg-surface-hover ${
                  busy ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                {uploadKind === 'pdf' ? (
                  <FileText className="h-6 w-6 text-accent-yellow" />
                ) : (
                  <FileSpreadsheet className="h-6 w-6 text-accent-yellow" />
                )}
                <span className="text-[13px] font-medium text-text-primary">
                  {file ? file.name : 'Pilih file dari perangkat'}
                </span>
                <span className="text-[11px] text-text-muted">
                  {uploadKind === 'pdf' ? 'PDF' : 'Excel (.xlsx, .xls, .csv)'}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={
                    uploadKind === 'pdf'
                      ? '.pdf,application/pdf'
                      : '.xlsx,.xls,.csv'
                  }
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

      {mappingOpen ? (
        <MappingSheet
          title="Mapping Kolom Excel"
          headers={preview?.headers || []}
          previewRows={preview?.preview_rows || []}
          values={mapping}
          onChange={setMapping}
          onClose={() => {
            if (!busy) {
              setMappingOpen(false);
              if (!previewOpen) setPreview(null);
            }
          }}
          onConfirm={confirmMapping}
          submitting={busy}
          confirmLabel="Lanjut Preview"
        />
      ) : null}

      {pdfMappingOpen && pdfMappingMeta ? (
        <PdfMappingSheet
          mappingRows={pdfMappingMeta.mapping_rows || []}
          initialKolomPosisi={pdfMappingMeta.existing_kolom_posisi}
          barisMulaiData={pdfBarisMulai}
          formatAngka={pdfFormatAngka}
          onBarisMulaiChange={setPdfBarisMulai}
          onFormatAngkaChange={setPdfFormatAngka}
          onClose={() => {
            if (!busy) {
              setPdfMappingOpen(false);
              setPdfMappingMeta(null);
            }
          }}
          onConfirm={confirmPdfMapping}
          submitting={busy}
        />
      ) : null}

      {previewOpen && parseResult ? (
        <UploadPreviewSheet
          sample={parseResult.sample || []}
          warnings={parseResult.warnings}
          barisValid={parseResult.baris_valid || 0}
          scaleBy1000={scaleBy1000}
          onScaleBy1000Change={handleScaleBy1000Change}
          onConfirm={handleConfirmSave}
          onRetry={handleRetryMapping}
          submitting={busy}
        />
      ) : null}
    </>
  );
}
