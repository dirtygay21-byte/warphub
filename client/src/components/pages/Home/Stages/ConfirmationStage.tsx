import { getServiceById } from "@/apiUtils/disciplines";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  RotateCcw,
  UsersRound,
  XCircle,
} from "lucide-react";
import { formatClubTimeRange } from "@/utils/clubTime";
import type { ReactNode } from "react";
import { getServiceDetailsMeta } from "./ServiceDetails/utils";
import { formatSelectedDate } from "@/utils/date";

type ConfirmationStatus = "Success" | "Succes" | "Error";

const confetti = [
  "left-[18%] top-[15%] bg-accent",
  "left-[27%] top-[9%] bg-green-400",
  "left-[73%] top-[14%] bg-yellow-400",
  "left-[82%] top-[22%] bg-red-400",
  "left-[13%] top-[38%] bg-orange-400",
  "left-[78%] top-[40%] bg-green-400",
  "left-[22%] top-[52%] bg-green-400",
  "left-[64%] top-[7%] bg-accent",
];

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

  return (
    <div className="relative min-h-[calc(100dvh-160px)] overflow-hidden px-6 py-8 text-center text-white">
      {isSuccess && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-52">
          {confetti.map((className) => (
            <span
              key={className}
              className={`absolute size-1.5 rounded-full shadow-[0_0_12px_currentColor] ${className}`}
            />
          ))}
        </div>
      )}

      <div className="relative mx-auto flex max-w-sm flex-col items-center">
        <div
          className={`mb-5 flex size-28 items-center justify-center rounded-full border shadow-[0_0_36px_currentColor] ${
            isSuccess
              ? "border-green-400/70 bg-green-400/15 text-green-400"
              : "border-red-400/70 bg-red-400/15 text-red-400"
          }`}
        >
          {isSuccess ? (
            <CheckCircle2 className="size-16" />
          ) : (
            <XCircle className="size-16" />
          )}
        </div>

        <h2 className="text-2xl font-semibold">
          {!isSuccess
            ? "Запись не создана"
            : lastBooking?.joined
              ? "Ты в игре!"
              : "Ты записан!"}
        </h2>
        <p className="mt-2 text-base text-white/60">
          {isSuccess
            ? "Мы ждем тебя в клубе"
            : "Не удалось подтвердить запись. Попробуй еще раз."}
        </p>

        <div className="mt-5 w-full rounded-xl border border-white/10 bg-app-elevated/90 p-4 text-left">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold leading-tight">
              {serviceQuery.isLoading
                ? "Загрузка..."
                : (activity ?? "Услуга")}
            </h3>
            {discipline && (
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/75">
                {discipline}
              </span>
            )}
          </div>

          <div className="space-y-3">
            <InfoRow
              icon={<CalendarDays className="size-5" />}
              value={formatSelectedDate(selectedDate)}
            />
            <InfoRow icon={<Clock3 className="size-5" />} value={time} />
            <InfoRow icon={<UsersRound className="size-5" />} value={placesLabel} />
          </div>
        </div>

        {isSuccess ? (
          <>
            <div className="mt-3 w-full rounded-xl bg-white/6 px-4 py-3 text-sm text-white/70">
              Мы напомним тебе за 1 час до начала игры.
            </div>

            <button
              type="button"
              onClick={handleMyRecordsClick}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-4 text-base font-semibold text-accent-foreground transition-transform active:scale-95"
            >
              Мои записи
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={previousStage}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-4 text-base font-semibold text-accent-foreground transition-transform active:scale-95"
          >
            <RotateCcw className="size-5" />
            Попробовать снова
          </button>
        )}

        <button
          type="button"
          onClick={handleHomeClick}
          className="mt-3 w-full rounded-xl border border-white/15 bg-white/3 px-4 py-4 text-base font-semibold text-white transition-colors active:bg-white/10"
        >
          На главную
        </button>
      </div>
    </div>
  );
}

function InfoRow({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-white/85">
      <span className="text-white/75">{icon}</span>
      <span>{value}</span>
    </div>
  );
}
