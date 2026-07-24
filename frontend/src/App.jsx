import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import DataObatYeloPage from './pages/DataObatYeloPage';
import DataSupplierPage from './pages/DataSupplierPage';
import MatchingBelumPage from './pages/MatchingBelumPage';
import MatchingPage from './pages/MatchingPage';
import MatchingVerifikasiPage from './pages/MatchingVerifikasiPage';
import PlaceholderPage from './pages/PlaceholderPage';
import PricelistPbfPage from './pages/PricelistPbfPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/data-supplier" replace />} />
        <Route path="/data-supplier" element={<DataSupplierPage />} />
        <Route path="/pricelist-pbf" element={<PricelistPbfPage />} />
        <Route path="/data-obat-yelo" element={<DataObatYeloPage />} />
        <Route path="/matching" element={<MatchingPage />} />
        <Route path="/matching/verifikasi" element={<MatchingVerifikasiPage />} />
        <Route path="/matching/belum-matching" element={<MatchingBelumPage />} />
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
      </Routes>
    </BrowserRouter>
  );
}
