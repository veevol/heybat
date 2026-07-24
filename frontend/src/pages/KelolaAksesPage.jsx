import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Shield } from 'lucide-react';
import {
  assignUserGroup,
  cabutUserAkses,
  createGroup,
  getGroupDetail,
  listAllUsers,
  listGroups,
  listUsersMenunggu,
  saveGroupPermissions,
} from '../api/kelolaAkses';
import AppShell from '../components/layout/AppShell';
import SheetModal from '../components/SheetModal';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';

const TABS = [
  { id: 'menunggu', label: 'User Menunggu' },
  { id: 'groups', label: 'Kelola Group' },
  { id: 'users', label: 'Semua User' },
];

function formatTanggal(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function StatusBadge({ status, isOwner }) {
  if (isOwner) {
    return (
      <span className="rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold text-bg-base">
        Owner
      </span>
    );
  }
  if (status === 'aktif') {
    return (
      <span className="rounded-[4px] bg-state-success/20 px-1.5 py-0.5 text-[10px] font-semibold text-state-success">
        Aktif
      </span>
    );
  }
  return (
    <span className="rounded-[4px] bg-state-warning/20 px-1.5 py-0.5 text-[10px] font-semibold text-state-warning">
      Menunggu
    </span>
  );
}

export default function KelolaAksesPage() {
  const [tab, setTab] = useState('menunggu');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [menunggu, setMenunggu] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);

  const [assignPick, setAssignPick] = useState({});
  const [assignBusy, setAssignBusy] = useState(null);

  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [newGroupNama, setNewGroupNama] = useState('');
  const [addGroupBusy, setAddGroupBusy] = useState(false);
  const [addGroupError, setAddGroupError] = useState('');

  const [detailGroup, setDetailGroup] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [checkedAksi, setCheckedAksi] = useState(() => new Set());
  const [savePermBusy, setSavePermBusy] = useState(false);

  const [movePick, setMovePick] = useState({});
  const [userBusy, setUserBusy] = useState(null);
  const [cabutConfirm, setCabutConfirm] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2800);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [m, g, u] = await Promise.all([
        listUsersMenunggu(),
        listGroups(),
        listAllUsers(),
      ]);
      setMenunggu(m || []);
      setGroups(g || []);
      setUsers(u || []);
    } catch (err) {
      setLoadError(err.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const allAksiIds = useMemo(() => {
    if (!detailGroup?.menus) return [];
    return detailGroup.menus.flatMap((m) => (m.aksi || []).map((a) => a.id));
  }, [detailGroup]);

  const aksiColumns = useMemo(() => {
    if (!detailGroup?.menus?.length) return [];
    const map = new Map();
    for (const menu of detailGroup.menus) {
      for (const a of menu.aksi || []) {
        if (!map.has(a.kode_aksi)) {
          map.set(a.kode_aksi, a.label);
        }
      }
    }
    const order = ['lihat', 'tambah', 'edit', 'hapus', 'usulkan', 'verifikasi'];
    return [...map.entries()]
      .map(([kode, label]) => ({ kode, label }))
      .sort((a, b) => {
        const ia = order.indexOf(a.kode);
        const ib = order.indexOf(b.kode);
        if (ia === -1 && ib === -1) return a.kode.localeCompare(b.kode);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
  }, [detailGroup]);

  async function openGroupDetail(group) {
    setDetailLoading(true);
    setDetailGroup({ id: group.id, nama: group.nama, menus: [] });
    try {
      const detail = await getGroupDetail(group.id);
      setDetailGroup(detail);
      const next = new Set();
      for (const menu of detail.menus || []) {
        for (const a of menu.aksi || []) {
          if (a.granted) next.add(a.id);
        }
      }
      setCheckedAksi(next);
    } catch (err) {
      showToast(err.message || 'Gagal memuat detail group');
      setDetailGroup(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleAksi(aksiId) {
    setCheckedAksi((prev) => {
      const next = new Set(prev);
      if (next.has(aksiId)) next.delete(aksiId);
      else next.add(aksiId);
      return next;
    });
  }

  async function handleSavePermissions() {
    if (!detailGroup?.id) return;
    setSavePermBusy(true);
    try {
      await saveGroupPermissions(detailGroup.id, [...checkedAksi]);
      showToast('Izin group disimpan');
      setDetailGroup(null);
      await reload();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan izin');
    } finally {
      setSavePermBusy(false);
    }
  }

  async function handleCreateGroup(event) {
    event.preventDefault();
    setAddGroupError('');
    setAddGroupBusy(true);
    try {
      const created = await createGroup(newGroupNama);
      setAddGroupOpen(false);
      setNewGroupNama('');
      showToast(`Group "${created.nama}" dibuat`);
      await reload();
      await openGroupDetail(created);
    } catch (err) {
      setAddGroupError(err.message || 'Gagal membuat group');
    } finally {
      setAddGroupBusy(false);
    }
  }

  async function handleApprove(userId) {
    const groupId = assignPick[userId];
    if (!groupId) {
      showToast('Pilih group dulu');
      return;
    }
    setAssignBusy(userId);
    try {
      await assignUserGroup(userId, groupId);
      showToast('User disetujui');
      setAssignPick((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      await reload();
    } catch (err) {
      showToast(err.message || 'Gagal menyetujui user');
    } finally {
      setAssignBusy(null);
    }
  }

  async function handleMoveGroup(userId) {
    const groupId = movePick[userId];
    if (!groupId) {
      showToast('Pilih group dulu');
      return;
    }
    setUserBusy(userId);
    try {
      await assignUserGroup(userId, groupId);
      showToast('Group diganti');
      await reload();
    } catch (err) {
      showToast(err.message || 'Gagal memindah group');
    } finally {
      setUserBusy(null);
    }
  }

  async function handleCabut() {
    if (!cabutConfirm) return;
    setUserBusy(cabutConfirm.id);
    try {
      await cabutUserAkses(cabutConfirm.id);
      showToast('Akses dicabut');
      setCabutConfirm(null);
      await reload();
    } catch (err) {
      showToast(err.message || 'Gagal mencabut akses');
    } finally {
      setUserBusy(null);
    }
  }

  return (
    <AppShell title="Kelola Akses" navLoading={loading}>
      <div className="mb-3 flex gap-1 overflow-x-auto scrollbar-hide">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-[4px] px-3 py-1.5 text-[12px] font-semibold transition ${
              tab === t.id
                ? 'bg-accent-yellow text-bg-base'
                : 'bg-bg-surface text-text-secondary hover:bg-bg-surface-hover'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError ? (
        <p className="mb-3 text-[13px] text-state-error">{loadError}</p>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <SubmitSpinner className="h-8 w-8" />
        </div>
      ) : null}

      {!loading && tab === 'menunggu' ? (
        <div className="space-y-2">
          {menunggu.length === 0 ? (
            <p className="rounded-[4px] bg-bg-surface px-3 py-4 text-center text-[13px] text-text-muted">
              Tidak ada user menunggu persetujuan.
            </p>
          ) : (
            menunggu.map((u) => (
              <div
                key={u.id}
                className="rounded-[4px] bg-bg-surface px-3 py-2.5 shadow-sm shadow-black/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-text-primary">
                      {u.nama || u.email}
                    </p>
                    <p className="truncate text-[11px] text-text-secondary">
                      {u.email}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      Daftar {formatTanggal(u.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={u.status} />
                </div>
                <div className="mt-2 flex gap-2">
                  <select
                    value={assignPick[u.id] || ''}
                    onChange={(e) =>
                      setAssignPick((prev) => ({
                        ...prev,
                        [u.id]: e.target.value,
                      }))
                    }
                    className="min-w-0 flex-1 rounded-[4px] border border-border-subtle bg-bg-base px-2 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow"
                  >
                    <option value="">Pilih group…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nama}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={assignBusy === u.id || !assignPick[u.id]}
                    onClick={() => handleApprove(u.id)}
                    className="shrink-0 rounded-[4px] bg-accent-navy px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    {assignBusy === u.id ? (
                      <SubmitSpinner className="h-3.5 w-3.5" />
                    ) : (
                      'Setujui'
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {!loading && tab === 'groups' ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setAddGroupError('');
              setNewGroupNama('');
              setAddGroupOpen(true);
            }}
            className="flex w-full items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-2.5 text-[13px] font-semibold text-text-primary hover:bg-bg-surface-hover"
          >
            <Plus className="h-4 w-4 text-accent-yellow" />
            Tambah Group
          </button>

          {groups.length === 0 ? (
            <p className="rounded-[4px] bg-bg-surface px-3 py-4 text-center text-[13px] text-text-muted">
              Belum ada group. Buat group pertama.
            </p>
          ) : (
            groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => openGroupDetail(g)}
                className="flex w-full items-center gap-3 rounded-[4px] bg-bg-surface px-3 py-2.5 text-left shadow-sm shadow-black/10 hover:bg-bg-surface-hover"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-bg-base text-accent-yellow">
                  <Shield className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-text-primary">
                    {g.nama}
                  </span>
                  <span className="block text-[11px] text-text-muted">
                    {g.anggota_count} anggota
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {!loading && tab === 'users' ? (
        <div className="space-y-2">
          {users.length === 0 ? (
            <p className="rounded-[4px] bg-bg-surface px-3 py-4 text-center text-[13px] text-text-muted">
              Belum ada user.
            </p>
          ) : (
            users.map((u) => (
              <div
                key={u.id}
                className="rounded-[4px] bg-bg-surface px-3 py-2.5 shadow-sm shadow-black/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-text-primary">
                      {u.nama || u.email}
                    </p>
                    <p className="truncate text-[11px] text-text-secondary">
                      {u.email}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      {u.group?.nama || (u.is_owner ? '—' : 'Tanpa group')}
                    </p>
                  </div>
                  <StatusBadge status={u.status} isOwner={u.is_owner} />
                </div>

                {!u.is_owner ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <select
                      value={movePick[u.id] || u.group_id || ''}
                      onChange={(e) =>
                        setMovePick((prev) => ({
                          ...prev,
                          [u.id]: e.target.value,
                        }))
                      }
                      className="min-w-0 flex-1 rounded-[4px] border border-border-subtle bg-bg-base px-2 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow"
                    >
                      <option value="">Pilih group…</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.nama}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={
                        userBusy === u.id ||
                        !(movePick[u.id] || u.group_id) ||
                        (movePick[u.id] || u.group_id) === u.group_id
                      }
                      onClick={() => handleMoveGroup(u.id)}
                      className="rounded-[4px] border border-border-subtle px-2.5 py-1.5 text-[12px] font-semibold text-text-primary hover:bg-bg-surface-hover disabled:opacity-40"
                    >
                      Pindah
                    </button>
                    <button
                      type="button"
                      disabled={userBusy === u.id}
                      onClick={() => setCabutConfirm(u)}
                      className="rounded-[4px] border border-state-error/40 px-2.5 py-1.5 text-[12px] font-semibold text-state-error hover:bg-state-error/10 disabled:opacity-40"
                    >
                      Cabut
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {addGroupOpen ? (
        <SheetModal
          title={
            <h2 className="text-[15px] font-semibold text-text-primary">
              Tambah Group
            </h2>
          }
          onClose={() => !addGroupBusy && setAddGroupOpen(false)}
          busy={addGroupBusy}
          footer={
            <button
              type="submit"
              form="form-tambah-group"
              disabled={addGroupBusy || !newGroupNama.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {addGroupBusy ? <SubmitSpinner className="h-4 w-4" /> : null}
              Simpan
            </button>
          }
        >
          <form id="form-tambah-group" onSubmit={handleCreateGroup}>
            <label className="block">
              <span className="mb-1 block text-[13px] text-text-secondary">
                Nama group
              </span>
              <input
                autoFocus
                value={newGroupNama}
                onChange={(e) => setNewGroupNama(e.target.value)}
                className="w-full rounded-[4px] border border-border-subtle bg-bg-base px-3 py-1.5 text-[13px] text-text-primary outline-none focus:border-accent-yellow"
                placeholder="Contoh: Staf Gudang"
              />
            </label>
            {addGroupError ? (
              <p className="mt-2 text-[13px] text-state-error">{addGroupError}</p>
            ) : null}
          </form>
        </SheetModal>
      ) : null}

      {detailGroup ? (
        <SheetModal
          title={
            <h2 className="truncate text-[15px] font-semibold text-text-primary">
              {detailGroup.nama}
            </h2>
          }
          onClose={() => !savePermBusy && setDetailGroup(null)}
          busy={savePermBusy}
          footer={
            <button
              type="button"
              disabled={savePermBusy || detailLoading}
              onClick={handleSavePermissions}
              className="flex w-full items-center justify-center gap-2 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
            >
              {savePermBusy ? <SubmitSpinner className="h-4 w-4" /> : null}
              Simpan izin
            </button>
          }
        >
          {detailLoading ? (
            <div className="flex justify-center py-10">
              <SubmitSpinner className="h-7 w-7" />
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[11px] text-text-muted">
                Centang aksi yang diizinkan untuk group ini.
                {allAksiIds.length
                  ? ` (${checkedAksi.size}/${allAksiIds.length})`
                  : ''}
              </p>
              <div className="overflow-x-auto scrollbar-hide">
                <table className="w-full min-w-[420px] border-collapse text-left">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-bg-surface px-1 py-1 text-[11px] font-semibold text-text-muted">
                        Menu
                      </th>
                      {aksiColumns.map((col) => (
                        <th
                          key={col.kode}
                          className="px-1 py-1 text-center text-[10px] font-semibold text-text-muted"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(detailGroup.menus || []).map((menu) => {
                      const byKode = new Map(
                        (menu.aksi || []).map((a) => [a.kode_aksi, a])
                      );
                      return (
                        <tr key={menu.id} className="border-t border-border-subtle">
                          <td className="sticky left-0 bg-bg-surface px-1 py-2 text-[12px] font-semibold text-text-primary">
                            {menu.label}
                          </td>
                          {aksiColumns.map((col) => {
                            const aksi = byKode.get(col.kode);
                            if (!aksi) {
                              return (
                                <td
                                  key={col.kode}
                                  className="px-1 py-2 text-center text-text-muted"
                                >
                                  —
                                </td>
                              );
                            }
                            return (
                              <td key={col.kode} className="px-1 py-2 text-center">
                                <input
                                  type="checkbox"
                                  checked={checkedAksi.has(aksi.id)}
                                  onChange={() => toggleAksi(aksi.id)}
                                  className="h-4 w-4 accent-accent-yellow"
                                  aria-label={`${menu.label} ${aksi.label}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </SheetModal>
      ) : null}

      {cabutConfirm ? (
        <SheetModal
          title={
            <h2 className="text-[15px] font-semibold text-state-error">
              Cabut akses
            </h2>
          }
          onClose={() => userBusy !== cabutConfirm.id && setCabutConfirm(null)}
          busy={userBusy === cabutConfirm.id}
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                disabled={userBusy === cabutConfirm.id}
                onClick={() => setCabutConfirm(null)}
                className="flex-1 rounded-[4px] border border-border-subtle px-3 py-2 text-[13px] font-semibold text-text-primary"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={userBusy === cabutConfirm.id}
                onClick={handleCabut}
                className="flex flex-1 items-center justify-center gap-2 rounded-[4px] bg-state-error px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {userBusy === cabutConfirm.id ? (
                  <SubmitSpinner className="h-4 w-4" />
                ) : null}
                Cabut
              </button>
            </div>
          }
        >
          <p className="text-[13px] text-text-secondary">
            User{' '}
            <span className="font-semibold text-text-primary">
              {cabutConfirm.nama || cabutConfirm.email}
            </span>{' '}
            akan kembali ke status menunggu dan kehilangan akses menu.
          </p>
        </SheetModal>
      ) : null}

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}
