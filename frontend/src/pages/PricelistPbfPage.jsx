import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { listSuppliers } from '../api/suppliers';
import {
  confirmPricelistUpload,
  getPricelistTemplate,
  listLatestPricelist,
  parsePricelistPdfPreview,
  parsePricelistPreview,
  previewPricelistExcel,
  savePricelistPdfMapping,
  setPricelistSessionScale,
  updatePricelistTemplate,
} from '../api/pricelist';
import AppShell from '../components/layout/AppShell';
import MappingSheet from '../components/MappingSheet';
import PdfMappingSheet from '../components/PdfMappingSheet';
import PricelistCard from '../components/PricelistCard';
import PricelistSkeleton from '../components/PricelistSkeleton';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import UploadPreviewSheet from '../components/UploadPreviewSheet';

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
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow';

export default function PricelistPbfPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [pbfId, setPbfId] = useState('');
  const [template, setTemplate] = useState(null);
  const [items, setItems] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [uploadKind, setUploadKind] = useState('pdf'); // excel | pdf
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState(EMPTY_MAPPING);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingMode, setMappingMode] = useState('upload'); // upload | edit
  const [pdfMappingOpen, setPdfMappingOpen] = useState(false);
  const [pdfMappingMeta, setPdfMappingMeta] = useState(null);
  const [pdfBarisMulai, setPdfBarisMulai] = useState(1);
  const [pdfFormatAngka, setPdfFormatAngka] = useState('id');
  const [parseResult, setParseResult] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [scaleBy1000, setScaleBy1000] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const fileInputRef = useRef(null);

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  }, []);

  useEffect(() => {
    listSuppliers()
      .then((data) => setSuppliers(data || []))
      .catch((err) => showToast(err.message || 'Gagal memuat supplier'));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [showToast]);

  const refreshList = useCallback(
    async (id) => {
      if (!id) {
        setItems([]);
        return;
      }
      setLoadingList(true);
      try {
        const data = await listLatestPricelist(id);
        setItems(data || []);
      } catch (err) {
        showToast(err.message || 'Gagal memuat pricelist');
        setItems([]);
      } finally {
        setLoadingList(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (!pbfId) {
      setTemplate(null);
      setItems([]);
      return;
    }
    getPricelistTemplate(pbfId)
      .then((tpl) => setTemplate(tpl))
      .catch(() => setTemplate(null));
    refreshList(pbfId);
  }, [pbfId, refreshList]);

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
      showToast(err.message || 'Gagal mem-preview hasil mapping');
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
        const tpl = await getPricelistTemplate(pbfId);
        setTemplate(tpl);
      }
    } catch (err) {
      showToast(err.message || 'Gagal memproses PDF');
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleFilePicked(picked) {
    if (!picked) return;
    if (!pbfId) {
      showToast('Pilih PBF dulu sebelum upload');
      return;
    }
    setFile(picked);
    setParseResult(null);
    setPreviewOpen(false);
    setScaleBy1000(false);
    setPdfMappingOpen(false);
    setPdfMappingMeta(null);

    try {
      const tpl = await getPricelistTemplate(pbfId);
      setTemplate(tpl);

      if (uploadKind === 'pdf') {
        await runPdfParse(picked);
        return;
      }

      // Excel
      const excelTpl = tpl && (tpl.tipe_sumber || 'excel') === 'excel' ? tpl : null;
      if (!excelTpl) {
        setBusy(true);
        await openHeaderPreview(picked, 2, EMPTY_MAPPING);
        setMappingMode('upload');
        setMappingOpen(true);
        setBusy(false);
      } else {
        setMapping(mappingFromTemplate(excelTpl));
        await runParsePreview(picked, null);
      }
    } catch (err) {
      showToast(err.message || 'Gagal memproses file');
      setFile(null);
      setBusy(false);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function openEditMapping() {
    if (!pbfId || !template) return;

    if ((template.tipe_sumber || 'excel') === 'pdf') {
      if (!file || uploadKind !== 'pdf') {
        showToast('Untuk edit mapping PDF, pilih jenis PDF lalu upload ulang file PDF');
        return;
      }
      await runPdfParse(file, { forceMapping: true });
      return;
    }

    try {
      setBusy(true);
      let headers = [];
      let previewRows = [];
      if (file && uploadKind === 'excel') {
        const result = await previewPricelistExcel(
          file,
          template?.baris_mulai_data || mapping.baris_mulai_data || 2
        );
        headers = result.headers || [];
        previewRows = result.preview_rows || [];
        setPreview(result);
      } else if (template) {
        headers = [
          template.nama_kolom_barang,
          template.nama_kolom_qty,
          template.nama_kolom_harga,
          template.nama_kolom_satuan,
        ].filter(Boolean);
      }

      setMapping(mappingFromTemplate(template));
      if (!preview) {
        setPreview({ headers, preview_rows: previewRows });
      }
      setMappingMode('edit');
      setMappingOpen(true);
    } catch (err) {
      showToast(err.message || 'Gagal membuka mapping');
    } finally {
      setBusy(false);
    }
  }

  async function confirmMapping() {
    if (!mapping.nama_kolom_barang) {
      showToast('Kolom nama barang wajib dipilih');
      return;
    }

    if (mappingMode === 'edit' && !file) {
      setBusy(true);
      try {
        const saved = await updatePricelistTemplate(pbfId, mapping);
        setTemplate(saved);
        showToast('Mapping berhasil diperbarui');
        setMappingOpen(false);
      } catch (err) {
        showToast(err.message || 'Gagal menyimpan mapping');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!file) {
      showToast('File Excel belum dipilih');
      return;
    }

    await runParsePreview(file, mapping);
  }

  async function confirmPdfMapping(kolomPosisi) {
    if (!pdfMappingMeta?.session_id) {
      showToast('Sesi PDF tidak valid — upload ulang');
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
      const tpl = await getPricelistTemplate(pbfId);
      setTemplate(tpl);
      openMappedPreview(result);
      showToast('Mapping PDF tersimpan — cek preview');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan mapping PDF');
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
      showToast('Sesi preview tidak valid — upload ulang');
      return;
    }
    setBusy(true);
    try {
      const summary = await confirmPricelistUpload(parseResult.session_id, {
        scaleBy1000,
      });
      showToast(
        `Upload selesai: ${summary.baris_diproses} baris, ${summary.barang_baru} barang baru, ${summary.auto_kosong} auto kosong${
          summary.scale_by_1000 ? ' (×1000)' : ''
        }`
      );
      const tpl = await getPricelistTemplate(pbfId);
      setTemplate(tpl);
      await refreshList(pbfId);
      setPreviewOpen(false);
      setParseResult(null);
      setScaleBy1000(false);
      setFile(null);
      setPreview(null);
      setPdfMappingMeta(null);
      setMapping(EMPTY_MAPPING);
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pricelist');
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryMapping() {
    setPreviewOpen(false);
    setParseResult(null);
    setScaleBy1000(false);

    if (!file) {
      showToast(
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
      await openHeaderPreview(
        file,
        mapping.baris_mulai_data || 2,
        mapping.nama_kolom_barang ? mapping : mappingFromTemplate(template)
      );
      setMappingMode('upload');
      setMappingOpen(true);
    } catch (err) {
      showToast(err.message || 'Gagal membuka form mapping');
    } finally {
      setBusy(false);
    }
  }

  const templateLabel =
    template?.tipe_sumber === 'pdf'
      ? 'Template PDF'
      : template
        ? 'Template Excel'
        : null;

  return (
    <AppShell title="Pricelist PBF" navLoading={loadingList || busy}>
      <section className="mb-3 space-y-2 rounded-[4px] border border-border-subtle bg-bg-surface p-2.5">
        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">Pilih PBF</span>
          <select
            value={pbfId}
            onChange={(e) => setPbfId(e.target.value)}
            className={selectClass}
          >
            <option value="">— Pilih supplier —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama} ({s.inisial})
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-0.5">
          <span className="text-[11px] text-text-secondary">Jenis file</span>
          <div className="flex gap-1">
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
                  onClick={() => setUploadKind(opt.id)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 py-1.5 text-[12px] font-medium ${
                    active
                      ? 'bg-accent-navy text-white'
                      : 'border border-border-subtle text-text-secondary hover:bg-bg-surface-hover'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white ${
              !pbfId || busy ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            {busy ? <SubmitSpinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            {uploadKind === 'pdf' ? 'Upload PDF' : 'Upload Excel'}
            <input
              ref={fileInputRef}
              type="file"
              accept={uploadKind === 'pdf' ? '.pdf,application/pdf' : '.xlsx,.xls,.csv'}
              className="hidden"
              disabled={!pbfId || busy}
              onChange={(e) => handleFilePicked(e.target.files?.[0] || null)}
            />
          </label>

          {template ? (
            <button
              type="button"
              onClick={openEditMapping}
              disabled={!pbfId || busy}
              className="rounded-[4px] border border-border-subtle px-3 py-2 text-[12px] text-text-secondary hover:bg-bg-surface-hover disabled:opacity-50"
            >
              Edit Mapping ({template.tipe_sumber === 'pdf' ? 'PDF' : 'Excel'})
            </button>
          ) : pbfId ? (
            <span className="text-[11px] text-state-warning">
              Belum ada template — mapping diminta saat upload pertama
            </span>
          ) : null}
        </div>

        {templateLabel ? (
          <p className="text-[11px] text-text-muted">Aktif: {templateLabel}</p>
        ) : null}

        {file ? (
          <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
            {uploadKind === 'pdf' ? (
              <FileText className="h-3.5 w-3.5" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5" />
            )}
            {file.name}
          </p>
        ) : null}
      </section>

      {!pbfId ? (
        <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
          Pilih PBF untuk melihat pricelist terbaru dan upload file.
        </div>
      ) : null}

      {pbfId && loadingList ? <PricelistSkeleton /> : null}

      {pbfId && !loadingList && items.length === 0 ? (
        <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
          Belum ada data pricelist untuk PBF ini. Upload Excel atau PDF untuk mulai.
        </div>
      ) : null}

      {pbfId && !loadingList && items.length > 0 ? (
        <div className="grid grid-cols-1 gap-1.5">
          {items.map((item) => (
            <PricelistCard key={`${item.kode_pbf}-${item.id}`} item={item} />
          ))}
        </div>
      ) : null}

      {mappingOpen ? (
        <MappingSheet
          title={mappingMode === 'edit' ? 'Edit Mapping' : 'Mapping Kolom Excel'}
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
          confirmLabel={
            mappingMode === 'edit' && !file ? 'Simpan Mapping' : 'Lanjut Preview'
          }
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

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
