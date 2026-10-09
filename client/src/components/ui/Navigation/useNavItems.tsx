import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import type { PageTypes } from "@/types";
import { CalendarCheck, House, NewspaperIcon, User } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const getActivePageFromPath = (pathname: string): PageTypes => {
  if (pathname.startsWith("/reservations")) return "Reservations";
  if (pathname.startsWith("/news")) return "News";
  if (pathname.startsWith("/profile")) return "Profile";

  return "Home";
};

export interface NavItem {
  page: PageTypes;
  title: string;
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
}

/** Разделы приложения — общие для нижней панели (телефон) и боковой (компьютер). */
export function useNavItems(): NavItem[] {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { resetStages } = useRegistrationStageStore();
  const { resetReservation } = useReservationStore();
  const activePage = getActivePageFromPath(pathname);

  const handleHomeClick = () => {
    if (pathname === "/") {
      resetStages();
      resetReservation();
    }

    navigate("/");
  };

  return [
    { page: "Home", title: "Главная", icon: <House />, isActive: activePage === "Home", onClick: handleHomeClick },
    { page: "Reservations", title: "Мои записи", icon: <CalendarCheck />, isActive: activePage === "Reservations", onClick: () => navigate("/reservations") },
    { page: "News", title: "Новости", icon: <NewspaperIcon />, isActive: activePage === "News", onClick: () => navigate("/news") },
    { page: "Profile", title: "Профиль", icon: <User />, isActive: activePage === "Profile", onClick: () => navigate("/profile") },
  ];
}
