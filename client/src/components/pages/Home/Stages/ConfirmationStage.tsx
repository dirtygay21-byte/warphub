import { getServiceById } from "@/apiUtils/disciplines";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Clock3,
  RotateCcw,
  UsersRound,
} from "lucide-react";
import { formatClubTime, formatClubTimeRange } from "@/utils/clubTime";
import { hoursLabel } from "@/utils/slots";
import { getServiceDetailsMeta } from "./ServiceDetails/utils";
import { formatSelectedDate } from "@/utils/date";
import { LimeChip, Worm } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";

type ConfirmationStatus = "Success" | "Succes" | "Error";


export default function ConfirmationStage({
  status = "Success",
}: {
  status?: ConfirmationStatus;
}) {
  const {
    disciplineId,
    resetReservation,
    selectedDate,
    selectedTable,
    serviceId,
    lastBooking,
  } = useReservationStore();
  const { resetStages, previousStage } = useRegistrationStageStore();
  const navigate = useNavigate();

  const serviceQuery = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () => getServiceById(serviceId!),
    enabled: serviceId !== null,
  });

  const apiService = serviceQuery.data;

  const { discipline, activity } = getServiceDetailsMeta({
    disciplineId,
    apiService,
    selectedTable,
  });

  const isSuccess = status !== "Error";
  const time = lastBooking?.startsAt
    ? formatClubTimeRange(lastBooking.startsAt, lastBooking.endsAt)
    : "—";
  // B1: запись короче полной длительности услуги — красное предупреждение
  const fullMinutes = apiService?.duration ?? null;
  const bookedMinutes =
    lastBooking?.startsAt && lastBooking.endsAt
      ? Math.round((new Date(lastBooking.endsAt).getTime() - new Date(lastBooking.startsAt).getTime()) / 60_000)
      : null;
  const limited = fullMinutes && bookedMinutes && bookedMinutes < fullMinutes ? bookedMinutes : null;
  const placesLabel = lastBooking?.joined
    ? "Стол собран — вы играете вдвоём"
    : `Мест: ${lastBooking?.partySize ?? 1}`;

  const resetRegistrationFlow = () => {
    resetStages();
    resetReservation();
  };

  const handleMyRecordsClick = () => {
    resetRegistrationFlow();
    navigate("/reservations");
  };

  const handleHomeClick = () => {
    resetRegistrationFlow();
    navigate("/");
  };

  const ink = "#111110";
  return (
    <div className="ds-enter px-4 pb-6 pt-2">
      {/* лаймовый концепт (15.11.2026): итог записи — лаймовый экран с червяками (красный — запись не создана) */}
      <section
        className={`ds-pop relative isolate flex min-h-[calc(100dvh-180px)] flex-col overflow-hidden rounded-[26px] px-5 pb-5 pt-7 text-[#111110] ${
          isSuccess ? "bg-accent" : "bg-danger"
        }`}
      >
        <svg aria-hidden="true" width="100%" height="100%" className="pointer-events-none absolute inset-0">
          <svg x="100%" y="0" overflow="visible">
            <Worm x={-70} y={40} angle={40} period={320} amp={34} width={40} seconds={8} />
          </svg>
          <svg x="0" y="100%" overflow="visible">
            <Worm x={40} y={-30} angle={-30} period={200} amp={22} width={30} seconds={6} />
          </svg>
        </svg>

        <div className="relative mt-24 font-display text-[16px] font-semibold uppercase tracking-[0.18em]">
          {isSuccess ? "Готово" : "Ошибка"}
        </div>
        <h2 className="relative mt-2 max-w-[11ch] font-display text-[52px] font-bold uppercase leading-[0.95]">
          {!isSuccess ? "Запись не создана" : lastBooking?.joined ? "Ты в игре!" : "Ты записан!"}
        </h2>
        <p className="relative mt-3 text-[16px] font-medium">
          {isSuccess ? "Мы ждем тебя в клубе" : "Не удалось подтвердить запись. Попробуй еще раз."}
        </p>

        <div className="relative mt-5 font-display text-[22px] font-semibold uppercase leading-tight">
          {serviceQuery.isLoading ? "Загрузка…" : (activity ?? "Услуга")}
        </div>
        <div className="relative mt-3 flex flex-wrap gap-2">
          {discipline && <LimeChip accent>{discipline}</LimeChip>}
          <LimeChip>
            <CalendarDays className="mr-1.5 size-4" />
            {formatSelectedDate(selectedDate)}
          </LimeChip>
          <LimeChip>
            <Clock3 className="mr-1.5 size-4" />
            {time}
          </LimeChip>
          <LimeChip>
            <UsersRound className="mr-1.5 size-4" />
            {placesLabel}
          </LimeChip>
        </div>

        {isSuccess && limited && fullMinutes && lastBooking?.endsAt && (
          <div role="status" className="relative mt-4 rounded-[14px] bg-[#111110] px-4 py-3 text-left text-sm text-fg">
            <p className="font-semibold text-danger">
              ⚠️ Время ограничено: {hoursLabel(limited)} вместо {hoursLabel(fullMinutes)} — до {formatClubTime(lastBooking.endsAt)}
            </p>
            <p className="mt-1 text-fg-2">
              Если не успеете, попросим освободить место к следующей записи; если будет свободно — постараемся продлить.
            </p>
          </div>
        )}

        {isSuccess && <p className="relative mt-4 max-w-[30ch] text-[15px] leading-snug">Мы напомним тебе за 1 час до начала игры.</p>}

        <div className="relative mt-auto flex flex-col gap-2.5 pt-6">
          {isSuccess ? (
            <button
              type="button"
              onClick={() => (haptic.tap(), handleMyRecordsClick())}
              className="ds-press flex min-h-[54px] items-center justify-center rounded-[16px] bg-[#111110] font-display text-[18px] font-semibold uppercase tracking-[0.06em] text-accent"
            >
              Мои записи
            </button>
          ) : (
            <button
              type="button"
              onClick={() => (haptic.tap(), previousStage())}
              className="ds-press flex min-h-[54px] items-center justify-center gap-2 rounded-[16px] bg-[#111110] font-display text-[18px] font-semibold uppercase tracking-[0.06em] text-danger"
            >
              <RotateCcw className="size-5" />
              Попробовать снова
            </button>
          )}
          <button
            type="button"
            onClick={() => (haptic.tap(), handleHomeClick())}
            className="ds-press flex min-h-[52px] items-center justify-center rounded-[16px] border-2 font-semibold"
            style={{ borderColor: ink }}
          >
            На главную
          </button>
        </div>
      </section>
    </div>
  );
}

