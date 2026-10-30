import Header from "@/components/ui/Header/Header";
import { useTelegramBack } from "@/hooks/useTelegramBack";
import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export default function AdminLayout() {
  const navigate = useNavigate();
  // из админки «Назад» Telegram возвращает в профиль, откуда в неё входят (C1)
  useTelegramBack(() => navigate("/profile"));
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div ref={scroller} className="relative h-dvh w-full overflow-x-hidden overflow-y-scroll bg-app-bg pb-0">
      {/* на широком экране — колонка до 1280 px по центру (вкладки разделов выровнены по ней же) */}
      <div className="mx-auto w-full max-w-screen-2xl">
        <Header />
        <Outlet />
      </div>
    </div>
  );
}
