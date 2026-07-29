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
        {/* Section 1 — logos, kotak sama + object-contain sesuai desain LoginPage */}
        <div className="flex items-center justify-center gap-3">
          <img
            src="/logo_yelo.png"
            alt="Yelo"
            className="h-[4.5rem] w-[4.5rem] shrink-0 object-contain"
          />
          <img
            src="/logo_heybat.png?v=trim2"
            alt="Heybat"
            className="h-[4.5rem] w-[4.5rem] shrink-0 object-contain"
          />
        </div>

        {/* Section 2 — brand title */}
        <h1 className="mt-5 text-[22px] font-bold leading-none text-text-primary">
          Yelo Heybat
        </h1>

        {/* Section 3 — tagline */}
        <p className="mt-1.5 text-[13px] leading-none text-accent-yellow">
          Aplikasi Heybat untuk Apotek Yelo
        </p>

        {/* Section 4 — status message */}
        <h1 className="mt-2 text-[22px] font-bold leading-tight text-text-primary">
          Menunggu Persetujuan Akses
        </h1>

        {/* Section 5 — user email */}
        {profile?.email ? (
          <p className="mt-2 text-[11px] text-text-muted">{profile.email}</p>
        ) : null}

        {/* Section 6 — sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-[4px] border border-[#dadce0] bg-white px-3 text-[14px] font-medium text-[#3c4043] shadow-sm transition hover:bg-[#f8f9fa] disabled:opacity-60"
        >
          {busy ? <SubmitSpinner className="h-5 w-5" /> : null}
          Keluar
        </button>
      </div>
    </div>
  );
}
