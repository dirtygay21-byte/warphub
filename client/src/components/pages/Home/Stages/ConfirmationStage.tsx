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
import type { ReactNode } from "react";
import { getServiceDetailsMeta } from "./ServiceDetails/utils";
import { formatSelectedDate } from "@/utils/date";
import { DsButton, LimeHero } from "@/components/ui/ds";

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

  return (
    <div className="ds-enter relative min-h-[calc(100dvh-160px)] overflow-hidden px-5 py-8 text-center text-fg">
      {isSuccess && (
        <div className="fx-strong-only pointer-events-none absolute inset-x-0 top-0 h-52">
          {confetti.map((className) => (
            <span
              key={className}
              className={`absolute size-1.5 rounded-full shadow-[0_0_12px_currentColor] ${className}`}
            />
          ))}
        </div>
      )}

      <div className="relative mx-auto flex max-w-sm flex-col items-center">
        {/* лаймовый концепт (15.11.2026): итог — цветной блок с червяками (лайм — записан, красный — ошибка) */}
        <LimeHero
          tone={isSuccess ? "lime" : "danger"}
          kicker={isSuccess ? "Готово" : "Ошибка"}
          title={!isSuccess ? "Запись не создана" : lastBooking?.joined ? "Ты в игре!" : "Ты записан!"}
          className="ds-pop w-full text-left"
        >
          <p className="text-base font-medium">
            {isSuccess ? "Мы ждем тебя в клубе" : "Не удалось подтвердить запись. Попробуй еще раз."}
          </p>
        </LimeHero>

        <div className="mt-4 w-full rounded-[18px] border border-white/10 bg-app-elevated p-4 text-left">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h3 className="text-[17px] font-bold leading-tight">
              {serviceQuery.isLoading
                ? "Загрузка…"
                : (activity ?? "Услуга")}
            </h3>
            {discipline && (
              <span className="shrink-0 whitespace-nowrap rounded-lg bg-white/[0.08] px-2 py-1 text-[12px] font-semibold text-fg-2">
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

        {isSuccess && limited && fullMinutes && lastBooking?.endsAt && (
          <div role="status" className="mt-3 w-full rounded-[14px] border border-danger/50 bg-danger/10 px-4 py-3 text-left text-sm text-fg">
            <p className="font-semibold text-danger">
              ⚠️ Время ограничено: {hoursLabel(limited)} вместо {hoursLabel(fullMinutes)} — до {formatClubTime(lastBooking.endsAt)}
            </p>
            <p className="mt-1 text-fg-2">
              Если не успеете, попросим освободить место к следующей записи; если будет свободно — постараемся продлить.
            </p>
          </div>
        )}

        {isSuccess ? (
          <>
            <div className="mt-3 w-full rounded-[14px] bg-white/[0.05] px-4 py-3 text-sm text-fg-2">
              Мы напомним тебе за 1 час до начала игры.
            </div>

            <DsButton variant="primary" size="lg" onClick={handleMyRecordsClick} className="mt-5 w-full">
              Мои записи
            </DsButton>
          </>
        ) : (
          <DsButton variant="primary" size="lg" onClick={previousStage} className="mt-5 w-full">
            <RotateCcw className="size-5" />
            Попробовать снова
          </DsButton>
        )}

        <DsButton variant="secondary" size="lg" onClick={handleHomeClick} className="mt-3 w-full">
          На главную
        </DsButton>
      </div>
    </div>
  );
}

function InfoRow({ icon, value }: { icon: ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-3 text-[15px] text-fg">
      <span className="text-fg-2">{icon}</span>
      <span>{value}</span>
    </div>
  );
}
