import Home from "@/components/pages/Home/Home";
import Header from "@/components/ui/Header/Header";
import Navigation from "@/components/ui/Navigation/Navigation";
import Sidebar, { SIDEBAR_CLASS } from "@/components/ui/Navigation/Sidebar";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";

/**
 * Каркас приложения.
 * Телефон и узкое окно — контент на всю ширину, снизу панель разделов; «Записаться» — в контенте главной (A1:
 * плавающая кнопка закрывала список услуг).
 * Планшет (≥768 px) — контент по центру в колонке. Компьютер (≥1024 px) — боковая панель слева
 * вместо нижней, контент в широкой колонке по центру.
 */
export default function MainLayout() {
  const { pathname } = useLocation();
  const isHomeRoute = pathname === "/";

  const { currentStage } = useRegistrationStageStore();

  // новый раздел или шаг записи открывается сверху, а не там, где была прокрутка прошлого экрана (U2)
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname, currentStage]);

  return (
    <div ref={scroller} className={clsx("relative h-dvh w-full overflow-x-hidden overflow-y-scroll bg-app-bg pb-20 lg:pb-0", SIDEBAR_CLASS)}>
      <Sidebar />

      <div className="mx-auto w-full md:max-w-2xl lg:max-w-[1120px] lg:px-4">
        <Header />

        <div
          className={clsx(!isHomeRoute && "hidden", "relative z-[1]")}
          aria-hidden={!isHomeRoute}
        >
          <Home />
        </div>

        {!isHomeRoute && <Outlet />}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-[2] lg:hidden">
        <Navigation />
      </div>
    </div>
  );
}
