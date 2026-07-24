import { Navigate, Outlet } from 'react-router-dom';
import SubmitSpinner from './SubmitSpinner';
import { useAuth } from '../context/AuthContext';

/** Setelah ProtectedRoute: hanya is_owner yang boleh lanjut. */
export default function OwnerRoute() {
  const { profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base">
        <SubmitSpinner className="h-8 w-8" />
      </div>
    );
  }

  if (profile?.is_owner !== true) {
    return <Navigate to="/data-supplier" replace />;
  }

  return <Outlet />;
}
