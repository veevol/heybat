import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  batalkanDokumenSp,
  generateDokumenSp,
  getDokumenSpBreakdown,
  kirimDokumenSp,
  listDokumenSp,
} from '../api/dokumenSp';
import { getForecastHasil, resetDefektaPilihan } from '../api/forecast';
import AppShell from '../components/layout/AppShell';
import PembuatanSpCard from '../components/PembuatanSpCard';
import RiwayatSpModal from '../components/RiwayatSpModal';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';

const DELETE_CONCURRENCY = 15;

/** Semua kode_obat yang punya pilihan disetujui untuk supplierId ini (dari GET hasil forecast). */
function extractKodeObatForSupplier(hasil, supplierId) {
  const list = [];
  for (const grup of hasil?.grup || []) {
    for (const obat of grup.obat || []) {
      const found = (obat.pilihan_disetujui || []).some(
        (p) => p.supplier_id === supplierId
      );
      if (found) list.push(obat.kode_obat);
    }
  }
  return list;
}

/** Hapus banyak pilihan lewat endpoint per-obat yang sudah ada (bukan endpoint baru), dengan concurrency terbatas. */
async function batchResetPilihan(runId, supplierId, kodeObatList) {
  let idx = 0;
  async function worker() {
    while (idx < kodeObatList.length) {
      const i = idx;
      idx += 1;
      await resetDefektaPilihan(runId, kodeObatList[i], supplierId);
    }
  }
  const workerCount = Math.min(DELETE_CONCURRENCY, kodeObatList.length) || 0;
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

/** Normalisasi nomor telp Indonesia ke format wa.me (62xxxxxxxxxx, tanpa +/spasi). */
function toWaPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

function buildPesanWa(card, nomorSpList) {
  const salutation =
    card.supplier_jenis_kelamin_sales === 'L'
      ? 'Bapak '
      : card.supplier_jenis_kelamin_sales === 'P'
        ? 'Ibu '
        : '';
  const tujuan = card.supplier_nama_sales
    ? `${salutation}${card.supplier_nama_sales}`
    : card.supplier_nama || 'Bapak/Ibu';
  const nomorText = nomorSpList.length > 0 ? ` ${nomorSpList.join(', ')}` : '';
  return `Yth. ${tujuan}, berikut kami kirimkan Surat Pesanan${nomorText} dari Apotek Yelo.`;
}

export default function PembuatanSpPage() {
  const { runId } = useParams();
  const navigate = useNavigate();

  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  /** Kategori split (Gabung/Pisah) per supplier_id — state lokal sebelum digenerate. */
  const [pisahBySupplier, setPisahBySupplier] = useState({});
  /** Setuju/Batal per supplier_id — default true selama card masih tampil. */
  const [setujuBySupplier, setSetujuBySupplier] = useState({});
  /** supplier_id yang barusan dibatalkan (Setuju→Batal) sesi ini — card tetap tampil, aksi disembunyikan. */
  const [dibatalkanSet, setDibatalkanSet] = useState(() => new Set());
  /** supplier_id -> label proses berjalan (null kalau idle). */
  const [busyBySupplier, setBusyBySupplier] = useState({});
  /** supplier_id -> dokumen_sp versi terbaru (dari generate baru atau prefetch riwayat). */
  const [docsBySupplier, setDocsBySupplier] = useState({});
  /** Modal "Lihat riwayat SP" — { supplierId, supplierNama } | null. */
  const [riwayatModal, setRiwayatModal] = useState(null);
  const [riwayatLoading, setRiwayatLoading] = useState(false);
  const [riwayatError, setRiwayatError] = useState(null);
  const [riwayatDokumen, setRiwayatDokumen] = useState([]);

  function setBusy(supplierId, label) {
    setBusyBySupplier((prev) => ({ ...prev, [supplierId]: label }));
  }

  const loadBreakdown = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDokumenSpBreakdown(runId);
      const list = data?.cards || [];
      setCards(list);
      setPisahBySupplier((prev) => {
        const next = { ...prev };
        for (const c of list) {
          if (next[c.supplier_id] === undefined) {
            next[c.supplier_id] = c.lock?.kategori_dipilih === 'pisah';
          }
        }
        return next;
      });
      setSetujuBySupplier((prev) => {
        const next = { ...prev };
        for (const c of list) {
          if (next[c.supplier_id] === undefined) next[c.supplier_id] = true;
        }
        return next;
      });
    } catch (err) {
      setError(err.message || 'Gagal memuat breakdown Pembuatan SP');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    loadBreakdown();
  }, [loadBreakdown]);

  // Prefetch dokumen versi terbaru untuk card yang sudah locked (dari kunjungan
  // sebelumnya) supaya link unduh & Kirim WA langsung siap tanpa nunggu klik.
  useEffect(() => {
    const toFetch = cards.filter(
      (c) => c.lock?.locked && docsBySupplier[c.supplier_id] === undefined
    );
    if (toFetch.length === 0) return undefined;
    let cancelled = false;
    (async () => {
      for (const c of toFetch) {
        try {
          const res = await listDokumenSp(runId, c.supplier_id);
          if (cancelled) return;
          const docs = res?.dokumen || [];
          const versiTerbaru = docs.length
            ? Math.max(...docs.map((d) => d.versi))
            : null;
          const latest = docs.filter((d) => d.versi === versiTerbaru);
          setDocsBySupplier((prev) =>
            prev[c.supplier_id] === undefined
              ? { ...prev, [c.supplier_id]: latest }
              : prev
          );
        } catch {
          // riwayat lengkap tetap bisa dibuka manual nanti, tidak perlu blocking error
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, runId]);

  function handleTogglePisah(supplierId, value) {
    setPisahBySupplier((prev) => ({ ...prev, [supplierId]: value }));
  }

  async function handleToggleSetuju(supplierId, value) {
    if (value) {
      setSetujuBySupplier((prev) => ({ ...prev, [supplierId]: true }));
      return;
    }
    if (busyBySupplier[supplierId]) return;
    setBusy(supplierId, 'Membatalkan pilihan…');
    try {
      const hasil = await getForecastHasil(runId);
      const kodeList = extractKodeObatForSupplier(hasil, supplierId);
      await batchResetPilihan(runId, supplierId, kodeList);
      setSetujuBySupplier((prev) => ({ ...prev, [supplierId]: false }));
      setDibatalkanSet((prev) => new Set(prev).add(supplierId));
      setToast('Pilihan PBF dibatalkan');
    } catch (err) {
      setToast(err.message || 'Gagal membatalkan pilihan PBF');
    } finally {
      setBusy(supplierId, null);
    }
  }

  async function handleGenerate(card) {
    const supplierId = card.supplier_id;
    if (busyBySupplier[supplierId]) return;
    setBusy(supplierId, 'Generate SP…');
    try {
      const kategoriSplit = pisahBySupplier[supplierId] ? 'pisah' : 'gabung';
      const result = await generateDokumenSp(runId, supplierId, kategoriSplit);
      const docs = result?.dokumen || [];
      setDocsBySupplier((prev) => ({ ...prev, [supplierId]: docs }));
      setToast(
        `SP berhasil digenerate — ${docs.length} dokumen dibuat untuk ${card.supplier_nama || 'PBF ini'}`
      );
      await loadBreakdown();
    } catch (err) {
      setToast(err.message || 'Gagal generate SP');
    } finally {
      setBusy(supplierId, null);
    }
  }

  async function handleBatalkanSp(card) {
    const supplierId = card.supplier_id;
    if (busyBySupplier[supplierId]) return;
    setBusy(supplierId, 'Membuat revisi SP…');
    try {
      const result = await batalkanDokumenSp(runId, supplierId);
      const docs = result?.dokumen || [];
      setDocsBySupplier((prev) => ({ ...prev, [supplierId]: docs }));
      setToast(
        `Revisi SP dibuat — ${docs.length} dokumen baru untuk ${card.supplier_nama || 'PBF ini'}. Switch kebuka lagi.`
      );
      await loadBreakdown();
    } catch (err) {
      setToast(err.message || 'Gagal membuat revisi SP');
    } finally {
      setBusy(supplierId, null);
    }
  }

  async function handleLihatRiwayat(card) {
    setRiwayatModal({ supplierId: card.supplier_id, supplierNama: card.supplier_nama });
    setRiwayatLoading(true);
    setRiwayatError(null);
    setRiwayatDokumen([]);
    try {
      const res = await listDokumenSp(runId, card.supplier_id);
      setRiwayatDokumen(res?.dokumen || []);
    } catch (err) {
      setRiwayatError(err.message || 'Gagal memuat riwayat SP');
    } finally {
      setRiwayatLoading(false);
    }
  }

  function handleKirimWa(card) {
    const supplierId = card.supplier_id;
    const docs = docsBySupplier[supplierId] || [];
    const nomorSpList = docs.map((d) => d.nomor_sp).filter(Boolean);
    const pesan = buildPesanWa(card, nomorSpList);
    const phone = toWaPhone(card.supplier_no_wa_sales || card.supplier_telp);
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(pesan)}`
      : `https://wa.me/?text=${encodeURIComponent(pesan)}`;

    // window.open harus dipanggil sinkron di handler klik supaya tidak diblokir popup blocker.
    window.open(url, '_blank', 'noopener,noreferrer');

    setBusy(supplierId, 'Update status kirim…');
    kirimDokumenSp(runId, supplierId)
      .then(() => {
        setDocsBySupplier((prev) => {
          const list = prev[supplierId];
          if (!list) return prev;
          return {
            ...prev,
            [supplierId]: list.map((d) => ({ ...d, status: 'dikirim' })),
          };
        });
        setCards((prev) =>
          prev.map((c) =>
            c.supplier_id === supplierId
              ? {
                  ...c,
                  dokumen_terbaru: { ...c.dokumen_terbaru, status: 'dikirim' },
                }
              : c
          )
        );
        setToast('Status SP diperbarui jadi Dikirim ke Sales');
      })
      .catch((err) => {
        setToast(err.message || 'WA terbuka, tapi gagal update status kirim');
      })
      .finally(() => setBusy(supplierId, null));
  }

  return (
    <AppShell
      title="Pembuatan SP"
      actions={
        <button
          type="button"
          onClick={() => navigate(`/forecasting?run=${encodeURIComponent(runId || '')}`)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-text-secondary hover:bg-bg-surface-hover hover:text-accent-yellow"
          aria-label="Kembali ke Forecasting"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        </button>
      }
      navLoading={loading}
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <SubmitSpinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <p className="rounded-[4px] bg-state-error/10 px-3 py-2 text-[13px] text-state-error">
          {error}
        </p>
      ) : cards.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-text-muted">
          Belum ada obat yang disetujui di Defekta untuk forecast run ini.
        </p>
      ) : (
        <div className="space-y-2">
          {cards.map((card) => (
            <PembuatanSpCard
              key={card.supplier_id}
              card={{
                ...card,
                dibatalkan: dibatalkanSet.has(card.supplier_id),
              }}
              pisah={pisahBySupplier[card.supplier_id] ?? false}
              onTogglePisah={(v) => handleTogglePisah(card.supplier_id, v)}
              setuju={setujuBySupplier[card.supplier_id] ?? true}
              onToggleSetuju={(v) => handleToggleSetuju(card.supplier_id, v)}
              busy={Boolean(busyBySupplier[card.supplier_id])}
              busyLabel={busyBySupplier[card.supplier_id] || null}
              generatedDocs={docsBySupplier[card.supplier_id] || null}
              onGenerate={() => handleGenerate(card)}
              onBatalkanSp={() => handleBatalkanSp(card)}
              onKirimWa={() => handleKirimWa(card)}
              onLihatRiwayat={() => handleLihatRiwayat(card)}
            />
          ))}
        </div>
      )}

      <RiwayatSpModal
        open={Boolean(riwayatModal)}
        onClose={() => setRiwayatModal(null)}
        supplierNama={riwayatModal?.supplierNama}
        loading={riwayatLoading}
        error={riwayatError}
        dokumen={riwayatDokumen}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </AppShell>
  );
}
