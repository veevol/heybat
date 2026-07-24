import { Navigate, Outlet } from 'react-router-dom';
import SubmitSpinner from './SubmitSpinner';
import { useAuth } from '../context/AuthContext';

/**
 * Layout route: lanjut ke child hanya jika punya izin menu+aksi.
 * Dipakai untuk deep-link (mis. /matching/verifikasi).
 */
export default function RequireMenuAksi({ menu, aksi, fallback = '/' }) {
  const { loading, hasAccess } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base">
        <SubmitSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (!hasAccess(menu, aksi)) {
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}
