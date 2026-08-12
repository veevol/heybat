import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  getRencanaBayar,
  hapusPembayaran,
  hapusRencanaBayar,
  listFakturHutang,
  listPembayaranFaktur,
  listPembelianFaktur,
  listPembelianFakturItems,
  simpanRencanaBayar,
  editPembayaran,
  updateRencanaBayar,
} from '../api/pembelian';
import AppShell from '../components/layout/AppShell';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import PembayaranFormSheet from '../components/PembayaranFormSheet';
import PembelianUploadSheet from '../components/PembelianUploadSheet';
import RencanaBayarPanel from '../components/RencanaBayarPanel';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 20;

const HUTANG_STATUS_FILTERS = [
  { id: 'riwayat', label: 'Riwayat' },
  { id: 'belum_bayar', label: 'Hutang' },
  { id: 'rencana_bayar', label: 'Jadwal' },
  { id: 'lunas', label: 'Lunas' },
];

function formatRupiah(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(num);
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return new Intl.NumberFormat('id-ID').format(num);
}

/** Angka dibulatkan ke bilangan bulat terdekat (harga / HPP / total) */
function formatRounded(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('id-ID').format(Math.round(num));
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

/** Usia faktur dalam hari sejak tanggal_faktur sampai tanggalAkhir (default: hari ini, Asia/Jakarta) */
function formatUsiaFakturHari(tanggalFaktur, tanggalAkhir = null) {
  if (!tanggalFaktur) return null;
  const raw = String(tanggalFaktur);
  const start =
    raw.length <= 10
      ? new Date(`${raw.slice(0, 10)}T00:00:00+07:00`)
      : new Date(raw);
  if (Number.isNaN(start.getTime())) return null;

  let end;
  if (tanggalAkhir) {
    const endRaw = String(tanggalAkhir);
    end =
      endRaw.length <= 10
        ? new Date(`${endRaw.slice(0, 10)}T00:00:00+07:00`)
        : new Date(endRaw);
    if (Number.isNaN(end.getTime())) return null;
  } else {
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    end = new Date(`${todayStr}T00:00:00+07:00`);
  }

  const diffDays = Math.round((end.getTime() - start.getTime()) / 86400000);

  if (!Number.isFinite(diffDays) || diffDays < 0) return '0 D';
  return `${diffDays} D`;
}

/** Gabung diskon_1/2/3: "10%", "10% + 5%", atau "-" */
function formatDiskon(d1, d2, d3) {
  const parts = [d1, d2, d3]
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => `${n}%`);
  if (!parts.length) return '-';
  return parts.join(' + ');
}

function BayarBadge({ jenis }) {
  const raw = String(jenis || '').toUpperCase();
  if (raw === 'TUNAI') {
    return (
      <span className="inline-flex rounded-[4px] bg-state-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-success">
        TUNAI
      </span>
    );
  }
  if (raw === 'HUTANG') {
    return (
      <span className="inline-flex rounded-[4px] bg-state-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning">
        HUTANG
      </span>
    );
  }
  if (!raw) return null;
  return (
    <span className="inline-flex rounded-[4px] bg-bg-base px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">
      {raw}
    </span>
  );
}

