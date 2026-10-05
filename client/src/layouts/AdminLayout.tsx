import Header from "@/components/ui/Header/Header";
import { Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="relative h-dvh w-full overflow-x-hidden overflow-y-scroll bg-app-bg pb-0">
      <Header />
      <Outlet />
    </div>
  );
}
