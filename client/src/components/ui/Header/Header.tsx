import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { ChevronLeft } from "lucide-react";
import { useTelegramBack } from "@/hooks/useTelegramBack";
import { useLocation } from "react-router-dom";
import clsx from "clsx";
import { s3Url } from "@/utils/s3utils";
import { useQuery } from "@tanstack/react-query";
import { getDisciplines } from "@/apiUtils/disciplines";
import { StepBar } from "@/components/ui/ds";

/** шаг записи для полосы прогресса (D3): услуга → дата и слот → детали → подтверждение */
const STAGE_STEP: Record<string, number> = { ServiceSelection: 1, TableSelection: 2, ServiceDetails: 3, Confirmation: 4 };
const STAGE_COUNT = 4;

const STAGE_TITLES = {
  ServiceSelection: "Выберите услугу",
  TableSelection: "Выберите слот для записи",
  ServiceDetails: "Детали записи",
  Confirmation: "Подтверждение записи",
};

export default function Header() {
  const { currentStage, previousStage } = useRegistrationStageStore();
  const { pathname } = useLocation();
  const { user } = useAuthStore();
  const { resetReservation, setSelectedTable, disciplineId } = useReservationStore();
  // у D&D свой порядок экранов — полосу шагов не показываем
  const disciplinesQuery = useQuery({ queryKey: ["disciplines"], queryFn: getDisciplines });
  const isDnd = disciplinesQuery.data?.find((d) => d.id === disciplineId)?.slug === "dnd";
  const step = STAGE_STEP[currentStage];

  const username = user ? user.firstName?.toUpperCase() : "";
  const isHomeRoute = pathname === "/";
  const isTitleOnlyRoute = ["/reservations", "/news", "/profile"].some((p) => pathname.startsWith(p));
  // у «Моих записей» и «Новостей» свой крупный заголовок — шапка с тем же названием не нужна (U8)
  const pageHasOwnTitle = ["/reservations", "/news", "/profile"].some((p) => pathname.startsWith(p));
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
          "sticky top-0 z-50 w-full flex items-center h-[60px] gap-3 px-5 text-accent bg-app-bg",
          // на широком экране раздел видно в боковой панели, а у страницы свой крупный заголовок
          isTitleOnlyRoute && "lg:hidden",
          pageHasOwnTitle && "hidden"
        )}
      >
        {pathname.startsWith("/profile") && (
          <p className="text-white text-md font-medium text-center w-full">
            Профиль
          </p>
        )}


        {isHomeRoute && currentStage === "Home" && (
          <>
            {/* лаймовый концепт (15.11.2026): логотип и название клуба, приветствие справа */}
            <img src={s3Url("logo.png")} alt="" className="size-9 lg:hidden" />
            <h1 className="font-display text-[20px] font-semibold uppercase tracking-[0.04em] text-fg">WarpHub</h1>
            {username && (
              <span className="ml-auto truncate text-[14px] text-fg-2">
                Привет, <span className="font-semibold text-fg">{user?.firstName}</span>
              </span>
            )}
          </>
        )}
        {isHomeRoute && currentStage !== "Home" && (
          <div className="w-full text-center relative lg:mx-auto lg:max-w-3xl">
            <button
              onClick={handleBackBtnClick}
              aria-label="Назад"
              className="absolute left-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-fg hover:cursor-pointer"
            >
              <ChevronLeft className="size-8" />
            </button>
            <p className="text-[16px] font-semibold text-fg">
              {STAGE_TITLES[currentStage]}
            </p>
          </div>
        )}
        {isHomeRoute && step && !isDnd && (
          <div className="absolute inset-x-4 bottom-1 lg:mx-auto lg:max-w-3xl">
            <StepBar step={step} total={STAGE_COUNT} />
          </div>
        )}
      </div>
    </>
  );
}