function FakturCard({ faktur, expanded, onToggle }) {
  const [items, setItems] = useState(null);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [itemsError, setItemsError] = useState('');
  const [itemsHasMore, setItemsHasMore] = useState(false);
  const loadedForId = useRef(null);

  useEffect(() => {
    if (!expanded) return;
    if (loadedForId.current === faktur.id) return;

    let cancelled = false;
    async function load() {
      setItemsBusy(true);
      setItemsError('');
      try {
        const data = await listPembelianFakturItems(faktur.id, {
          limit: 100,
          offset: 0,
        });
        if (cancelled) return;
        setItems(data.items || []);
        setItemsHasMore(Boolean(data.has_more));
        loadedForId.current = faktur.id;
      } catch (err) {
        if (cancelled) return;
        setItemsError(err.message || 'Gagal memuat item');
        setItems(null);
      } finally {
        if (!cancelled) setItemsBusy(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [expanded, faktur.id]);

  async function loadMoreItems() {
    if (!items || itemsBusy || !itemsHasMore) return;
    setItemsBusy(true);
    setItemsError('');
    try {
      const data = await listPembelianFakturItems(faktur.id, {
        limit: 100,
        offset: items.length,
      });
      setItems((prev) => [...(prev || []), ...(data.items || [])]);
      setItemsHasMore(Boolean(data.has_more));
    } catch (err) {
      setItemsError(err.message || 'Gagal memuat item');
    } finally {
      setItemsBusy(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2.5 text-left transition hover:bg-bg-surface-hover"
      >
        {/* Baris atas: Nama PBF + badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-[13px] font-semibold leading-none text-text-primary">
            {faktur.nama_supplier || '—'}
          </h3>
          <BayarBadge jenis={faktur.jenis_bayar} />
        </div>

        {/* Baris tengah: No Faktur kiri, Tanggal kanan */}
        <div className="mt-1.5 flex items-start justify-between gap-2 text-[11px] leading-snug">
          <p className="min-w-0 truncate text-text-secondary">
            {faktur.no_faktur || '—'}
          </p>
          <p className="shrink-0 whitespace-nowrap text-text-secondary">
            {formatTanggal(faktur.tanggal_faktur)}
          </p>
        </div>

        {/* Baris bawah: Total + jumlah item */}
        <div className="mt-1.5 flex items-end justify-between gap-2">
          <p className="text-[11px] text-text-muted">
            {formatNumber(faktur.jumlah_item ?? 0)} item
          </p>
          <p className="shrink-0 text-[13px] font-medium leading-none text-accent-yellow">
            {formatRupiah(faktur.total_transaksi)}
          </p>
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-border-subtle bg-bg-base px-3 py-2">
          {itemsBusy && !items ? (
            <div className="flex justify-center py-3">
              <SubmitSpinner className="h-4 w-4" />
            </div>
          ) : null}
          {itemsError ? (
            <p className="py-2 text-[12px] text-state-error">{itemsError}</p>
          ) : null}
          {items?.length === 0 ? (
            <p className="py-2 text-[12px] text-text-muted">Tidak ada item</p>
          ) : null}
          {items?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-text-secondary">
                  <tr>
                    <th className="pb-1.5 pr-2 font-medium">NAMA OBAT</th>
                    <th className="w-px whitespace-nowrap pb-1.5 pl-1.5 pr-1 font-medium">
                      SAT
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 px-1 font-medium text-right">
                      JML
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 px-1 font-medium text-right">
                      HARGA
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 px-1 font-medium text-center">
                      DISK
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 px-1 font-medium text-right">
                      HPP
                    </th>
                    <th className="w-px whitespace-nowrap pb-1.5 pl-1 font-medium text-right">
                      TOTAL
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr
                      key={it.id}
                      className="border-t border-border-subtle/50 align-top"
                    >
                      <td className="py-1.5 pr-2 text-text-primary">
                        <div className="font-medium leading-snug">
                          {it.nama_obat || it.kode_obat}
                        </div>
                      </td>
                      <td className="whitespace-nowrap py-1.5 pl-1.5 pr-1 text-text-secondary">
                        {it.satuan || '—'}
                      </td>
                      <td className="whitespace-nowrap py-1.5 px-1 text-right text-text-secondary">
                        {formatNumber(it.jumlah)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 px-1 text-right text-text-secondary">
                        {formatRounded(it.harga)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 px-1 text-center text-text-secondary">
                        {formatDiskon(it.diskon_1, it.diskon_2, it.diskon_3)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 px-1 text-right text-text-secondary">
                        {it.hpp === null ||
                        it.hpp === undefined ||
                        it.hpp === ''
                          ? '—'
                          : formatRounded(it.hpp)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pl-1 text-right font-semibold text-text-primary">
                        {(() => {
                          const hpp = Number(it.hpp);
                          const qty = Number(it.jumlah);
                          if (!Number.isFinite(hpp) || !Number.isFinite(qty)) {
                            return '—';
                          }
                          return formatRounded(hpp * qty);
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {itemsHasMore ? (
            <button
              type="button"
              onClick={loadMoreItems}
              disabled={itemsBusy}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[12px] font-medium text-text-primary disabled:opacity-50"
            >
              {itemsBusy ? <SubmitSpinner className="h-3.5 w-3.5" /> : null}
              Muat lagi
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function HutangStatusBadge({ status }) {
  const raw = String(status || '').toLowerCase();
  if (raw === 'lunas') {
    return (
      <span className="inline-flex rounded-[4px] bg-state-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-success">
        Lunas
      </span>
    );
  }
  if (raw === 'terjadwal') {
    return (
      <span className="inline-flex rounded-[4px] bg-accent-cyan/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-cyan">
        Terjadwal
      </span>
    );
  }
  if (raw === 'cicilan') {
    return (
      <span className="inline-flex rounded-[4px] bg-state-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning">
        Cicilan
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-[4px] bg-state-error/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-error">
      Belum Bayar
    </span>
  );
}

function HutangCard({
  faktur,
  expanded,
  onToggle,
  selected = false,
  selectable = false,
  onSelectChange,
  canEdit,
  canHapus,
  onEdit,
  onHapus,
}) {
  const [payments, setPayments] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadedForId = useRef(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const data = await listPembayaranFaktur(faktur.id);
      setPayments(data.items || []);
      loadedForId.current = faktur.id;
    } catch (err) {
      setError(err.message || 'Gagal memuat pembayaran');
      setPayments(null);
    } finally {
      setBusy(false);
    }
  }, [faktur.id]);

  useEffect(() => {
    if (!expanded) return;
    if (loadedForId.current === faktur.id && payments) return;
    reload();
  }, [expanded, faktur.id, payments, reload]);

  const isLunas = String(faktur.status || '').toLowerCase() === 'lunas';
  const usiaFaktur = formatUsiaFakturHari(
    faktur.tanggal_faktur,
    isLunas ? faktur.tanggal_lunas : null
  );

  return (
    <article
      className={`overflow-hidden rounded-[4px] border bg-bg-surface ${
        selected ? 'border-accent-yellow/60' : 'border-border-subtle'
      }`}
    >
      <div className="flex items-stretch">
        {selectable ? (
          <label className="flex shrink-0 items-start px-2.5 pt-3">
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelectChange?.(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="mt-0.5 h-4 w-4 accent-accent-yellow"
              aria-label={`Pilih ${faktur.no_faktur || 'faktur'}`}
            />
          </label>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className={`min-w-0 flex-1 py-2.5 text-left transition hover:bg-bg-surface-hover ${
            selectable ? 'pr-3 pl-0' : 'px-3'
          }`}
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1">
            <h3 className="min-w-0 truncate text-[13px] font-semibold leading-snug text-text-primary">
              {faktur.nama_supplier || '—'}
            </h3>
            <div className="flex shrink-0 items-center justify-end gap-1.5">
              {usiaFaktur ? (
                <span className="whitespace-nowrap text-[11px] text-text-muted">
                  {usiaFaktur}
                </span>
              ) : null}
              <HutangStatusBadge status={faktur.status} />
            </div>
            <p className="min-w-0 truncate text-[11px] leading-snug text-text-secondary">
              {formatTanggal(faktur.tanggal_faktur)}
            </p>
            <p className="shrink-0 text-right text-[11px] font-semibold tabular-nums leading-snug text-text-primary">
              {formatRupiah(faktur.total_transaksi)}
            </p>
            <p className="min-w-0 truncate text-[11px] leading-snug text-text-secondary">
              {faktur.no_faktur || '—'}
            </p>
            <p className="shrink-0 text-right text-[13px] font-semibold tabular-nums leading-snug text-accent-yellow">
              {formatRupiah(faktur.sisa_hutang)}
            </p>
          </div>
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-border-subtle bg-bg-base px-3 py-2">
          {busy && !payments ? (
            <div className="flex justify-center py-3">
              <SubmitSpinner className="h-4 w-4" />
            </div>
          ) : null}
          {error ? (
            <p className="py-2 text-[12px] text-state-error">{error}</p>
          ) : null}
          {payments?.length === 0 ? (
            <p className="py-2 text-[12px] text-text-muted">
              Belum ada pembayaran
            </p>
          ) : null}
          {payments?.length > 0 ? (
            <ul className="space-y-1">
              {payments.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-2.5 py-1.5"
                >
                  <p className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
                    {formatTanggal(p.tanggal_bayar)}
                    {p.metode_bayar ? ` · ${p.metode_bayar}` : ''}
                    {p.catatan ? ` · ${p.catatan}` : ''}
                  </p>
                  {p.ditandai_lunas_manual ? (
                    <span className="shrink-0 rounded-[4px] bg-state-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-state-success">
                      Lunas manual
                    </span>
                  ) : null}
                  {canEdit || canHapus ? (
                    <div className="flex shrink-0 gap-0.5">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => onEdit?.(p)}
                          className="rounded-[4px] p-1.5 text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary"
                          aria-label="Edit pembayaran"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {canHapus ? (
                        <button
                          type="button"
                          onClick={() => onHapus?.(p)}
                          className="rounded-[4px] p-1.5 text-state-error hover:bg-state-error/10"
                          aria-label="Hapus pembayaran"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function PembelianPage() {
  const { hasAccess } = useAuth();
  const canTambah = hasAccess('pembelian', 'tambah');
  const canEdit = hasAccess('pembelian', 'edit');
  const canHapus = hasAccess('pembelian', 'hapus');

  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);
  const menuRef = useRef(null);

  // Hutang / filter tab (riwayat | belum_bayar | rencana_bayar | lunas)
  const [hutangItems, setHutangItems] = useState([]);
  const [hutangHasMore, setHutangHasMore] = useState(false);
  const [hutangLoading, setHutangLoading] = useState(false);
  const [hutangLoadingMore, setHutangLoadingMore] = useState(false);
  const [hutangStatus, setHutangStatus] = useState('riwayat');
  const [hutangExpandedId, setHutangExpandedId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('tambah');
  const [formFaktur, setFormFaktur] = useState(null);
  const [formInitial, setFormInitial] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [rencanaBusy, setRencanaBusy] = useState(false);
  const [rencanaPanelKey, setRencanaPanelKey] = useState(0);
  const [rencanaSummary, setRencanaSummary] = useState({
    total: 0,
    jumlah_faktur: 0,
    jumlah_draft: 0,
  });
  const [hutangSummary, setHutangSummary] = useState({
    jumlah_pbf: 0,
    jumlah_faktur: 0,
    total_hutang: 0,
  });

  const showToast = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }, []);

  useEffect(() => {
    if (query.trim() !== debouncedQ) setSearchLoading(true);
    const t = setTimeout(() => setDebouncedQ(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query, debouncedQ]);

  const loadPage = useCallback(
    async ({ offset = 0, append = false, q = debouncedQ } = {}) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const data = await listPembelianFaktur({
          limit: PAGE_SIZE,
          offset,
          q,
        });
        const next = data.items || [];
        setItems((prev) => (append ? [...prev, ...next] : next));
        setHasMore(Boolean(data.has_more));
      } catch (err) {
        showToast(err.message || 'Gagal memuat pembelian');
        if (!append) {
          setItems([]);
          setHasMore(false);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setSearchLoading(false);
      }
    },
    [debouncedQ, showToast]
  );

  const loadHutangPage = useCallback(
    async ({ offset = 0, append = false, status = hutangStatus } = {}) => {
      if (status === 'rencana_bayar' || status === 'riwayat') {
        setHutangLoading(false);
        setHutangLoadingMore(false);
        return;
      }
      if (append) setHutangLoadingMore(true);
      else setHutangLoading(true);
      try {
        const data = await listFakturHutang({
          limit: PAGE_SIZE,
          offset,
          status,
        });
        const next = data.items || [];
        setHutangItems((prev) => (append ? [...prev, ...next] : next));
        setHutangHasMore(Boolean(data.has_more));
        if (!append && data.summary) {
          setHutangSummary({
            jumlah_pbf: Number(data.summary.jumlah_pbf) || 0,
            jumlah_faktur: Number(data.summary.jumlah_faktur) || 0,
            total_hutang: Number(data.summary.total_hutang) || 0,
          });
        } else if (!append) {
          setHutangSummary({
            jumlah_pbf: 0,
            jumlah_faktur: 0,
            total_hutang: 0,
          });
        }
        // Auto-centang faktur yang sudah Terjadwal
        setSelectedIds((prev) => {
          const base = append ? new Set(prev) : new Set();
          for (const f of next) {
            if (String(f.status || '').toLowerCase() === 'terjadwal') {
              base.add(f.id);
            }
          }
          return base;
        });
      } catch (err) {
        showToast(err.message || 'Gagal memuat faktur hutang');
        if (!append) {
          setHutangItems([]);
          setHutangHasMore(false);
        }
      } finally {
        setHutangLoading(false);
        setHutangLoadingMore(false);
      }
    },
    [hutangStatus, showToast]
  );

  useEffect(() => {
    if (hutangStatus !== 'riwayat') return;
    setExpandedId(null);
    setSelectedIds(new Set());
    loadPage({ offset: 0, append: false });
  }, [hutangStatus, loadPage]);

  useEffect(() => {
    if (hutangStatus === 'riwayat') return;
    setHutangExpandedId(null);
    if (hutangStatus === 'rencana_bayar') {
      setSelectedIds(new Set());
      return;
    }
    loadHutangPage({ offset: 0, append: false });
  }, [loadHutangPage, hutangStatus]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDoc(e) {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function handleUploadSuccess() {
    setExpandedId(null);
    setHutangStatus('riwayat');
    loadPage({ offset: 0, append: false });
  }

  function openEditPembayaran(faktur, payment) {
    setFormMode('edit');
    setFormFaktur(faktur);
    setFormInitial(payment);
    setFormOpen(true);
  }

  async function handleFormSubmit(body) {
    if (!formFaktur || formBusy) return;
    if (formMode !== 'edit' || !formInitial?.id) return;
    setFormBusy(true);
    try {
      await editPembayaran(formInitial.id, body);
      showToast('Pembayaran diperbarui');
      setFormOpen(false);
      setFormInitial(null);
      await loadHutangPage({ offset: 0, append: false });
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan pembayaran');
    } finally {
      setFormBusy(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await hapusPembayaran(deleteTarget.id);
      showToast('Pembayaran dihapus');
      setDeleteTarget(null);
      await loadHutangPage({ offset: 0, append: false });
    } catch (err) {
      showToast(err.message || 'Gagal menghapus pembayaran');
    } finally {
      setDeleting(false);
    }
  }

  function toggleSelect(fakturId, checked) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(fakturId);
      else next.delete(fakturId);
      return next;
    });
  }

  async function handleSelectChange(faktur, checked) {
    if (
      !checked &&
      String(faktur.status || '').toLowerCase() === 'terjadwal' &&
      faktur.rencana_bayar_id &&
      canTambah
    ) {
      try {
        const data = await getRencanaBayar(faktur.rencana_bayar_id);
        const draft = data.item;
        const remaining = (draft.items || []).filter(
          (it) => it.faktur_id !== faktur.id
        );
        if (!remaining.length) {
          await hapusRencanaBayar(faktur.rencana_bayar_id);
          showToast('Faktur dikeluarkan — draft kosong dihapus');
        } else {
          await updateRencanaBayar(faktur.rencana_bayar_id, {
            tanggal_rencana: draft.tanggal_rencana,
            metode_bayar: draft.metode_bayar,
            catatan: draft.catatan,
            items: remaining.map((it) => ({
              faktur_id: it.faktur_id,
              nominal_rencana: it.nominal_rencana,
            })),
          });
          showToast('Faktur dikeluarkan dari jadwal');
        }
        toggleSelect(faktur.id, false);
        await loadHutangPage({ offset: 0, append: false });
        setRencanaPanelKey((k) => k + 1);
      } catch (err) {
        showToast(err.message || 'Gagal mengeluarkan dari jadwal');
      }
      return;
    }
    toggleSelect(faktur.id, checked);
  }

  const selectedFakturList = hutangItems.filter((f) => selectedIds.has(f.id));
  const selectedSisaSum = selectedFakturList.reduce((sum, f) => {
    const n = Number(f.sisa_hutang);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  async function handleSimpanRencana() {
    if (rencanaBusy || !selectedFakturList.length) return;
    setRencanaBusy(true);
    try {
      const data = await simpanRencanaBayar({
        metode_bayar: 'Flip',
        items: selectedFakturList.map((f) => ({
          faktur_id: f.id,
          nominal_rencana: Number(f.sisa_hutang) || undefined,
        })),
      });
      const n = data?.jumlah_draft ?? data?.drafts?.length ?? 0;
      showToast(
        n > 1
          ? `${n} jadwal bayar disimpan (per PBF)`
          : 'Jadwal bayar disimpan'
      );
      await loadHutangPage({ offset: 0, append: false });
      setRencanaPanelKey((k) => k + 1);
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan jadwal');
    } finally {
      setRencanaBusy(false);
    }
  }

  const navLoading =
    (hutangStatus === 'riwayat' && loading) ||
    (hutangStatus !== 'riwayat' &&
      hutangStatus !== 'rencana_bayar' &&
      hutangLoading);

  return (
    <AppShell
      title="Pembelian"
      navLoading={navLoading}
      actions={
        canTambah ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary transition hover:bg-bg-surface-hover hover:text-text-primary"
              aria-label="Menu pembelian"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[12rem] overflow-hidden rounded-[4px] border border-border-subtle bg-bg-surface shadow-lg shadow-black/40"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setUploadOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-text-primary transition hover:bg-bg-surface-hover"
                >
                  <Upload className="h-3.5 w-3.5 text-accent-yellow" />
                  Upload Pembelian
                </button>
              </div>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="sticky top-12 z-20 -mx-3 mb-3 space-y-2 bg-bg-surface/80 px-3 pb-2 pt-1 backdrop-blur-md">
        <div className="flex gap-1 overflow-x-auto rounded-[4px] border border-border-subtle bg-bg-surface p-0.5">
          {HUTANG_STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setHutangStatus(f.id);
                if (f.id === 'rencana_bayar') {
                  setRencanaPanelKey((k) => k + 1);
                }
              }}
              className={`shrink-0 rounded-[4px] px-2.5 py-1.5 text-[12px] font-medium ${
                hutangStatus === f.id
                  ? 'bg-accent-navy text-white'
                  : 'text-text-secondary hover:bg-bg-surface-hover'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {hutangStatus === 'riwayat' ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari faktur, supplier, atau nama obat…"
              className="w-full rounded-[4px] border border-border-subtle bg-bg-surface py-1.5 pl-10 pr-9 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow"
            />
            {searchLoading || (loading && Boolean(query.trim())) ? (
              <SubmitSpinner className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-accent-yellow" />
            ) : null}
          </div>
        ) : null}
        {hutangStatus === 'rencana_bayar' ? (
          <div className="flex items-center justify-between gap-3 px-0.5 py-1">
            <p className="min-w-0 truncate text-[12px] text-text-secondary">
              {rencanaSummary.jumlah_draft || 0} PBF,{' '}
              {rencanaSummary.jumlah_faktur || 0} Faktur
            </p>
            <p className="shrink-0 text-[13px] font-semibold tabular-nums text-accent-yellow">
              {formatRupiah(rencanaSummary.total)}
            </p>
          </div>
        ) : hutangStatus === 'belum_bayar' ? (
          <div className="flex items-center justify-between gap-3 px-0.5 py-1">
            <p className="min-w-0 truncate text-[12px] text-text-secondary">
              {hutangSummary.jumlah_pbf || 0} PBF,{' '}
              {hutangSummary.jumlah_faktur || 0} Faktur
            </p>
            <p className="shrink-0 text-[13px] font-semibold tabular-nums text-accent-yellow">
              {formatRupiah(hutangSummary.total_hutang)}
            </p>
          </div>
        ) : null}
      </div>

      {hutangStatus === 'riwayat' ? (
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Memuat…
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              {debouncedQ
                ? 'Tidak ada faktur yang cocok.'
                : 'Belum ada data pembelian.'}
              {!debouncedQ && canTambah
                ? ' Buka menu titik tiga → Upload Pembelian untuk mengunggah Excel Vmedis.'
                : ''}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-1.5">
              {items.map((faktur) => (
                <FakturCard
                  key={faktur.id}
                  faktur={faktur}
                  expanded={expandedId === faktur.id}
                  onToggle={() =>
                    setExpandedId((cur) =>
                      cur === faktur.id ? null : faktur.id
                    )
                  }
                />
              ))}
              {hasMore ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() =>
                    loadPage({ offset: items.length, append: true })
                  }
                  className="flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] font-medium text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
                >
                  {loadingMore ? (
                    <SubmitSpinner className="h-4 w-4" />
                  ) : null}
                  Muat lagi
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : hutangStatus === 'rencana_bayar' ? (
        <div className="space-y-3">
          <RencanaBayarPanel
            key={rencanaPanelKey}
            canTambah={canTambah}
            onToast={showToast}
            onSummaryChange={setRencanaSummary}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {hutangLoading ? (
            <div className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Memuat…
            </div>
          ) : hutangItems.length === 0 ? (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-8 text-center text-[13px] text-text-secondary">
              Tidak ada faktur hutang untuk filter ini.
            </div>
          ) : (
            <>
              <div
                className={`grid grid-cols-1 gap-1.5 ${
                  selectedIds.size > 0 && canTambah ? 'pb-20' : ''
                }`}
              >
                {hutangItems.map((faktur) => {
                  const sisa = Number(faktur.sisa_hutang);
                  const status = String(faktur.status || '').toLowerCase();
                  const canSelect =
                    canTambah &&
                    status !== 'lunas' &&
                    (status === 'terjadwal' ||
                      (Number.isFinite(sisa) && sisa > 0));
                  return (
                    <HutangCard
                      key={`${faktur.id}-${faktur.status}-${faktur.sisa_hutang}-${faktur.jumlah_pembayaran}-${faktur.rencana_bayar_id || ''}`}
                      faktur={faktur}
                      expanded={hutangExpandedId === faktur.id}
                      onToggle={() =>
                        setHutangExpandedId((cur) =>
                          cur === faktur.id ? null : faktur.id
                        )
                      }
                      selectable={canSelect}
                      selected={selectedIds.has(faktur.id)}
                      onSelectChange={(checked) =>
                        handleSelectChange(faktur, checked)
                      }
                      canEdit={canEdit}
                      canHapus={canHapus}
                      onEdit={(p) => openEditPembayaran(faktur, p)}
                      onHapus={(p) => setDeleteTarget(p)}
                    />
                  );
                })}
                {hutangHasMore ? (
                  <button
                    type="button"
                    disabled={hutangLoadingMore}
                    onClick={() =>
                      loadHutangPage({
                        offset: hutangItems.length,
                        append: true,
                      })
                    }
                    className="flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-[13px] font-medium text-text-primary hover:bg-bg-surface-hover disabled:opacity-50"
                  >
                    {hutangLoadingMore ? (
                      <SubmitSpinner className="h-4 w-4" />
                    ) : null}
                    Muat lagi
                  </button>
                ) : null}
              </div>
              {canTambah && selectedIds.size > 0 ? (
                <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border-subtle bg-bg-surface/95 px-3 py-2.5 backdrop-blur-md">
                  <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-text-primary">
                        {selectedIds.size} faktur dipilih
                      </p>
                      <p className="truncate text-[11px] text-text-secondary">
                        Sisa {formatRupiah(selectedSisaSum)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSimpanRencana}
                      disabled={rencanaBusy}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
                    >
                      {rencanaBusy ? (
                        <SubmitSpinner className="h-3.5 w-3.5" />
                      ) : null}
                      Simpan Jadwal Bayar
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      <PembelianUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        onToast={showToast}
      />

      <PembayaranFormSheet
        open={formOpen}
        mode={formMode}
        initial={formInitial}
        fakturLabel={
          formFaktur
            ? `${formFaktur.no_faktur || ''} · ${formFaktur.nama_supplier || ''}`
            : ''
        }
        submitting={formBusy}
        onClose={() => {
          if (!formBusy) {
            setFormOpen(false);
            setFormInitial(null);
          }
        }}
        onSubmit={handleFormSubmit}
      />

      {deleteTarget ? (
        <ConfirmDeleteModal
          confirmName={formatRupiah(deleteTarget.nominal)}
          title="Hapus Pembayaran"
          entityLabel="nominal"
          submitting={deleting}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      <Toast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
