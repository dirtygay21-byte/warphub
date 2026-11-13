import AppErrorBoundary from "@/components/AppErrorBoundary";
import ProtectedRoute from "@/components/ProtectedRoute";
import TelegramInitializer from "@/components/TelegramInitializer";
import TanstackProvider from "@/apiUtils/provider";
import EffectsRoot from "@/components/EffectsRoot";
import AdminLayout from "@/layouts/AdminLayout";
import MainLayout from "@/layouts/MainLayout";
import AdminReservations from "@/components/pages/Admin/Reservations";
import AdminSupporters from "@/components/pages/Admin/Supporters/AdminSupporters";
import AdminDominatus from "@/components/pages/Admin/Dominatus/AdminDominatus";
import ContentManagment from "@/components/pages/Admin/ContentManagment";
import AdminWarhammer from "@/components/pages/Admin/Warhammer/AdminWarhammer";
import AdminDnd from "@/components/pages/Admin/Dnd/AdminDnd";
import AdminRewards from "@/components/pages/Admin/Rewards/AdminRewards";
import AdminPricing from "@/components/pages/Admin/Pricing/AdminPricing";
import GamesHub, { MyRewards } from "@/components/games/GamesHub";
import RunnerGame from "@/components/games/RunnerGame";
import DiceGame from "@/components/games/DiceGame";
import EggGame from "@/components/games/EggGame";
import CardsGame, { CardCollection } from "@/components/games/CardsGame";
import GamesLayout from "@/layouts/GamesLayout";
import { TutorialHub, TutorialRound, TutorialViewer } from "@/components/tutorial/TutorialPages";
import Reservation from "@/components/pages/Reservations/Reservation";
import News from "@/components/pages/News/News";
import Profile from "@/components/pages/Profile/Profile";
import RosterPage from "@/components/pages/Roster/RosterPage";
import AdminRoster from "@/components/pages/Admin/Roster/AdminRoster";
import AdminAdmins from "@/components/pages/Admin/Admins/AdminAdmins";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Toaster from "@/components/ui/ds/Toaster";

export default function App() {
  return (
    <TanstackProvider>
      <EffectsRoot>
        <TelegramInitializer />

        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppErrorBoundary>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route path="reservations" element={<Reservation />} />
              <Route path="news" element={<News />} />
              <Route path="profile" element={<Profile />} />
            </Route>

            <Route path="/roster" element={<RosterPage />} />

            <Route path="/games" element={<GamesLayout />}>
              <Route index element={<GamesHub />} />
              <Route path="rewards" element={<MyRewards />} />
              <Route path="runner" element={<RunnerGame />} />
              <Route path="dice" element={<DiceGame />} />
              <Route path="egg" element={<EggGame />} />
              <Route path="cards" element={<CardsGame />} />
              <Route path="cards/collection" element={<CardCollection />} />
            </Route>

            {/* «Как играть» — тот же полноэкранный каркас без нижнего меню, что у мини-игр */}
            <Route path="/learn" element={<GamesLayout />}>
              <Route index element={<TutorialHub />} />
              <Route path=":game" element={<TutorialViewer />} />
              <Route path=":game/round" element={<TutorialRound />} />
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
              <Route path="pricing" element={<AdminPricing />} />
              <Route path="content" element={<ContentManagment />} />
              <Route path="warhammer" element={<AdminWarhammer />} />
              <Route path="dnd" element={<AdminDnd />} />
              <Route path="roster" element={<AdminRoster />} />
              <Route path="rewards" element={<AdminRewards />} />
              <Route path="admins" element={<AdminAdmins />} />
              <Route path="supporters" element={<AdminSupporters />} />
              <Route path="dominatus" element={<AdminDominatus />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </AppErrorBoundary>
        </BrowserRouter>
        <Toaster />
      </EffectsRoot>
    </TanstackProvider>
  );
}
