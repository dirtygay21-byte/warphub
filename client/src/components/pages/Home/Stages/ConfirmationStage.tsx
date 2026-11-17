import { getServiceById } from "@/apiUtils/disciplines";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CalendarPlus, RotateCcw, Send } from "lucide-react";
import { formatClubTime, formatClubTimeRange } from "@/utils/clubTime";
import { hoursLabel } from "@/utils/slots";
import { getServiceDetailsMeta } from "./ServiceDetails/utils";
import { formatSelectedDate } from "@/utils/date";
import { DsButton, LimeHero } from "@/components/ui/ds";
import { ConfirmTicket } from "@/components/booking/ConfirmTicket";
import { s3Url } from "@/utils/s3utils";
import { downloadFile, shareToChat } from "@/utils/telegramApp";
import { openGameShareText } from "@/utils/openGameShare";

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
    selectedSlot,
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
  const placeLabel = selectedSlot?.kind === "new" ? selectedSlot.label : selectedSlot?.kind === "join" ? "игра с соперником" : null;
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
    <div className="ds-enter mx-auto flex max-w-sm flex-col gap-3 overflow-hidden px-5 pb-8 pt-3 text-fg">
      {isSuccess ? (
        <>
          {/* итоговый билет (17.11.2026): падает, корешок отрывается, штамп клуба — см. booking/ConfirmTicket.tsx */}
          <div className="pt-3 text-center">
            <h2 className="font-display text-[34px] font-bold uppercase leading-none">{lastBooking?.joined ? "Ты в игре!" : "Ты записан!"}</h2>
            <p className="cf-late mt-2 text-sm text-fg-2">Мы напомним тебе за 1 час до начала игры.</p>
          </div>
          <div className="mt-4">
            <ConfirmTicket
              image={apiService?.slug ? s3Url(`services/${apiService.slug}.webp`) : null}
              kicker={[serviceQuery.isLoading ? "Загрузка…" : (activity ?? discipline ?? "Запись"), placeLabel].filter(Boolean).join(" · ")}
              title={formatSelectedDate(selectedDate)}
              facts={[
                { label: "Время", value: time },
                { label: lastBooking?.joined ? "Игроки" : "Места", value: placesLabel },
              ]}
              stub={
                lastBooking?.startsAt ? (
                  <>
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] opacity-60">Начало</span>
                    <span className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums">{formatClubTime(lastBooking.startsAt)}</span>
                    {lastBooking.endsAt && <span className="mt-1 text-[12px] font-bold">до {formatClubTime(lastBooking.endsAt)}</span>}
                  </>
                ) : (
                  <span className="text-[12px] font-bold">Готово</span>
                )
              }
            />
          </div>
        </>
      ) : (
        <LimeHero tone="danger" kicker="Ошибка" title="Запись не создана" className="ds-pop">
          <p>Не удалось подтвердить запись. Попробуй еще раз.</p>
        </LimeHero>
      )}

      {isSuccess && limited && fullMinutes && lastBooking?.endsAt && (
        <div role="status" className="cf-late rounded-[14px] border border-white/10 bg-app-elevated px-4 py-3 text-sm text-fg">
          <p className="font-semibold text-warn">
            Время ограничено: {hoursLabel(limited)} вместо {hoursLabel(fullMinutes)} — до {formatClubTime(lastBooking.endsAt)}
          </p>
          <p className="mt-1 text-fg-2">
            Если не успеете, попросим освободить место к следующей записи; если будет свободно — постараемся продлить.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2.5">
        {isSuccess ? (
          // на экране уже есть лаймовый билет — кнопка не лаймовая (правило «одна большая лаймовая заливка»)
          <DsButton variant="secondary" size="lg" onClick={handleMyRecordsClick} className="w-full">
            Мои записи
          </DsButton>
        ) : (
          <DsButton variant="primary" size="lg" onClick={previousStage} className="w-full">
            <RotateCcw className="size-5" />
            Попробовать снова
          </DsButton>
        )}
        {/* этап 2 (15.11.2026): один за столом на двоих — позвать соперника в чат Telegram */}
        {isSuccess && !lastBooking?.joined && lastBooking?.startsAt && selectedSlot?.kind === "new" && selectedSlot.capacity > 1 && (lastBooking.partySize ?? 1) < selectedSlot.capacity && (
          <DsButton
            variant="secondary"
            size="lg"
            onClick={() =>
              shareToChat(openGameShareText({ serviceTitle: activity ?? null, startsAt: lastBooking.startsAt!, endsAt: lastBooking.endsAt ?? lastBooking.startsAt!, players: [] }))
            }
            className="w-full"
          >
            <Send className="size-5" />
            Позвать соперника в чат
          </DsButton>
        )}
        {isSuccess && lastBooking?.id && (
          <DsButton
            variant="secondary"
            size="lg"
            onClick={() => downloadFile(`${import.meta.env.VITE_BACKEND_API_URL}/reservations/${lastBooking.id}/calendar.ics`, "warphub.ics")}
            className="w-full"
          >
            <CalendarPlus className="size-5" />
            Добавить в календарь
          </DsButton>
        )}
        <DsButton variant="secondary" size="lg" onClick={handleHomeClick} className="w-full">
          На главную
        </DsButton>
      </div>
    </div>
  );
}
