import ProtectedRoute from "@/components/ProtectedRoute";
import TelegramInitializer from "@/components/TelegramInitializer";
import TanstackProvider from "@/apiUtils/provider";
import AdminLayout from "@/layouts/AdminLayout";
import MainLayout from "@/layouts/MainLayout";
import AdminReservations from "@/components/pages/Admin/Reservations";
import ContentManagment from "@/components/pages/Admin/ContentManagment";
import AdminWarhammer from "@/components/pages/Admin/Warhammer/AdminWarhammer";
import AdminDnd from "@/components/pages/Admin/Dnd/AdminDnd";
import Reservation from "@/components/pages/Reservations/Reservation";
import News from "@/components/pages/News/News";
import Profile from "@/components/pages/Profile/Profile";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

export default function App() {
  return (
    <TanstackProvider>
      <TelegramInitializer />

      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route path="reservations" element={<Reservation />} />
            <Route path="news" element={<News />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminReservations />} />
            <Route path="content" element={<ContentManagment />} />
            <Route path="warhammer" element={<AdminWarhammer />} />
            <Route path="dnd" element={<AdminDnd />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </TanstackProvider>
  );
}
