import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { House, CalendarCheck, NewspaperIcon, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import NavigationItem from "./NavigationItem";
import NavigationIndicator from "./NavigationIndicator";

const getActivePageFromPath = (pathname: string) => {
  if (pathname.startsWith("/reservations")) return "Reservations";
  if (pathname.startsWith("/news")) return "News";
  if (pathname.startsWith("/profile")) return "Profile";

  return "Home";
};

export default function Navigation() {
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

  return (
    <div className="w-full relative flex justify-around items-center !py-3 overflow-hidden border-t border-white/5 bg-[rgb(var(--color-nav-bg)/0.72)] backdrop-blur-xl backdrop-saturate-150">
      <NavigationIndicator activePage={activePage} />

      <NavigationItem
        id="navigation-item-Home"
        icon={<House />}
        title="Главная"
        isActive={activePage === "Home"}
        onClick={handleHomeClick}
      />
      <NavigationItem
        id="navigation-item-Reservations"
        icon={<CalendarCheck />}
        title="Мои записи"
        isActive={activePage === "Reservations"}
        onClick={() => navigate("/reservations")}
      />
      <NavigationItem
        id="navigation-item-News"
        icon={<NewspaperIcon />}
        title="Новости"
        isActive={activePage === "News"}
        onClick={() => navigate("/news")}
      />
      <NavigationItem
        id="navigation-item-Profile"
        icon={<User />}
        title="Профиль"
        isActive={activePage === "Profile"}
        onClick={() => navigate("/profile")}
      />
    </div>
  );
}
