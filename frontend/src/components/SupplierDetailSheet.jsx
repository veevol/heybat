import { DAY_SHORT } from '../lib/supplier';
import SheetModal, { SupplierModalTitle } from './SheetModal';

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-1.5 text-[13px] leading-snug">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text-primary">{children || '—'}</dd>
    </div>
  );
}

export default function SupplierDetailSheet({
  supplier,
  onClose,
  onEdit,
  onDelete,
}) {
  if (!supplier) return null;

  return (
    <SheetModal
      title={<SupplierModalTitle nama={supplier.nama} inisial={supplier.inisial} />}
      onClose={onClose}
      footer={
        onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(supplier)}
            className="w-full rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white hover:brightness-110"
          >
            Edit
          </button>
        ) : null
      }
    >
      <div className="space-y-3">
        <dl className="space-y-1.5">
          <Row label="No. Telp PBF">{supplier.no_telp_pbf}</Row>
          <Row label="Nama Sales">{supplier.nama_sales}</Row>
          <Row label="No. WA Sales">{supplier.no_wa_sales}</Row>
          <Row label="Kelamin Sales">
            {supplier.jenis_kelamin_sales === 'L'
              ? 'Laki-laki'
              : supplier.jenis_kelamin_sales === 'P'
                ? 'Perempuan'
                : null}
          </Row>
          <Row label="Alamat">{supplier.alamat}</Row>
          <Row label="Jenis PBF">
            {supplier.jenis_pbf?.length ? (
              <div className="flex flex-wrap gap-1">
                {supplier.jenis_pbf.map((item) => (
                  <span
                    key={item}
                    className="rounded-[4px] border border-border-subtle px-1.5 py-0.5 text-[10px] text-text-secondary"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : null}
          </Row>
        </dl>

        <section>
          <h4 className="mb-1.5 text-[13px] font-semibold leading-none text-text-primary">
            Jadwal
          </h4>
          <div className="space-y-1 rounded-[4px] border border-border-subtle p-2">
            {(supplier.jadwal || []).map((row) => (
              <div
                key={row.hari}
                className="flex items-start justify-between gap-2 text-[12px] leading-snug"
              >
                <span className="w-9 shrink-0 font-medium text-text-primary">
                  {DAY_SHORT[row.hari]}
                </span>
                <div className="flex flex-1 flex-wrap gap-1">
                  {row.bisa_order ? (
                    <span className="rounded-[4px] bg-accent-yellow/20 px-1.5 py-0.5 text-[10px] text-accent-yellow">
                      Order
                    </span>
                  ) : null}
                  {row.bisa_kirim ? (
                    <span className="rounded-[4px] bg-accent-cyan/20 px-1.5 py-0.5 text-[10px] text-accent-cyan">
                      Kirim
                    </span>
                  ) : null}
                  {!row.bisa_order && !row.bisa_kirim ? (
                    <span className="text-text-muted">—</span>
                  ) : null}
                </div>
                <span className="text-right text-text-secondary">{row.jam_cutoff || ''}</span>
              </div>
            ))}
          </div>
        </section>

        {onDelete ? (
          <section className="rounded-[4px] border border-state-error/50 p-2.5">
            <h4 className="text-[13px] font-semibold leading-none text-state-error">
              Danger Zone
            </h4>
            <p className="mt-1 text-[11px] leading-snug text-text-muted">
              Hapus supplier beserta seluruh jadwalnya. Tidak bisa dibatalkan.
            </p>
            <button
              type="button"
              onClick={() => onDelete(supplier)}
              className="mt-2 w-full rounded-[4px] border border-state-error/50 px-3 py-2 text-[13px] font-medium text-state-error hover:bg-state-error/10"
            >
              Hapus Supplier
            </button>
          </section>
        ) : null}
      </div>
    </SheetModal>
  );
}
