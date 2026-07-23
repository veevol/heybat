import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { listSuppliers } from '../api/suppliers';
import {
  confirmPricelistUpload,
  getPricelistTemplate,
  listLatestPricelist,
  parsePricelistPreview,
  previewPricelistExcel,
  updatePricelistTemplate,
} from '../api/pricelist';
import AppShell from '../components/layout/AppShell';
import MappingSheet from '../components/MappingSheet';
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
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState(EMPTY_MAPPING);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [mappingMode, setMappingMode] = useState('upload'); // upload | edit
  const [parseResult, setParseResult] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
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
      setParseResult(result);
      if (result.mapping) {
        setMapping({
          nama_kolom_barang: result.mapping.nama_kolom_barang || '',
          nama_kolom_qty: result.mapping.nama_kolom_qty || null,
          nama_kolom_harga: result.mapping.nama_kolom_harga || null,
          nama_kolom_satuan: result.mapping.nama_kolom_satuan || null,
          baris_mulai_data: result.mapping.baris_mulai_data || 2,
        });
      }
      setMappingOpen(false);
      setPreviewOpen(true);
    } catch (err) {
      showToast(err.message || 'Gagal mem-preview hasil mapping');
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

    try {
      const tpl = await getPricelistTemplate(pbfId);
      setTemplate(tpl);

      if (!tpl) {
        setBusy(true);
        await openHeaderPreview(picked, 2, EMPTY_MAPPING);
        setMappingMode('upload');
        setMappingOpen(true);
        setBusy(false);
      } else {
        // Template ada → parse preview langsung (belum simpan DB)
        setMapping(mappingFromTemplate(tpl));
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
    if (!pbfId) return;
    try {
      setBusy(true);
      let headers = [];
      let previewRows = [];
      if (file) {
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

    // Edit mapping tanpa file: simpan template saja
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

    // Upload flow: mapping hanya dipakai untuk parse-preview (template belum di-DB)
    await runParsePreview(file, mapping);
  }

  async function handleConfirmSave() {
    if (!parseResult?.session_id) {
      showToast('Sesi preview tidak valid — upload ulang');
      return;
    }
    setBusy(true);
    try {
      const summary = await confirmPricelistUpload(parseResult.session_id);
      showToast(
        `Upload selesai: ${summary.baris_diproses} baris, ${summary.barang_baru} barang baru, ${summary.auto_kosong} auto kosong`
      );
      const tpl = await getPricelistTemplate(pbfId);
      setTemplate(tpl);
      await refreshList(pbfId);
      setPreviewOpen(false);
      setParseResult(null);
      setFile(null);
      setPreview(null);
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

    if (!file) {
      showToast('File hilang — pilih Excel lagi');
      return;
    }

    try {
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

  return (
    <AppShell title="Pricelist PBF">
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

        <div className="flex flex-wrap items-center gap-2">
          <label
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white ${
              !pbfId || busy ? 'pointer-events-none opacity-50' : ''
            }`}
          >
            {busy ? <SubmitSpinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            Upload Excel
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
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
              Edit Mapping
            </button>
          ) : pbfId ? (
            <span className="text-[11px] text-state-warning">
              Belum ada template — mapping diminta saat upload pertama
            </span>
          ) : null}
        </div>

        {file ? (
          <p className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <FileSpreadsheet className="h-3.5 w-3.5" />
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
          Belum ada data pricelist untuk PBF ini. Upload Excel untuk mulai.
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

      {previewOpen && parseResult ? (
        <UploadPreviewSheet
          sample={parseResult.sample || []}
          warnings={parseResult.warnings}
          barisValid={parseResult.baris_valid || 0}
          onConfirm={handleConfirmSave}
          onRetry={handleRetryMapping}
          submitting={busy}
        />
      ) : null}

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
