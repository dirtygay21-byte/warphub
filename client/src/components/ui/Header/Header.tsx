import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { ChevronLeft } from "lucide-react";
import { useTelegramBack } from "@/hooks/useTelegramBack";
import { useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { s3Url } from "@/utils/s3utils";

const STAGE_TITLES = {
  ServiceSelection: "Выберите услугу",
  TableSelection: "Выберите слот для записи",
  ServiceDetails: "Детали записи",
  Confirmation: "Подтверждение записи",
};

export default function Header() {
  const { currentStage, previousStage } = useRegistrationStageStore();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { resetReservation, setSelectedTable } = useReservationStore();

  const username = user ? user.firstName?.toUpperCase() : "";
  const isAdminRoute = pathname.startsWith("/admin");
  const isHomeRoute = pathname === "/";
  const isTitleOnlyRoute = ["/reservations", "/news", "/profile"].some((p) => pathname.startsWith(p));
  // у «Моих записей» и «Новостей» свой крупный заголовок — шапка с тем же названием не нужна (U8)
  const pageHasOwnTitle = ["/reservations", "/news"].some((p) => pathname.startsWith(p));
  const adminSection = pathname.includes("/content")
    ? "ContentManagement"
    : pathname.includes("/warhammer")
      ? "Warhammer"
      : pathname.includes("/dnd")
        ? "Dnd"
        : pathname.includes("/roster")
          ? "Roster"
          : pathname.includes("/rewards")
            ? "Rewards"
            : pathname.includes("/admins")
              ? "Admins"
              : "Reservations";

  const adminTabs = [
    { id: "Reservations", label: "Записи", path: "/admin" },
    { id: "Warhammer", label: "Столы WH", path: "/admin/warhammer" },
    { id: "Dnd", label: "D&D", path: "/admin/dnd" },
    { id: "Rewards", label: "Награды", path: "/admin/rewards" },
    { id: "ContentManagement", label: "Контент", path: "/admin/content" },
    { id: "Roster", label: "Ростеры", path: "/admin/roster" },
    { id: "Admins", label: "Админы", path: "/admin/admins" },
  ];

  // Обрабатываем нажатия на кнопку назад и чистим соответсвующий стейт
  const handleBackBtnClick = () => {
    switch (currentStage) {
      case "ServiceSelection":
        resetReservation();
        break;
      case "TableSelection":
        setSelectedTable(null);
        break;
    }
    previousStage();
  };
  // шаги записи — «Назад» Telegram ведёт на шаг назад (U1)
  useTelegramBack(isHomeRoute && currentStage !== "Home" ? handleBackBtnClick : null);

  return (
    <>
      <div
        className={clsx(
          "sticky top-0 z-50 w-full flex items-center h-[60px] gap-6 px-4 text-accent bg-app-bg",
          // на широком экране раздел видно в боковой панели, а у страницы свой крупный заголовок
          isTitleOnlyRoute && "lg:hidden",
          pageHasOwnTitle && "hidden",
          isAdminRoute && "lg:px-6"
        )}
      >
        {pathname.startsWith("/profile") && (
          <p className="text-white text-md font-medium text-center w-full">
            Профиль
          </p>
        )}

        {isAdminRoute && (
          <div className="flex w-full items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* выход из админки — первым, чтобы на телефоне не уезжал за край ряда вкладок (C1) */}
            <button
              type="button"
              onClick={() => navigate("/profile")}
              aria-label="Выйти из админ-панели"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/3 text-white/80 transition-colors active:bg-white/10"
            >
              <ChevronLeft className="size-5" />
            </button>
            {adminTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => navigate(tab.path)}
                className={clsx(
                  "shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:text-sm",
                  adminSection === tab.id
                    ? "bg-accent text-accent-foreground"
                    : "border border-white/10 bg-white/3 text-white/80 active:bg-white/10"
                )}
              >
                {tab.label}
              </button>
            ))}

          </div>
        )}

        {isHomeRoute && currentStage === "Home" && (
          <>
            <img src={s3Url("logo.png")} alt="logo" className="size-10 lg:hidden" />
            <h1 className="text-md [font-family:var(--font-oswald)]">
              {`ДОБРО ПОЖАЛОВАТЬ${username ? `, ${username}` : ""} !`}
            </h1>
          </>
        )}
        {isHomeRoute && currentStage !== "Home" && (
          <div className="w-full text-center relative lg:mx-auto lg:max-w-3xl">
            <button
              onClick={handleBackBtnClick}
              className="text-white flex items-center gap-2 hover:cursor-pointer absolute left-0 top-1/2 -translate-y-1/2"
            >
              <ChevronLeft className="size-8" />
            </button>
            <p className="text-white text-md font-medium">
              {STAGE_TITLES[currentStage]}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
