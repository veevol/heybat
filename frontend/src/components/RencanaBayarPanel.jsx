import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  getRencanaBayar,
  hapusRencanaBayar,
  konfirmasiRencanaBayar,
  listRencanaBayar,
  updateRencanaBayar,
} from '../api/pembelian';
import ConfirmActionModal from './ConfirmActionModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import SubmitSpinner from './SubmitSpinner';

function formatRupiah(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

/** Tampilkan angka dengan pemisah ribuan id-ID (1.943.119) */
function formatNominalInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const n = Number(digits);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('id-ID').format(n);
}

/** Parse input berformat ribuan → number */
function parseNominalInput(text) {
  const digits = String(text ?? '').replace(/\D/g, '');
  if (!digits) return NaN;
  return Number(digits);
}

function formatTanggal(value) {
  if (!value) return '—';
  const raw = String(value);
  const d =
    raw.length <= 10 ? new Date(`${raw}T00:00:00+07:00`) : new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(d);
}

/** Usia faktur dalam hari sejak tanggal_faktur (Asia/Jakarta) */
function formatUsiaFakturHari(tanggalFaktur) {
  if (!tanggalFaktur) return null;
  const raw = String(tanggalFaktur);
  const start =
    raw.length <= 10
      ? new Date(`${raw.slice(0, 10)}T00:00:00+07:00`)
      : new Date(raw);
  if (Number.isNaN(start.getTime())) return null;

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const today = new Date(`${todayStr}T00:00:00+07:00`);
  const diffDays = Math.round((today.getTime() - start.getTime()) / 86400000);

  if (!Number.isFinite(diffDays) || diffDays < 0) return '0 D';
  return `${diffDays} D`;
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const METODE_BAYAR_OPTIONS = ['Flip', 'BRI', 'Tunai', 'Kasir'];

function normalizeMetodeBayar(value) {
  const raw = String(value || '').trim();
  if (METODE_BAYAR_OPTIONS.includes(raw)) return raw;
  return 'Flip';
}

/**
 * View Jadwal Bayar — list draft per PBF + detail/edit/konfirmasi.
 */
export default function RencanaBayarPanel({
  canTambah = false,
  onToast,
  onChanged,
  onSummaryChange,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Local edit state for expanded draft
  const [editTanggal, setEditTanggal] = useState('');
  const [editMetode, setEditMetode] = useState('');
  const [editCatatan, setEditCatatan] = useState('');
  const [editNominals, setEditNominals] = useState({});

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listRencanaBayar();
      setItems(data.items || []);
    } catch (err) {
      onToast?.(err.message || 'Gagal memuat jadwal bayar');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    let total = 0;
    let jumlahFaktur = 0;
    for (const row of items) {
      // Prefer live detail total when that draft is open
      if (detail?.id === row.id) {
        total += Number(detail.total_rencana) || 0;
        jumlahFaktur += detail.items?.length || Number(row.jumlah_faktur) || 0;
      } else {
        total += Number(row.total_rencana) || 0;
        jumlahFaktur += Number(row.jumlah_faktur) || 0;
      }
    }
    onSummaryChange?.({
      total,
      jumlah_faktur: jumlahFaktur,
      jumlah_draft: items.length,
    });
  }, [items, detail, onSummaryChange]);

  const loadDetail = useCallback(
    async (id) => {
      setDetailBusy(true);
      try {
        const data = await getRencanaBayar(id);
        const item = data.item;
        setDetail(item);
        setEditTanggal(
          String(item.tanggal_rencana || '').slice(0, 10) || todayIsoDate()
        );
        setEditMetode(normalizeMetodeBayar(item.metode_bayar));
        setEditCatatan(item.catatan || '');
        const noms = {};
        for (const it of item.items || []) {
          noms[it.faktur_id] = formatNominalInput(it.nominal_rencana);
        }
        setEditNominals(noms);
      } catch (err) {
        onToast?.(err.message || 'Gagal memuat detail');
        setDetail(null);
        setExpandedId(null);
      } finally {
        setDetailBusy(false);
      }
    },
    [onToast]
  );

  async function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      setEditingId(null);
      return;
    }
    setEditingId(null);
    setExpandedId(id);
    await loadDetail(id);
  }

  async function handleSaveEdit() {
    if (!detail || saving || !canTambah) return;
    const itemsPayload = (detail.items || []).map((it) => {
      const n = parseNominalInput(editNominals[it.faktur_id]);
      return {
        faktur_id: it.faktur_id,
        nominal_rencana: Number.isFinite(n) && n > 0 ? n : it.nominal_rencana,
      };
    });
    if (itemsPayload.some((it) => !(it.nominal_rencana > 0))) {
      onToast?.('Semua nominal harus > 0');
      return;
    }
    setSaving(true);
    try {
      const data = await updateRencanaBayar(detail.id, {
        tanggal_rencana: editTanggal || null,
        metode_bayar: normalizeMetodeBayar(editMetode),
        catatan: editCatatan.trim() || null,
        items: itemsPayload,
      });
      setDetail(data.item);
      const noms = {};
      for (const it of data.item.items || []) {
        noms[it.faktur_id] = formatNominalInput(it.nominal_rencana);
      }
      setEditNominals(noms);
      setEditingId(null);
      onToast?.('Jadwal diperbarui');
      await loadList();
      onChanged?.();
    } catch (err) {
      onToast?.(err.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  async function handleStartEdit(rowId) {
    if (!canTambah || saving) return;
    if (expandedId !== rowId) {
      setExpandedId(rowId);
      await loadDetail(rowId);
    } else if (!detail || detail.id !== rowId) {
      await loadDetail(rowId);
    }
    setEditingId(rowId);
  }

  async function handleBayarClick(row) {
    if (!canTambah || saving || confirming) return;
    let current = detail?.id === row.id ? detail : null;
    if (!current) {
      setExpandedId(row.id);
      setDetailBusy(true);
      try {
        const data = await getRencanaBayar(row.id);
        current = data.item;
        setDetail(current);
        setEditTanggal(
          String(current.tanggal_rencana || '').slice(0, 10) || todayIsoDate()
        );
        setEditMetode(normalizeMetodeBayar(current.metode_bayar));
        setEditCatatan(current.catatan || '');
        const noms = {};
        for (const it of current.items || []) {
          noms[it.faktur_id] = formatNominalInput(it.nominal_rencana);
        }
        setEditNominals(noms);
      } catch (err) {
        onToast?.(err.message || 'Gagal memuat detail');
        return;
      } finally {
        setDetailBusy(false);
      }
    }
    setConfirmTarget(current);
  }

  async function handleRemoveItem(fakturId) {
    if (!detail || saving || !canTambah) return;
    const remaining = (detail.items || []).filter((it) => it.faktur_id !== fakturId);
    if (!remaining.length) {
      setDeleteTarget(detail);
      return;
    }
    setSaving(true);
    try {
      const data =           await updateRencanaBayar(detail.id, {
            tanggal_rencana: editTanggal || null,
            metode_bayar: normalizeMetodeBayar(editMetode),
            catatan: editCatatan.trim() || null,
            items: remaining.map((it) => ({
              faktur_id: it.faktur_id,
              nominal_rencana: (() => {
                const n = parseNominalInput(
                  editNominals[it.faktur_id] ?? it.nominal_rencana
                );
                return Number.isFinite(n) && n > 0 ? n : Number(it.nominal_rencana);
              })(),
            })),
          });
      setDetail(data.item);
      const noms = {};
      for (const it of data.item.items || []) {
        noms[it.faktur_id] = formatNominalInput(it.nominal_rencana);
      }
      setEditNominals(noms);
      await loadList();
      onChanged?.();
      onToast?.('Faktur dikeluarkan dari jadwal');
    } catch (err) {
      onToast?.(err.message || 'Gagal mengeluarkan faktur');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await hapusRencanaBayar(deleteTarget.id);
      onToast?.('Jadwal dihapus');
      setDeleteTarget(null);
      if (expandedId === deleteTarget.id) {
        setExpandedId(null);
        setDetail(null);
        setEditingId(null);
      }
      await loadList();
      onChanged?.();
    } catch (err) {
      onToast?.(err.message || 'Gagal membatalkan');
    } finally {
      setDeleting(false);
    }
  }

  async function handleConfirmBayar() {
    if (!confirmTarget || confirming) return;
    setConfirming(true);
    try {
      const data = await konfirmasiRencanaBayar(confirmTarget.id);
      const h = data.hasil || {};
      const adj = h.ada_penyesuaian ? ' (ada penyesuaian nominal)' : '';
      onToast?.(
        `${h.jumlah_faktur || 0} faktur dikonfirmasi · ${formatRupiah(h.total_nominal)}${adj}`
      );
      setConfirmTarget(null);
      if (expandedId === confirmTarget.id) {
        setExpandedId(null);
        setDetail(null);
        setEditingId(null);
      }
      await loadList();
      onChanged?.();
    } catch (err) {
      onToast?.(err.message || 'Gagal konfirmasi');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
        Memuat…
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
        Belum ada jadwal bayar. Centang faktur di Belum Dibayar lalu Simpan
        Jadwal Bayar.
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-1.5">
        {items.map((row) => {
          const open = expandedId === row.id;
          const isEditing = editingId === row.id;
          return (
            <article
              key={row.id}
              className="overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface"
            >
              <div className="px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleExpand(row.id)}
                  className="flex w-full items-start justify-between gap-2 text-left transition hover:opacity-90"
                >
                  <h3 className="min-w-0 truncate text-[13px] font-semibold leading-none text-text-primary">
                    {row.nama_supplier || '—'}
                  </h3>
                  <p className="shrink-0 text-[13px] font-medium leading-none text-accent-yellow">
                    {formatRupiah(
                      open && detail?.id === row.id
                        ? detail.total_rencana
                        : row.total_rencana
                    )}
                  </p>
                </button>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => toggleExpand(row.id)}
                    className="min-w-0 flex-1 text-left text-[11px] text-text-muted"
                  >
                    {row.jumlah_faktur || 0} faktur
                    {row.tanggal_rencana
                      ? ` · Jadwal ${formatTanggal(row.tanggal_rencana)}`
                      : ''}
                  </button>
                  {canTambah ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (detail?.id === row.id) setDeleteTarget(detail);
                              else setDeleteTarget(row);
                            }}
                            disabled={saving}
                            className="rounded-[4px] border border-state-error/40 px-2.5 py-1 text-[11px] font-medium text-state-error disabled:opacity-50"
                          >
                            Hapus
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={saving}
                            className="rounded-[4px] bg-accent-navy px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                          >
                            {saving ? '…' : 'Simpan'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleBayarClick(row)}
                            disabled={saving || confirming}
                            className="rounded-[4px] bg-accent-navy px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                          >
                            Bayar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(row.id)}
                            disabled={saving}
                            className="rounded-[4px] border border-border-subtle px-2.5 py-1 text-[11px] font-medium text-text-primary disabled:opacity-50"
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {open ? (
                <div className="border-t border-border-subtle bg-bg-base px-3 py-2">
                  {detailBusy && !detail ? (
                    <div className="flex justify-center py-3">
                      <SubmitSpinner className="h-4 w-4" />
                    </div>
                  ) : null}

                  {detail && detail.id === row.id ? (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block min-w-0">
                            <span className="sr-only">Metode bayar</span>
                            <select
                              value={editMetode}
                              onChange={(e) => setEditMetode(e.target.value)}
                              disabled={saving || !isEditing}
                              className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow disabled:opacity-70"
                            >
                              {METODE_BAYAR_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block min-w-0">
                            <span className="sr-only">Tanggal Bayar</span>
                            <div className="relative">
                              <span className="pointer-events-none absolute inset-y-0 left-2.5 z-[1] flex items-center text-[13px] text-text-primary">
                                {editTanggal
                                  ? formatTanggal(editTanggal)
                                  : 'Tanggal Bayar'}
                              </span>
                              <input
                                type="date"
                                value={editTanggal}
                                onChange={(e) => setEditTanggal(e.target.value)}
                                disabled={saving || !isEditing}
                                className="relative z-0 w-full rounded-[4px] border border-border-subtle bg-bg-surface py-1.5 pl-2.5 pr-2 text-[13px] text-transparent outline-none focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow disabled:opacity-70 [&::-webkit-calendar-picker-indicator]:ml-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-datetime-edit]:text-transparent [&::-webkit-datetime-edit-fields-wrapper]:text-transparent"
                              />
                            </div>
                          </label>
                        </div>
                        <label className="block">
                          <span className="sr-only">Catatan</span>
                          <input
                            type="text"
                            value={editCatatan}
                            onChange={(e) => setEditCatatan(e.target.value)}
                            disabled={saving || !isEditing}
                            placeholder="Catatan"
                            className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-2.5 py-1.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow disabled:opacity-70"
                          />
                        </label>
                      </div>

                      <ul className="space-y-1.5">
                        {(detail.items || []).map((it) => {
                          const usiaHari = formatUsiaFakturHari(
                            it.tanggal_faktur
                          );
                          return (
                            <li
                              key={it.faktur_id}
                              className={`rounded-[4px] border px-2.5 py-2 ${
                                it.is_reset
                                  ? 'border-state-warning/50 bg-state-warning/5'
                                  : 'border-border-subtle bg-bg-surface'
                              }`}
                            >
                              <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1">
                                <p className="min-w-0 truncate text-[11px] text-text-secondary">
                                  {formatTanggal(it.tanggal_faktur)}
                                  {usiaHari ? ` - ${usiaHari}` : ''}
                                </p>
                                <div className="flex items-center justify-end gap-1">
                                  <span className="text-[11px] font-normal text-text-secondary">
                                    Sisa Hutang{' '}
                                    <span className="font-semibold tabular-nums">
                                      {formatRupiah(it.sisa_hutang)}
                                    </span>
                                  </span>
                                  {canTambah && isEditing ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRemoveItem(it.faktur_id)
                                      }
                                      disabled={saving}
                                      className="rounded-[4px] p-0.5 text-text-muted hover:bg-state-error/10 hover:text-state-error disabled:opacity-50"
                                      aria-label="Keluarkan dari jadwal"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                                <p className="min-w-0 truncate text-[12px] font-semibold leading-snug text-text-primary">
                                  {it.no_faktur || '—'}
                                </p>
                                <div className="flex items-center justify-end gap-1.5">
                                  {isEditing ? (
                                    <>
                                      <span className="text-[11px] text-text-muted">
                                        Dibayar
                                      </span>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        value={editNominals[it.faktur_id] ?? ''}
                                        onChange={(e) =>
                                          setEditNominals((prev) => ({
                                            ...prev,
                                            [it.faktur_id]: formatNominalInput(
                                              e.target.value
                                            ),
                                          }))
                                        }
                                        disabled={saving}
                                        placeholder="0"
                                        className="w-[9rem] rounded-[4px] border border-border-subtle bg-bg-base px-2 py-1 text-right text-[12px] font-semibold tabular-nums text-text-primary outline-none focus:border-accent-yellow"
                                      />
                                    </>
                                  ) : (
                                    <span className="text-[12px] font-normal text-accent-yellow">
                                      Dibayar{' '}
                                      <span className="font-semibold tabular-nums">
                                        {formatRupiah(
                                          parseNominalInput(
                                            editNominals[it.faktur_id]
                                          ) || it.nominal_rencana
                                        )}
                                      </span>
                                    </span>
                                  )}
                                </div>
                              </div>
                              {it.is_reset ? (
                                <p className="mt-1 text-[10px] font-medium text-state-warning">
                                  Nominal disesuaikan, ada pembayaran baru masuk
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {deleteTarget ? (
        <ConfirmDeleteModal
          confirmName={deleteTarget.nama_supplier || 'draft'}
          title="Hapus Jadwal Bayar"
          entityLabel="supplier"
          submitting={deleting}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      <ConfirmActionModal
        open={Boolean(confirmTarget)}
        title="Konfirmasi Sudah Dibayar"
        description={
          confirmTarget
            ? `Bayar ${confirmTarget.jumlah_faktur || confirmTarget.items?.length || 0} faktur ${confirmTarget.nama_supplier || ''} sebesar ${formatRupiah(confirmTarget.total_rencana)}? Nominal mengikuti jadwal (Dibayar), dibatasi sisa hutang terkini.`
            : ''
        }
        confirmLabel="Ya, Sudah Dibayar"
        submitting={confirming}
        onClose={() => {
          if (!confirming) setConfirmTarget(null);
        }}
        onConfirm={handleConfirmBayar}
      />
    </>
  );
}
