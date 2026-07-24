import { Navigate, Outlet, useLocation } from 'react-router-dom';
import SubmitSpinner from './SubmitSpinner';
import { useAuth } from '../context/AuthContext';

/**
 * Proteksi route dasar: wajib login + status aktif.
 * /login dan /menunggu-persetujuan tidak memakai komponen ini.
 */
export default function ProtectedRoute() {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base">
        <SubmitSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (profile?.status === 'menunggu') {
    return <Navigate to="/menunggu-persetujuan" replace />;
  }

  if (!profile || profile.status !== 'aktif') {
    // Token ada tapi profil belum / gagal — arahkan ke login ulang.
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
