import { avatarInitials, buildWhatsAppUrl, hashColor } from '../lib/supplier';
import DayScheduleBadges from './DayScheduleBadges';
import WhatsAppIcon from './WhatsAppIcon';

export default function SupplierCard({ supplier, onOpen }) {
  const waUrl = buildWhatsAppUrl(supplier);
  const color = hashColor(supplier.nama || supplier.inisial);

  return (
    <article className="rounded-[4px] border border-border-subtle bg-bg-surface shadow-sm shadow-black/10 transition hover:bg-bg-surface-hover">
      <button
        type="button"
        onClick={() => onOpen(supplier)}
        className="w-full p-2.5 text-left"
      >
        {/* Section 1 — identitas */}
        <div className="flex items-center gap-2">
          {supplier.logo_url ? (
            <img
              src={supplier.logo_url}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            >
              {avatarInitials(supplier.nama)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="truncate text-[14px] font-bold leading-none text-text-primary">
                {supplier.nama}
              </h3>
              <span className="shrink-0 rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold leading-none text-bg-base">
                {supplier.inisial}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[12px] leading-none text-text-secondary">
              {supplier.nama_sales || 'Sales belum diisi'}
            </p>
          </div>
        </div>
      </button>

      {/* Section 2 — jadwal + WA */}
      <div className="flex items-center gap-2 border-t border-border-subtle px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => onOpen(supplier)}
          className="min-w-0 flex-1 text-left"
        >
          <DayScheduleBadges jadwal={supplier.jadwal} />
        </button>

        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[#25D366] transition hover:bg-bg-base"
            aria-label={`WhatsApp ${supplier.nama_sales || supplier.nama}`}
            title="Chat WhatsApp"
          >
            <WhatsAppIcon className="h-[18px] w-[18px]" />
          </a>
        ) : (
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-[#25D366]/40"
            title="No. WA sales belum diisi"
            aria-label="WhatsApp belum tersedia"
          >
            <WhatsAppIcon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
    </article>
  );
}
