import { useNavigate } from 'react-router-dom';
import ScheduleDots from './ScheduleDots';
import {
  buildDummyTagihan,
  formatRupiahPlain,
  formatSisaHari,
  formatTanggalId,
  jtTextClass,
} from '../lib/dummyTagihan';
import { useAuth } from '../context/AuthContext';
import { isFrontOffice } from '../lib/permissions';

function formatUploadDate(iso) {
  if (!iso) return 'Belum ada upload';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function SupplierCard({ supplier, onOpen }) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const hideTagihan = isFrontOffice(profile);
  const stats = supplier.pricelist_stats || {};
  const total = Number(stats.total_items) || 0;
  const matched = Number(stats.matched_items) || 0;
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
  const tagihan = hideTagihan ? [] : buildDummyTagihan(supplier);
  const hasOverdue = tagihan.some((t) => t.status === 'overdue');

  function openPricelist(event) {
    event.stopPropagation();
    navigate(`/matching?pbf_id=${encodeURIComponent(supplier.id)}`);
  }

  return (
    <article className="flex flex-col gap-2 rounded-xl bg-bg-surface p-3 shadow-sm shadow-black/30">
      <button
        type="button"
        onClick={() => onOpen?.(supplier)}
        className="w-full text-left"
      >
        <div className="flex w-full items-start justify-between gap-2">
          <div className="min-w-0 w-full flex-1">
            <div className="flex w-full min-w-0 items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-left text-[16px] font-semibold leading-snug text-text-primary">
                {supplier.nama}
              </h2>
              {supplier.inisial ? (
                <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold text-bg-base">
                  {supplier.inisial}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              Sales: {supplier.nama_sales || '—'}
            </p>
          </div>
        </div>

        <div className="mt-2">
          <ScheduleDots jadwal={supplier.jadwal} />
        </div>
      </button>

      <button
        type="button"
        onClick={openPricelist}
        className="rounded-lg border border-border-subtle bg-bg-base p-3 text-left transition hover:bg-bg-surface-hover"
      >
        <p className="text-[11px] text-text-secondary">
          Upload terakhir: {formatUploadDate(stats.tanggal_upload_terakhir)}
        </p>
        <p className="mt-1 text-[13px] text-text-primary">
          {total > 0
            ? `${matched} dari ${total} obat matching`
            : 'Belum ada item pricelist'}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border-subtle">
          <div
            className="h-full rounded-full bg-accent-yellow transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </button>

      {!hideTagihan ? (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[16px] font-semibold text-text-primary">
              Tagihan Belum Lunas
            </h3>
            {tagihan.length > 0 ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  hasOverdue
                    ? 'bg-state-error text-white'
                    : 'bg-accent-yellow text-bg-base'
                }`}
              >
                {tagihan.length}
              </span>
            ) : null}
          </div>

          {tagihan.length === 0 ? (
            <p className="px-2 py-1 text-[13px] italic text-text-secondary">
              Semua tagihan lunas
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {tagihan.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-0.5"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="w-[4.75rem] shrink-0 text-[11px] tabular-nums text-text-primary">
                      {formatTanggalId(row.tanggal_faktur)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-right text-[11px] tabular-nums text-text-primary">
                      {formatRupiahPlain(row.nominal)} [{row.jumlah_invoice} Inv]
                    </span>
                  </div>
                  <div
                    className={`flex w-[7.25rem] shrink-0 items-center justify-end gap-1 whitespace-nowrap text-[11px] tabular-nums ${jtTextClass(row.status)}`}
                  >
                    <span>{formatTanggalId(row.tanggal_jatuh_tempo)}</span>
                    <span className="w-8 text-right">
                      {formatSisaHari(row.tanggal_jatuh_tempo)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </article>
  );
}
