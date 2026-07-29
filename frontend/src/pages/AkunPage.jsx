import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, LogOut } from 'lucide-react';
import { updateMe, uploadMyAvatar } from '../api/me';
import AppShell from '../components/layout/AppShell';
import SubmitSpinner from '../components/SubmitSpinner';
import Toast from '../components/Toast';
import { useAuth } from '../context/AuthContext';

const inputClass =
  'w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] leading-snug text-text-primary outline-none transition placeholder:text-text-muted focus:border-accent-yellow focus:ring-1 focus:ring-accent-yellow disabled:cursor-not-allowed disabled:opacity-60';

const JABATAN_SUGGESTIONS = [
  'FO',
  'Staf Gudang',
  'Apoteker',
  'Asisten Apoteker',
  'Owner',
];

function Field({ label, children, hint = null }) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[11px] leading-none text-text-secondary">{label}</span>
      {children}
      {hint ? (
        <p className="text-[10px] leading-snug text-text-muted">{hint}</p>
      ) : null}
    </label>
  );
}

function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border-subtle/60 py-2 last:border-0">
      <span className="shrink-0 text-[11px] text-text-secondary">{label}</span>
      <span className="min-w-0 text-right text-[13px] text-text-primary">
        {value || '—'}
      </span>
    </div>
  );
}

function initialsFrom(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function AkunPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile, signOut } = useAuth();
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    nick_nama: '',
    nama_lengkap: '',
    jenis_kelamin: '',
    no_wa: '',
    jabatan: '',
  });
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  function showToast(message) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2800);
  }

  useEffect(() => {
    if (!profile) return;
    setForm({
      nick_nama: profile.nick_nama || profile.nama || '',
      nama_lengkap: profile.nama_lengkap || '',
      jenis_kelamin: profile.jenis_kelamin || '',
      no_wa: profile.no_wa || '',
      jabatan: profile.jabatan || '',
    });
    setAvatarUrl(profile.avatar_url || null);
  }, [profile]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMe({
        nick_nama: form.nick_nama,
        nama_lengkap: form.nama_lengkap,
        jenis_kelamin: form.jenis_kelamin || null,
        no_wa: form.no_wa,
        jabatan: form.jabatan,
      });
      await refreshProfile();
      showToast('Profil disimpan');
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan profil');
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    try {
      const next = await uploadMyAvatar(file);
      setAvatarUrl(next.avatar_url || null);
      await refreshProfile();
      showToast('Foto profil diganti');
    } catch (err) {
      showToast(err.message || 'Gagal upload foto');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleLogout() {
    setLogoutBusy(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      showToast(err.message || 'Gagal keluar');
      setLogoutBusy(false);
    }
  }

  const displayName =
    form.nick_nama || profile?.nama || profile?.email || 'Pengguna';
  const groupLabel = profile?.is_owner
    ? 'Owner'
    : profile?.group?.nama || 'Belum ada grup';
  const statusLabel =
    profile?.status === 'aktif'
      ? 'Aktif'
      : profile?.status === 'menunggu'
        ? 'Menunggu'
        : profile?.status || '—';

  return (
    <AppShell title="Akun">
      <div className="mx-auto flex max-w-lg flex-col gap-3">
        <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-navy text-[16px] font-bold text-white">
                  {initialsFrom(displayName)}
                </div>
              )}
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-bg-base text-text-primary shadow-sm hover:bg-bg-surface-hover disabled:opacity-60"
                aria-label="Ganti foto profil"
              >
                {avatarBusy ? (
                  <SubmitSpinner className="h-3.5 w-3.5" />
                ) : (
                  <Camera className="h-3.5 w-3.5" strokeWidth={2} />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarPick}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-text-primary">
                {displayName}
              </p>
              <p className="truncate text-[12px] text-text-secondary">
                {profile?.email || '—'}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {profile?.is_owner ? (
                  <span className="rounded-[4px] bg-accent-yellow px-1.5 py-0.5 text-[10px] font-semibold text-bg-base">
                    Owner
                  </span>
                ) : null}
                <span className="rounded-[4px] bg-bg-base px-1.5 py-0.5 text-[10px] font-semibold text-text-secondary">
                  {groupLabel}
                </span>
              </div>
            </div>
          </div>
        </section>

        <form
          onSubmit={handleSave}
          className="space-y-2.5 rounded-[4px] border border-border-subtle bg-bg-surface p-3"
        >
          <p className="text-[12px] font-semibold text-text-primary">Profil</p>

          <Field label="Nick / nama panggilan" hint="Default dari nama Google">
            <input
              name="nick_nama"
              value={form.nick_nama}
              onChange={handleChange}
              className={inputClass}
              placeholder="Nama panggilan"
              required
            />
          </Field>

          <Field label="Nama lengkap">
            <input
              name="nama_lengkap"
              value={form.nama_lengkap}
              onChange={handleChange}
              className={inputClass}
              placeholder="Nama lengkap"
            />
          </Field>

          <Field label="Jenis kelamin">
            <select
              name="jenis_kelamin"
              value={form.jenis_kelamin}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="">— pilih —</option>
              <option value="L">Laki-laki</option>
              <option value="P">Perempuan</option>
            </select>
          </Field>

          <Field label="No. WhatsApp">
            <input
              name="no_wa"
              value={form.no_wa}
              onChange={handleChange}
              className={inputClass}
              placeholder="08xxxxxxxxxx"
              inputMode="tel"
            />
          </Field>

          <Field label="Jabatan">
            <input
              name="jabatan"
              value={form.jabatan}
              onChange={handleChange}
              className={inputClass}
              placeholder="FO, Apoteker, …"
              list="jabatan-suggestions"
            />
            <datalist id="jabatan-suggestions">
              {JABATAN_SUGGESTIONS.map((j) => (
                <option key={j} value={j} />
              ))}
            </datalist>
          </Field>

          <button
            type="submit"
            disabled={saving}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded-[4px] bg-accent-navy px-3 py-2 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-60"
          >
            {saving ? <SubmitSpinner className="h-4 w-4" /> : null}
            Simpan profil
          </button>
        </form>

        <section className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1">
          <p className="pt-2 text-[12px] font-semibold text-text-primary">
            Info akun
          </p>
          <ReadOnlyRow label="Email" value={profile?.email} />
          <ReadOnlyRow label="Status" value={statusLabel} />
          <ReadOnlyRow label="Grup akses" value={groupLabel} />
        </section>

        <button
          type="button"
          onClick={handleLogout}
          disabled={logoutBusy}
          className="flex w-full items-center justify-center gap-2 rounded-[4px] border border-state-error/40 bg-state-error/10 px-3 py-2.5 text-[13px] font-semibold text-state-error hover:bg-state-error/15 disabled:opacity-60"
        >
          {logoutBusy ? (
            <SubmitSpinner className="h-4 w-4" />
          ) : (
            <LogOut className="h-4 w-4" strokeWidth={2} />
          )}
          Keluar
        </button>
      </div>

      {toast ? <Toast message={toast} /> : null}
    </AppShell>
  );
}
