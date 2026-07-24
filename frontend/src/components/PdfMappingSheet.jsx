import { useMemo, useState } from 'react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

const FIELDS = [
  { key: 'nama', label: 'Nama', required: true, color: 'bg-accent-yellow text-bg-base' },
  { key: 'qty', label: 'Qty', required: false, color: 'bg-accent-navy text-white' },
  { key: 'harga', label: 'Harga', required: false, color: 'bg-state-success/80 text-bg-base' },
  { key: 'satuan', label: 'Satuan', required: false, color: 'bg-state-warning/80 text-bg-base' },
];

function padRange(tokens, pad = 3) {
  if (!tokens.length) return null;
  const xMin = Math.min(...tokens.map((t) => Number(t.x) || 0));
  const xMax = Math.max(
    ...tokens.map((t) => (Number(t.x) || 0) + (Number(t.width) || 0))
  );
  return { x_min: Math.floor(xMin - pad), x_max: Math.ceil(xMax + pad) };
}

/**
 * List-based PDF column mapper.
 * Staff picks an active field, then taps text tokens on sample rows.
 * x_min/x_max ranges are derived from selected tokens.
 */
export default function PdfMappingSheet({
  mappingRows = [],
  initialKolomPosisi = null,
  barisMulaiData = 1,
  formatAngka = 'id',
  onBarisMulaiChange,
  onFormatAngkaChange,
  onClose,
  onConfirm,
  submitting = false,
}) {
  const [activeField, setActiveField] = useState('nama');
  const [assignments, setAssignments] = useState(() => {
    // tokenId → fieldKey
    const map = {};
    return map;
  });

  const tokenLookup = useMemo(() => {
    const map = new Map();
    for (const row of mappingRows) {
      for (const token of row.tokens || []) {
        map.set(token.id, token);
      }
    }
    return map;
  }, [mappingRows]);

  const derivedPosisi = useMemo(() => {
    const byField = { nama: [], qty: [], harga: [], satuan: [] };
    for (const [tokenId, field] of Object.entries(assignments)) {
      const token = tokenLookup.get(tokenId);
      if (!token || !byField[field]) continue;
      byField[field].push(token);
    }
    const posisi = {};
    for (const key of Object.keys(byField)) {
      const range = padRange(byField[key]);
      if (range) posisi[key] = range;
    }
    // Prefer derived; if empty and initial exists, show initial as hint only (not auto-confirm)
    return posisi;
  }, [assignments, tokenLookup]);

  function toggleToken(tokenId) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (next[tokenId] === activeField) {
        delete next[tokenId];
      } else {
        next[tokenId] = activeField;
      }
      return next;
    });
  }

  function clearField(fieldKey) {
    setAssignments((prev) => {
      const next = { ...prev };
      for (const [id, field] of Object.entries(next)) {
        if (field === fieldKey) delete next[id];
      }
      return next;
    });
  }

  const effectivePosisi =
    Object.keys(derivedPosisi).length > 0 ? derivedPosisi : initialKolomPosisi;
  const canSubmit = Boolean(effectivePosisi?.nama);

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
          Mapping Kolom PDF
        </h2>
      }
      onClose={onClose}
      busy={submitting}
      footer={
        <div className="flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary sm:w-auto"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onConfirm(effectivePosisi)}
            disabled={submitting || !canSubmit}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50 sm:w-auto"
          >
            {submitting ? <SubmitSpinner /> : 'Lanjut Preview'}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <p className="text-[12px] leading-snug text-text-secondary">
          Pilih jenis kolom di bawah, lalu ketuk teks pada baris contoh untuk menandai
          area kolom itu. Rentang X dihitung otomatis dari teks yang ditandai.
        </p>

        <div className="flex flex-wrap gap-1">
          {FIELDS.map((field) => (
            <button
              key={field.key}
              type="button"
              onClick={() => setActiveField(field.key)}
              className={`rounded-[4px] px-2 py-1 text-[11px] font-semibold ${
                activeField === field.key
                  ? field.color
                  : 'border border-border-subtle text-text-secondary hover:bg-bg-surface-hover'
              }`}
            >
              {field.label}
              {field.required ? ' *' : ''}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-muted">
          {FIELDS.map((field) => {
            const range = effectivePosisi?.[field.key];
            const isDerived = Boolean(derivedPosisi[field.key]);
            return (
              <span key={field.key} className="inline-flex items-center gap-1">
                <span className="text-text-secondary">{field.label}:</span>
                {range ? (
                  <>
                    x {range.x_min}–{range.x_max}
                    {!isDerived ? (
                      <span className="text-text-muted">(tersimpan)</span>
                    ) : null}
                    {isDerived ? (
                      <button
                        type="button"
                        onClick={() => clearField(field.key)}
                        className="text-state-error hover:underline"
                      >
                        hapus
                      </button>
                    ) : null}
                  </>
                ) : (
                  '—'
                )}
              </span>
            );
          })}
        </div>

        {initialKolomPosisi?.nama && Object.keys(derivedPosisi).length === 0 ? (
          <p className="text-[11px] text-text-muted">
            Template posisi kolom lama akan dipakai ulang. Tandai teks baru hanya jika ingin
            mengubah area kolom; atau cukup ubah Format Angka lalu Lanjut Preview.
          </p>
        ) : null}

        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">Format angka</span>
          <select
            value={formatAngka === 'intl' ? 'intl' : 'id'}
            onChange={(e) => onFormatAngkaChange?.(e.target.value)}
            className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow"
          >
            <option value="id">Indonesia (titik/koma = ribuan)</option>
            <option value="intl">Internasional (koma = ribuan, titik = desimal)</option>
          </select>
          <p className="text-[10px] leading-snug text-text-muted">
            Contoh ID: 13,800 atau 13.800 → 13800. Contoh Intl: 13,800.50 → 13800.5
          </p>
        </label>

        <label className="block space-y-0.5">
          <span className="text-[11px] text-text-secondary">
            Baris mulai data (lewati header)
          </span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={barisMulaiData}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              onBarisMulaiChange?.(Math.max(1, Number(digits) || 1));
            }}
            className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow"
          />
        </label>

        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto scrollbar-hide rounded-[4px] border border-border-subtle bg-bg-base p-2">
          {mappingRows.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-text-muted">
              Tidak ada teks terdeteksi di halaman awal
            </p>
          ) : (
            mappingRows.map((row) => (
              <div key={row.__row} className="rounded-[4px] border border-border-subtle/70 p-1.5">
                <div className="mb-1 text-[10px] text-text-muted">
                  Baris #{row.__row}
                  {row.page ? ` · hlm ${row.page}` : ''}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(row.tokens || []).map((token) => {
                    const assigned = assignments[token.id];
                    const meta = FIELDS.find((f) => f.key === assigned);
                    return (
                      <button
                        key={token.id}
                        type="button"
                        onClick={() => toggleToken(token.id)}
                        title={`x=${Math.round(token.x)}`}
                        className={`rounded-[4px] px-1.5 py-0.5 text-[11px] leading-snug ${
                          meta
                            ? meta.color
                            : 'border border-border-subtle bg-bg-surface text-text-primary hover:bg-bg-surface-hover'
                        }`}
                      >
                        {token.str}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </SheetModal>
  );
}
