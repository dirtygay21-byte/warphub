import Home from "@/components/pages/Home/Home";
import Header from "@/components/ui/Header/Header";
import Navigation from "@/components/ui/Navigation/Navigation";
import { useReservationStore } from "@/stores/useReservationStore";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import clsx from "clsx";
import { Calendar } from "lucide-react";
import { Outlet, useLocation } from "react-router-dom";

export default function MainLayout() {
  const { pathname } = useLocation();
  const isHomeRoute = pathname === "/";

  const { currentStage, nextStage } = useRegistrationStageStore();
  const { setDisciplineId } = useReservationStore();

  const handleRegistartionClick = () => {
    setDisciplineId(null);
    nextStage();
  };

  return (
    <div className="relative h-dvh w-full overflow-x-hidden overflow-y-scroll bg-app-bg pb-20">
      <Header />

      <div
        className={clsx(!isHomeRoute && "hidden", "relative z-[1]")}
        aria-hidden={!isHomeRoute}
      >
        <Home />
      </div>

      {!isHomeRoute && <Outlet />}

      <div className="fixed bottom-0 left-0 right-0 z-[2]">
        {isHomeRoute && currentStage === "Home" && (
          <button
            type="button"
            onClick={handleRegistartionClick}
            className="register-btn-glow flex items-center justify-center mb-10 mx-auto gap-2.5 rounded-xl bg-accent px-10 py-3.5 text-lg font-semibold text-accent-foreground transition-transform active:scale-95"
          >
            <Calendar className="size-5" />
            <span>Записаться</span>
          </button>
        )}

        <Navigation />
      </div>
    </div>
  );
}
