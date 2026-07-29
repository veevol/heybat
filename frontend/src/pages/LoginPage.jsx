import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import SubmitSpinner from '../components/SubmitSpinner';
import { useAuth } from '../context/AuthContext';

/** Official-style Google "G" mark for the sign-in button. */
function GoogleMark({ className = 'h-5 w-5' }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { session, profile, loading, signInWithGoogle } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base">
        <SubmitSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (session && profile?.status === 'menunggu') {
    return <Navigate to="/menunggu-persetujuan" replace />;
  }

  if (session && profile?.status === 'aktif') {
    return <Navigate to="/data-supplier" replace />;
  }

  async function handleGoogle() {
    setError('');
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message || 'Gagal masuk dengan Google');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg-base px-6 py-10">
      <div className="w-full max-w-sm text-center">
        {/* Section 1 — logos: kotak sama, object-contain (sudut dari PNG) */}
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
        <p className="mt-0 text-[13px] leading-none text-accent-yellow">
          Aplikasi Heybat untuk Apotek Yelo
        </p>

        {/* Section 4 — Google sign-in (standard style) */}
        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className="mt-8 flex h-11 w-full items-center justify-center gap-3 rounded-[4px] border border-[#dadce0] bg-white px-3 text-[14px] font-medium text-[#3c4043] shadow-sm transition hover:bg-[#f8f9fa] disabled:opacity-60"
        >
          {submitting ? (
            <SubmitSpinner className="h-5 w-5" />
          ) : (
            <GoogleMark className="h-5 w-5 shrink-0" />
          )}
          <span>Masuk dengan Google</span>
        </button>

        {error ? (
          <p className="mt-4 text-[13px] text-state-error">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
