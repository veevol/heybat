import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import SubmitSpinner from '../components/SubmitSpinner';
import { useAuth } from '../context/AuthContext';

export default function MenungguPersetujuanPage() {
  const { session, profile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base">
        <SubmitSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.status === 'aktif') {
    return <Navigate to="/data-supplier" replace />;
  }

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg-base px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent-yellow">
          YELO
        </p>
        <h1 className="mt-2 text-[22px] font-bold leading-tight text-text-primary">
          Menunggu persetujuan
        </h1>
        <p className="mt-3 text-[13px] leading-snug text-text-secondary">
          Akun kamu sudah masuk, menunggu persetujuan owner untuk mengakses
          Heybat.
        </p>
        {profile?.email ? (
          <p className="mt-2 text-[11px] text-text-muted">{profile.email}</p>
        ) : null}

        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5 text-[13px] font-semibold text-text-primary transition hover:bg-bg-surface-hover disabled:opacity-60"
        >
          {busy ? <SubmitSpinner className="h-4 w-4" /> : null}
          Keluar
        </button>
      </div>
    </div>
  );
}
