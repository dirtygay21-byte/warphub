import Header from "@/components/ui/Header/Header";
import { Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="relative h-dvh w-full overflow-x-hidden overflow-y-scroll bg-app-bg pb-0">
      {/* на широком экране — колонка до 1280 px по центру (вкладки разделов выровнены по ней же) */}
      <div className="mx-auto w-full max-w-screen-2xl">
        <Header />
        <Outlet />
      </div>
    </div>
  );
}
