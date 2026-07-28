import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import OwnerRoute from './components/OwnerRoute';
import ProtectedRoute from './components/ProtectedRoute';
import RequireMenuAksi from './components/RequireMenuAksi';
import { AuthProvider } from './context/AuthContext';
import DataObatYeloPage from './pages/DataObatYeloPage';
import DataSupplierPage from './pages/DataSupplierPage';
import ForecastingPage from './pages/ForecastingPage';
import KelolaAksesPage from './pages/KelolaAksesPage';
import LoginPage from './pages/LoginPage';
import MatchingBelumPage from './pages/MatchingBelumPage';
import MatchingPage from './pages/MatchingPage';
import MatchingVerifikasiPage from './pages/MatchingVerifikasiPage';
import MenungguPersetujuanPage from './pages/MenungguPersetujuanPage';
import PembuatanSpPage from './pages/PembuatanSpPage';
import PenjualanPage from './pages/PenjualanPage';
import PlaceholderPage from './pages/PlaceholderPage';
import PricelistPbfPage from './pages/PricelistPbfPage';
import StokPage from './pages/StokPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/menunggu-persetujuan"
            element={<MenungguPersetujuanPage />}
          />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Navigate to="/data-supplier" replace />} />
            <Route path="/data-supplier" element={<DataSupplierPage />} />
            <Route path="/pricelist-pbf" element={<PricelistPbfPage />} />
            <Route path="/data-obat-yelo" element={<DataObatYeloPage />} />
            <Route
              path="/data-obat-yelo/laporan-baru"
              element={<Navigate to="/data-obat-yelo" replace />}
            />
            <Route path="/matching" element={<MatchingPage />} />
            <Route
              element={
                <RequireMenuAksi menu="matching" aksi="verifikasi" fallback="/matching" />
              }
            >
              <Route
                path="/matching/verifikasi"
                element={<MatchingVerifikasiPage />}
              />
            </Route>
            <Route
              path="/matching/belum-matching"
              element={<MatchingBelumPage />}
            />
            <Route
              element={
                <RequireMenuAksi menu="penjualan" aksi="lihat" fallback="/data-supplier" />
              }
            >
              <Route path="/penjualan" element={<PenjualanPage />} />
            </Route>
            <Route
              element={
                <RequireMenuAksi menu="stok" aksi="lihat" fallback="/data-supplier" />
              }
            >
              <Route path="/stok" element={<StokPage />} />
            </Route>
            <Route
              element={
                <RequireMenuAksi
                  menu="forecasting"
                  aksi="lihat"
                  fallback="/data-supplier"
                />
              }
            >
              <Route path="/forecasting" element={<ForecastingPage />} />
              <Route path="/pembuatan-sp/:runId" element={<PembuatanSpPage />} />
            </Route>
            <Route
              path="/akun"
              element={
                <PlaceholderPage
                  title="Akun"
                  body="Halaman akun masih placeholder. Detail profil menyusul."
                />
              }
            />
            <Route
              path="/pengaturan"
              element={
                <PlaceholderPage
                  title="Pengaturan"
                  body="Halaman pengaturan masih placeholder. Opsi aplikasi menyusul."
                />
              }
            />

            <Route element={<OwnerRoute />}>
              <Route path="/kelola-akses" element={<KelolaAksesPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}


