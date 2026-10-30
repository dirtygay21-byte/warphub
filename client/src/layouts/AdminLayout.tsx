import AdminNav from "@/components/pages/Admin/AdminNav";
import { useTelegramBack } from "@/hooks/useTelegramBack";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

export default function AdminLayout() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  // «Назад» Telegram: сначала закрывает список разделов, иначе — в профиль, откуда в админку входят (C1)
  useTelegramBack(() => (menuOpen ? setMenuOpen(false) : navigate("/profile")));
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <div ref={scroller} className="relative h-dvh w-full overflow-x-hidden overflow-y-scroll bg-app-bg pb-0">
      {/* на широком экране — колонка до 1280 px по центру (вкладки разделов выровнены по ней же) */}
      <div className="mx-auto w-full max-w-screen-2xl">
        <AdminNav open={menuOpen} onOpenChange={setMenuOpen} />
        <Outlet />
      </div>
    </div>
  );
}
