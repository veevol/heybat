import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import SubmitSpinner from '../components/SubmitSpinner';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const {
    session,
    profile,
    loading,
    signInWithGoogle,
    signInWithEmail,
  } = useAuth();
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  async function handleEmailSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setError(err.message || 'Email atau password salah');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg-base px-6 py-10">
      <div className="w-full max-w-sm">
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.18em] text-accent-yellow">
          YELO
        </p>
        <h1 className="mt-2 text-center text-[22px] font-bold leading-tight text-text-primary">
          Heybat
        </h1>
        <p className="mt-2 text-center text-[13px] leading-snug text-text-secondary">
          Masuk untuk mengelola data supplier, pricelist, dan matching.
        </p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className="mt-8 flex w-full items-center justify-center gap-2 rounded-[4px] bg-accent-navy px-3 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? <SubmitSpinner className="h-4 w-4" /> : null}
          Masuk dengan Google
        </button>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-[11px] uppercase tracking-wide text-text-muted">
            atau
          </span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <button
          type="button"
          onClick={() => setEmailOpen((v) => !v)}
          className="w-full text-left text-[13px] font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          Masuk dengan email
        </button>

        {emailOpen ? (
          <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[13px] text-text-secondary">
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow"
                placeholder="nama@email.com"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[13px] text-text-secondary">
                Password
              </span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-1.5 text-[13px] text-text-primary outline-none placeholder:text-text-muted focus:border-accent-yellow"
                placeholder="••••••••"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2.5 text-[13px] font-semibold text-text-primary transition hover:bg-bg-surface-hover disabled:opacity-60"
            >
              {submitting ? <SubmitSpinner className="h-4 w-4" /> : null}
              Masuk
            </button>
          </form>
        ) : null}

        {error ? (
          <p className="mt-4 text-center text-[13px] text-state-error">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
