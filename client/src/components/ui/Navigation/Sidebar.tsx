import { getRosterAccess } from "@/apiUtils/roster";
import { useAuthStore } from "@/stores/useAuthStore";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { getFullName, getInitials } from "@/utils/user";
import { s3Url } from "@/utils/s3utils";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Calendar, ChevronRight, LayoutDashboard, Swords } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useNavItems } from "./useNavItems";

/** Ширина боковой панели на широком экране (используется и отступом контента в MainLayout). */
export const SIDEBAR_CLASS = "lg:pl-[260px]";

/**
 * Боковая панель на широком экране (≥1024 px): логотип, разделы, «Записаться», быстрые ссылки.
 * На телефоне и в узком окне Telegram Desktop не показывается — там нижняя панель.
 */
export default function Sidebar() {
  const items = useNavItems();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, isAdmin, isAuthenticated } = useAuthStore();
  const { currentStage, nextStage } = useRegistrationStageStore();
  const { setDisciplineId } = useReservationStore();

  const rosterAccess = useQuery({
    queryKey: ["roster-access"],
    queryFn: getRosterAccess,
    enabled: isAuthenticated,
  });

  // запись уже начата — кнопка возвращает к ней, иначе начинает новую
  const inFlow = currentStage !== "Home";
  const onBook = () => {
    if (pathname !== "/") navigate("/");
    if (!inFlow) {
      setDisciplineId(null);
      nextStage();
    }
  };
  const showBook = !(pathname === "/" && inFlow);

  return (
    <aside className="fixed inset-y-0 left-0 z-[3] hidden w-[260px] flex-col border-r border-white/[0.06] bg-app-subtle lg:flex">
      <div className="flex items-center gap-3 px-6 pb-6 pt-6">
        <img src={s3Url("logo.png")} alt="" className="size-10 rounded-lg" />
        <span className="text-xl tracking-wide text-accent [font-family:var(--font-oswald)]">WARPHUB</span>
      </div>

      <nav className="flex flex-col gap-1 px-3" aria-label="Разделы">
        {items.map((item) => (
          <button
            key={item.page}
            type="button"
            onClick={item.onClick}
            aria-current={item.isActive ? "page" : undefined}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium transition-colors",
              item.isActive ? "bg-accent/10 text-accent" : "text-white/70 hover:bg-white/[0.05] hover:text-white"
            )}
          >
            <span className="size-5 [&>svg]:size-5">{item.icon}</span>
            {item.title}
          </button>
        ))}
      </nav>

      {showBook && (
        <div className="px-4 pt-6">
          <button
            type="button"
            onClick={onBook}
            className="register-btn-glow flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent px-4 py-3 text-base font-semibold text-accent-foreground transition-transform hover:brightness-105 active:scale-95"
          >
            <Calendar className="size-5" />
            {inFlow ? "Продолжить запись" : "Записаться"}
          </button>
        </div>
      )}

      <div className="mt-auto space-y-1 px-3 pb-4">
        {rosterAccess.data?.hasAccess && (
          <SideLink icon={<Swords className="size-5" />} label="WarpBuilder" onClick={() => navigate("/roster")} />
        )}
        {isAdmin && <SideLink icon={<LayoutDashboard className="size-5" />} label="Админ-панель" onClick={() => navigate("/admin")} />}
        {user && (
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="mt-2 flex w-full items-center gap-3 rounded-xl border border-white/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-accent/60 text-sm font-semibold text-accent">
              {getInitials(user.firstName ?? "", user.lastName ?? "")}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{getFullName(user.firstName ?? "", user.lastName ?? "") || "Профиль"}</span>
              {user.username && <span className="block truncate text-xs text-white/45">@{user.username}</span>}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}

function SideLink({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.05] hover:text-white"
    >
      {icon}
      <span className="flex-1">{label}</span>
      <ChevronRight className="size-4 text-white/30" />
    </button>
  );
}
