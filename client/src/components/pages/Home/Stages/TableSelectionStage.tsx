import { getAvailability } from "@/apiUtils/booking";
import { getDisciplines, getServices } from "@/apiUtils/disciplines";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useQuery } from "@tanstack/react-query";
import { Info, Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import DateSelector from "./TableSelection/DateSelector";
import ScheduleUnavailableMessage from "./TableSelection/ScheduleUnavailableMessage";
import SeatCountControl from "./TableSelection/SeatCountControl";
import {
  FreeSlotCard,
  FullSessionRow,
  OpenSessionCard,
  PoolSlotCard,
  SectionTitle,
} from "./TableSelection/SessionCards";
import TableStateMessage from "./TableSelection/TableStateMessage";
import { getDateKey, getToday, isDateInSchedule } from "./TableSelection/utils";
import { getWindowLimit, minFreeSeats } from "@/utils/slots";
import { DsButton } from "@/components/ui/ds";
import { pluralizeRu } from "@/utils/plural";

const CLUB_VISIT_SLUG = "club_visit";

/** Разрешённые дни: общее правило (пт–вс) ∩ расписание дисциплины */
const intersectWeekdays = (base: number[], discipline?: number[]) =>
  discipline && discipline.length > 0
    ? base.filter((day) => discipline.includes(day))
    : base;

export default function TableSelectionStage() {
  const {
    disciplineId,
    serviceId,
    selectedDate,
    setPartyCount,
    setSelectedDate,
    setSelectedSlot,
  } = useReservationStore();
  const { nextStage } = useRegistrationStageStore();
  const options = useBookingOptions();
  const selectedDateKey = getDateKey(selectedDate);

  const servicesQuery = useQuery({
    queryKey: ["services", disciplineId],
    queryFn: () => getServices(disciplineId),
    enabled: disciplineId !== null,
  });
  const disciplinesQuery = useQuery({
    queryKey: ["disciplines"],
    queryFn: getDisciplines,
  });

  const selectedService = servicesQuery.data?.find(
    (service) => service.id === serviceId,
  );
  const selectedDiscipline = disciplinesQuery.data?.find(
    (discipline) => discipline.id === disciplineId,
  );
  const allowedWeekdays = intersectWeekdays(
    options.allowedWeekdays,
    selectedDiscipline?.scheduleWeekdays,
  );
  const isSelectedDateAllowed = isDateInSchedule(selectedDate, allowedWeekdays);

  // Если сегодня запись закрыта (например, понедельник), сразу выбираем
  // ближайший разрешённый день.
  const allowedKey = allowedWeekdays.join(",");
  useEffect(() => {
    if (isSelectedDateAllowed || allowedWeekdays.length === 0) return;
    const today = getToday();
    for (let offset = 0; offset < 15; offset++) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + offset);
      if (isDateInSchedule(candidate, allowedWeekdays)) {
        setSelectedDate(candidate);
        return;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, allowedKey]);

  const availabilityQuery = useQuery({
    queryKey: ["service-availability", serviceId, selectedDateKey],
    queryFn: () => getAvailability(serviceId!, selectedDateKey),
    enabled: isSelectedDateAllowed && serviceId !== null,
  });

  const availability = availabilityQuery.data;
  const service = availability?.service;
  const durationMinutes = service?.duration ?? selectedService?.duration ?? 60;
  const isClubVisit = selectedService?.slug === CLUB_VISIT_SLUG;

  const [visitorCount, setVisitorCount] = useState(1);

  const { openSessions, fullSessions, freeSlots } = useMemo(() => {
    const sessions = availability?.sessions ?? [];
    return {
      openSessions: sessions.filter((session) => session.freeSeats > 0),
      fullSessions: sessions.filter((session) => session.freeSeats <= 0),
      freeSlots: (availability?.slots ?? []).flatMap((slot, tableIndex) =>
        slot.segments
          .filter((segment) => segment.freeSeats > 0)
          .map((segment) => ({
            tableId: slot.table.id,
            label: `Свободный слот ${tableIndex + 1}`,
            segment,
            segments: slot.segments,
            capacity: slot.table.seatCapacity,
          })),
      ),
    };
  }, [availability]);

  const poolSlot = availability?.slots[0];

  const handlePoolSelect = (segmentIndex: number) => {
    if (!poolSlot || !service) return;
    const segment = poolSlot.segments[segmentIndex]!;
    setPartyCount(1);
    setSelectedSlot({
      kind: "pool",
      window: { startsAt: segment.startsAt, endsAt: segment.endsAt },
      segments: poolSlot.segments,
      capacity: service.poolCapacity ?? poolSlot.table.seatCapacity,
      freeSeats: segment.freeSeats,
      minMinutes: service.minDuration,
    });
    nextStage();
  };

  const handleClubVisitContinue = () => {
    if (!poolSlot || !service || poolSlot.segments.length === 0) return;
    const first = poolSlot.segments[0]!;
    const last = poolSlot.segments[poolSlot.segments.length - 1]!;
    setPartyCount(visitorCount);
    setSelectedSlot({
      kind: "pool",
      window: { startsAt: first.startsAt, endsAt: last.endsAt },
      segments: poolSlot.segments,
      capacity: service.poolCapacity ?? poolSlot.table.seatCapacity,
      freeSeats: minFreeSeats(poolSlot.segments),
      minMinutes: service.minDuration,
    });
    nextStage();
  };

  const renderContent = () => {
    if (serviceId === null || disciplineId === null) {
      return <TableStateMessage>Сначала выберите услугу.</TableStateMessage>;
    }
    if (availabilityQuery.isLoading) {
      return <TableStateMessage>Загружаем свободное время…</TableStateMessage>;
    }
    if (availabilityQuery.isError || !availability || !service) {
      return (
        <TableStateMessage>
          Не удалось загрузить свободное время. Попробуйте выбрать дату ещё раз.
        </TableStateMessage>
      );
    }
    if (!availability.dateAllowed) {
      return (
        <ScheduleUnavailableMessage
          disciplineTitle={selectedDiscipline?.title}
          scheduleWeekdays={availability.allowedWeekdays}
        />
      );
    }

    if (service.mode === "pool" && isClubVisit) {
      const free = poolSlot ? minFreeSeats(poolSlot.segments) : 0;
      const maxVisitors = Math.max(
        1,
        Math.min(service.visitorsCapacity ?? free, free),
      );
      if (!poolSlot || poolSlot.segments.length === 0 || free <= 0) {
        return (
          <TableStateMessage>На выбранную дату свободных мест нет.</TableStateMessage>
        );
      }
      return (
        <section className="space-y-4">
          <div className="rounded-[16px] border border-white/10 bg-app-elevated p-4">
            <p className="text-[13px] font-bold uppercase tracking-[0.08em] text-fg-3">
              Сколько человек придёт
            </p>
            <SeatCountControl
              disabled={false}
              maxPartyCount={maxVisitors}
              selectedPartyCount={Math.min(visitorCount, maxVisitors)}
              onChange={(count) =>
                setVisitorCount(Math.min(Math.max(count, 1), maxVisitors))
              }
            />
          </div>
          <DsButton variant="primary" size="lg" onClick={handleClubVisitContinue} className="w-full">
            Продолжить
          </DsButton>
        </section>
      );
    }

    if (service.mode === "pool") {
      const segments = poolSlot?.segments ?? [];
      return (
        <section>
          <SectionTitle hint={`Всего мест: ${service.poolCapacity ?? "—"}`}>
            Выберите время
          </SectionTitle>
          <div className="flex flex-col gap-3">
            {segments.length === 0 ? (
              <TableStateMessage>На выбранную дату записи нет.</TableStateMessage>
            ) : (
              segments.map((segment, index) => (
                <PoolSlotCard
                  key={`${segment.startsAt}-${segment.endsAt}`}
                  segment={segment}
                  capacity={service.poolCapacity ?? poolSlot!.table.seatCapacity}
                  durationMinutes={durationMinutes}
                  limit={getWindowLimit({ segments, within: segment, durationMinutes, partySize: 1, minMinutes: service.minDuration })}
                  onSelect={() => handlePoolSelect(index)}
                />
              ))
            )}
          </div>
        </section>
      );
    }

    if (service.mode !== "table") {
      return (
        <TableStateMessage>
          Эту услугу пока нельзя забронировать онлайн.
        </TableStateMessage>
      );
    }

    const capacity = service.seatsPerTable ?? 1;
    const isMultiplayer = capacity >= 2;

    return (
      <div className="space-y-7">
        {isMultiplayer && (
          <section>
            <SectionTitle
              icon={<Swords className="size-5 text-accent" />}
              hint="Здесь уже есть игрок — посмотрите его армию и присоединяйтесь"
            >
              Ищут соперника{openSessions.length > 0 ? ` · ${openSessions.length}` : ""}
            </SectionTitle>
            <div className="flex flex-col gap-3">
              {openSessions.length === 0 ? (
                <TableStateMessage>
                  Пока никто не ждёт соперника. Начните новую игру ниже —
                  другие игроки смогут к вам присоединиться.
                </TableStateMessage>
              ) : (
                openSessions.map((session) => (
                  <OpenSessionCard
                    key={`${session.tableId}-${session.startsAt}`}
                    session={session}
                    hasTrainer={service.hasTrainer}
                    onJoin={() => {
                      setPartyCount(1);
                      setSelectedSlot({
                        kind: "join",
                        tableId: session.tableId,
                        startsAt: session.startsAt,
                        endsAt: session.endsAt,
                        occupied: session.occupied,
                        capacity: session.capacity,
                        players: session.players,
                      });
                      nextStage();
                    }}
                  />
                ))
              )}
            </div>
          </section>
        )}

        <section>
          <SectionTitle
            hint={
              isMultiplayer
                ? "Вы будете первым игроком, второй сможет присоединиться"
                : undefined
            }
          >
            {isMultiplayer ? "Начать новую игру" : "Свободное время"}
          </SectionTitle>
          <div className="flex flex-col gap-3">
            {freeSlots.length === 0 ? (
              <TableStateMessage>На выбранную дату свободных мест нет.</TableStateMessage>
            ) : (
              freeSlots.map((slot) => (
                <FreeSlotCard
                  key={`${slot.tableId}-${slot.segment.startsAt}`}
                  label={slot.label}
                  segment={slot.segment}
                  durationMinutes={durationMinutes}
                  limit={getWindowLimit({ segments: slot.segments, within: slot.segment, durationMinutes, partySize: 1, minMinutes: service.minDuration })}
                  capacity={capacity}
                  hasTrainer={service.hasTrainer}
                  onSelect={() => {
                    setPartyCount(1);
                    setSelectedSlot({
                      kind: "new",
                      tableId: slot.tableId,
                      label: slot.label,
                      window: {
                        startsAt: slot.segment.startsAt,
                        endsAt: slot.segment.endsAt,
                      },
                      segments: slot.segments,
                      capacity,
                      minMinutes: service.minDuration,
                    });
                    nextStage();
                  }}
                />
              ))
            )}
          </div>
        </section>

        {fullSessions.length > 0 && (
          <section>
            <SectionTitle>Полностью заняты</SectionTitle>
            <div className="flex flex-col gap-2">
              {fullSessions.map((session) => (
                <FullSessionRow
                  key={`${session.tableId}-${session.startsAt}`}
                  session={session}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  };

  // строка под лентой дней: какой день выбран и сколько столов свободно (концепт «Выберите день и стол»)
  const dayTitle = `${selectedDateKey === getDateKey(getToday()) ? "Сегодня, " : ""}${selectedDate.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}`;
  const freeTables = new Set(freeSlots.map((slot) => slot.tableId)).size;
  const dayInfo = !isSelectedDateAllowed
    ? `${dayTitle} · запись закрыта`
    : availability && service?.mode === "table" && availability.dateAllowed
      ? `${dayTitle} · ${freeTables > 0 ? `свободно ${freeTables} ${pluralizeRu(freeTables, { one: "стол", few: "стола", many: "столов" })}` : "свободных столов нет"}`
      : dayTitle;

  return (
    <div className="ds-enter h-full w-full space-y-6 px-5 py-3 text-fg">
      <div className="sticky top-[60px] z-40 -mx-5 bg-app-bg/95 px-5 pb-3 pt-2 backdrop-blur">
        <DateSelector
          selectedDate={selectedDate}
          scheduleWeekdays={allowedWeekdays}
          onDateSelected={setSelectedDate}
          info={dayInfo.charAt(0).toUpperCase() + dayInfo.slice(1)}
        />
      </div>

      {!isSelectedDateAllowed ? (
        <ScheduleUnavailableMessage
          disciplineTitle={selectedDiscipline?.title}
          scheduleWeekdays={allowedWeekdays}
        />
      ) : (
        renderContent()
      )}

      <div className="flex gap-3 rounded-[16px] border border-white/10 bg-app-elevated px-4 py-3 text-[13px] text-fg-2">
        <Info className="mt-0.5 size-4 shrink-0 text-accent" />
        <p>Запись на Warhammer, покраску и посещение клуба — пятница, суббота и воскресенье.</p>
      </div>
    </div>
  );
}
