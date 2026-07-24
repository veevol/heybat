import { useState } from 'react';
import { ChevronDown, Flag, Plus } from 'lucide-react';
import SheetModal from './SheetModal';
import SubmitSpinner from './SubmitSpinner';

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('id-ID').format(num);
}

function formatTanggal(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

function WarningSection({
  id,
  title,
  count,
  open,
  onToggle,
  tone = 'warning',
  children,
}) {
  if (!count) return null;
  const toneClass =
    tone === 'error'
      ? 'border-state-error/40 bg-state-error/10'
      : 'border-state-warning/40 bg-state-warning/10';
  const titleClass =
    tone === 'error' ? 'text-state-error' : 'text-state-warning';

  return (
    <div className={`rounded-[4px] border ${toneClass}`}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
        aria-expanded={open}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition ${open ? 'rotate-0' : '-rotate-90'} ${titleClass}`}
        />
        <span className={`flex-1 text-[12px] font-semibold ${titleClass}`}>
          {title}
        </span>
        <span className="rounded-[4px] bg-bg-surface/80 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
          {count}
        </span>
      </button>
      {open ? (
        <div className="border-t border-border-subtle/60 px-2 py-2">{children}</div>
      ) : null}
    </div>
  );
}

export default function StokUploadPreviewSheet({
  preview,
  onConfirm,
  onCancel,
  submitting = false,
  canTambahObat = false,
  canTandai = false,
  resolvedKodes = null,
  onTambahObat = null,
  onTandai = null,
}) {
  const [openSections, setOpenSections] = useState({
    kode: true,
    lewat: false,
    mendekati: false,
  });

  if (!preview) return null;

  const info = preview.info || {};
  const warnings = preview.warnings || {};
  const total = preview.total_baris ?? 0;
  const resolved = resolvedKodes || new Set();

  const kodeList = (info.kode_tidak_dikenal || []).filter(
    (row) => !resolved.has(row.kode_obat)
  );
  const lewatList = info.sudah_lewat_expired || info.expired_lewat || [];
  const mendekatiList = info.mendekati_expired || info.expired_segera || [];

  const jumlahKode = kodeList.length;
  const jumlahLewat =
    info.jumlah_sudah_lewat_expired ??
    info.jumlah_expired_lewat ??
    lewatList.length;
  const jumlahMendekati =
    info.jumlah_mendekati_expired ??
    info.jumlah_expired_segera ??
    mendekatiList.length;

  function toggle(id) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <SheetModal
      title={
        <h2 className="text-[15px] font-semibold leading-none text-text-primary">
          Preview Upload Stok
        </h2>
      }
      onClose={onCancel}
      busy={submitting}
      footer={
        <div className="flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="w-full rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] text-text-primary disabled:opacity-50 sm:w-auto"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || total < 1}
            className="inline-flex w-full items-center justify-center rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50 sm:w-auto"
          >
            {submitting ? <SubmitSpinner /> : `Simpan ${total} baris`}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-text-secondary">
          <span>
            File:{' '}
            <strong className="text-text-primary">{preview.nama_file || '—'}</strong>
          </span>
          <span>
            Valid:{' '}
            <strong className="text-text-primary">{total}</strong>
          </span>
          <span>
            Skip:{' '}
            <strong className="text-text-primary">{preview.baris_skip ?? 0}</strong>
          </span>
          {preview.repaired ? (
            <span className="text-text-muted">
              Styles diperbaiki
              {preview.style_replacements ? ` (${preview.style_replacements})` : ''}
            </span>
          ) : null}
        </div>

        <p className="text-[11px] text-text-muted">
          Item di bawah akan OTOMATIS masuk ke tab &quot;Perlu Ditindaklanjuti&quot; setelah
          kamu klik Simpan — tidak perlu ditandai manual sekarang. Tombol Tandai tetap
          tersedia kalau mau kasih catatan/jenis khusus dari awal.
        </p>

        <div className="space-y-1.5">
          <WarningSection
            id="kode"
            title="Kode tidak dikenal di Obat Yelo"
            count={jumlahKode}
            open={openSections.kode}
            onToggle={toggle}
          >
            {kodeList.length === 0 ? (
              <p className="text-[11px] text-text-secondary">Semua kode sudah terdaftar.</p>
            ) : (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {kodeList.map((row) => (
                  <li
                    key={`k-${row.item_index ?? row.baris}-${row.kode_obat}-${row.gudang}`}
                    className="rounded-[4px] border border-border-subtle/80 bg-bg-surface px-2 py-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium text-text-primary">
                          {row.nama_obat || '—'}
                        </p>
                        <p className="text-[10px] text-text-muted">
                          {row.kode_obat} · {row.gudang || '—'} · stok{' '}
                          {formatNumber(row.stok_qty)}
                        </p>
                      </div>
                      {canTambahObat && onTambahObat ? (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => onTambahObat(row)}
                          className="inline-flex shrink-0 items-center gap-0.5 rounded-[4px] border border-accent-navy/30 bg-accent-navy/10 px-1.5 py-1 text-[10px] font-medium text-accent-navy hover:bg-accent-navy/15 disabled:opacity-50"
                        >
                          <Plus className="h-3 w-3" />
                          Tambah ke Obat Yelo
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </WarningSection>

          <WarningSection
            id="lewat"
            title="Sudah lewat expired"
            count={jumlahLewat}
            open={openSections.lewat}
            onToggle={toggle}
            tone="error"
          >
            <ExpiredRows
              rows={lewatList}
              canTandai={canTandai}
              submitting={submitting}
              onTandai={onTandai}
            />
          </WarningSection>

          <WarningSection
            id="mendekati"
            title="Mendekati expired (≤ 90 hari)"
            count={jumlahMendekati}
            open={openSections.mendekati}
            onToggle={toggle}
          >
            <ExpiredRows
              rows={mendekatiList}
              canTandai={canTandai}
              submitting={submitting}
              onTandai={onTandai}
            />
          </WarningSection>
        </div>

        {(warnings.total || 0) > 0 ? (
          <div className="rounded-[4px] border border-border-subtle px-2.5 py-2 text-[11px] text-text-secondary">
            {warnings.total} peringatan parse (baris di-skip)
          </div>
        ) : null}

        <div>
          <p className="mb-1 text-[11px] font-medium text-text-secondary">Sampel baris</p>
          <div className="overflow-x-auto rounded-[4px] border border-border-subtle">
            <table className="min-w-full text-left text-[11px]">
              <thead className="bg-bg-base text-text-muted">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Gudang</th>
                  <th className="px-2 py-1.5 font-medium">Kode</th>
                  <th className="px-2 py-1.5 font-medium">Nama</th>
                  <th className="px-2 py-1.5 font-medium">Stok</th>
                  <th className="px-2 py-1.5 font-medium">Harga 1</th>
                  <th className="px-2 py-1.5 font-medium">ED</th>
                </tr>
              </thead>
              <tbody>
                {(preview.sample || []).map((row, idx) => (
                  <tr
                    key={`${row.kode_obat}-${row.gudang}-${row.no_batch}-${idx}`}
                    className="border-t border-border-subtle"
                  >
                    <td className="px-2 py-1.5 text-text-secondary">{row.gudang || '—'}</td>
                    <td className="px-2 py-1.5 text-text-secondary">{row.kode_obat}</td>
                    <td className="max-w-[140px] truncate px-2 py-1.5 text-text-primary">
                      {row.nama_obat || '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-text-secondary">
                      {formatNumber(row.stok_qty)} {row.satuan || ''}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-text-secondary">
                      {formatNumber(row.harga_1)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-text-secondary">
                      {formatTanggal(row.tanggal_expired)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </SheetModal>
  );
}

function ExpiredRows({ rows, canTandai, submitting, onTandai }) {
  if (!rows?.length) {
    return <p className="text-[11px] text-text-secondary">Tidak ada baris.</p>;
  }
  return (
    <ul className="max-h-48 space-y-1.5 overflow-y-auto">
      {rows.map((row) => (
        <li
          key={`e-${row.item_index ?? row.baris}-${row.kode_obat}-${row.no_batch}-${row.gudang}`}
          className="rounded-[4px] border border-border-subtle/80 bg-bg-surface px-2 py-1.5"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-medium text-text-primary">
                {row.nama_obat || row.kode_obat}
              </p>
              <p className="text-[10px] text-text-muted">
                {row.kode_obat} · batch {row.no_batch || '—'} · {row.gudang || '—'}
              </p>
              <p className="text-[10px] text-text-secondary">
                ED {formatTanggal(row.tanggal_expired)} · stok {formatNumber(row.stok_qty)}
              </p>
            </div>
            {row.ditandai_preview ? (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[4px] bg-state-warning/15 px-1.5 py-1 text-[10px] font-medium text-state-warning">
                <Flag className="h-3 w-3" />
                Ditandai
              </span>
            ) : canTandai && onTandai ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() => onTandai(row)}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-[4px] border border-state-warning/40 bg-state-warning/10 px-1.5 py-1 text-[10px] font-medium text-state-warning hover:bg-state-warning/20 disabled:opacity-50"
              >
                <Flag className="h-3 w-3" />
                Tandai
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
