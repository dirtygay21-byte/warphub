import { createBooking, detailsKindForSlug } from "@/apiUtils/booking";
import { getDisciplines, getServiceById } from "@/apiUtils/disciplines";
import { FieldLabel, NumberChips } from "@/components/booking/FormControls";
import { DayBar, TimeChips } from "@/components/booking/TimeChips";
import { DsButton, ToggleRow } from "@/components/ui/ds";
import { PaintingForm, PlayerInfoForm } from "@/components/booking/PlayerForms";
import {
  emptyPaintingForm,
  emptyPlayerForm,
  type PlayerFormValue,
  paintingFormToDetails,
  playerFormToDetails,
  validatePaintingForm,
  validatePlayerForm,
} from "@/components/booking/formValues";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { useAuthStore } from "@/stores/useAuthStore";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { formatClubTime, formatClubTimeRange } from "@/utils/clubTime";
import { formatSelectedDate } from "@/utils/date";
import { s3Url } from "@/utils/s3utils";
import { getSlotEnd, getStartTimeOptions, getWindowLimit, hoursLabel, minFreeSeats } from "@/utils/slots";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Dice6, Swords, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TrainerBadge } from "./TableSelection/SessionCards";
import ServiceDetailsHeader from "./ServiceDetails/ServiceDetailsHeader";
import ServiceDetailsImage from "./ServiceDetails/ServiceDetailsImage";

const CLUB_VISIT_SLUG = "club_visit";
const MINUTE = 60 * 1000;

export default function ServiceDetailsStage() {
  const {
    disciplineId,
    serviceId,
    selectedDate,
    selectedSlot,
    partyCount,
    setPartyCount,
    setLastBooking,
  } = useReservationStore();
  const { nextStage } = useRegistrationStageStore();
  const options = useBookingOptions();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const serviceQuery = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () => getServiceById(serviceId!),
    enabled: serviceId !== null,
  });
  const disciplinesQuery = useQuery({
    queryKey: ["disciplines"],
    queryFn: getDisciplines,
  });

  const service = serviceQuery.data;
  const discipline = disciplinesQuery.data?.find((d) => d.id === disciplineId);
  const detailsKind = detailsKindForSlug(service?.slug);
  const isClubVisit = service?.slug === CLUB_VISIT_SLUG;
  const durationMinutes = service?.duration ?? 60;

  const maxParty =
    selectedSlot?.kind === "pool"
      ? Math.max(
          1,
          Math.min(
            selectedSlot.freeSeats,
            isClubVisit ? (service?.visitorsCapacity ?? selectedSlot.freeSeats) : selectedSlot.freeSeats,
          ),
        )
      : 1;

  const timeOptions = useMemo(() => {
    if (!selectedSlot || selectedSlot.kind === "join") return [];
    return getStartTimeOptions({
      segments: selectedSlot.segments,
      within: selectedSlot.window,
      durationMinutes,
      partySize: selectedSlot.kind === "pool" ? partyCount : 1,
      minMinutes: selectedSlot.minMinutes,
    });
  }, [selectedSlot, durationMinutes, partyCount]);

  const [chosenStart, setChosenStart] = useState<string | null>(null);

  // Присоединение — время игры фиксировано; иначе — время с барабана (B2), по умолчанию первое доступное
  const startsAt =
    selectedSlot?.kind === "join"
      ? selectedSlot.startsAt
      : chosenStart && timeOptions.includes(chosenStart)
        ? chosenStart
        : (timeOptions[0] ?? null);
  // B1: конец — полная длительность или раньше, если дальше стол/места заняты; присоединение — время сессии
  const endOf = (start: string) =>
    selectedSlot?.kind === "join"
      ? selectedSlot.endsAt
      : selectedSlot
        ? getSlotEnd({ segments: selectedSlot.segments, startsAt: start, durationMinutes, partySize: selectedSlot.kind === "pool" ? partyCount : 1 })
        : new Date(new Date(start).getTime() + durationMinutes * MINUTE).toISOString();
  const endsAt = startsAt ? endOf(startsAt) : null;
  const minutesOf = (start: string, end: string) => Math.round((new Date(end).getTime() - new Date(start).getTime()) / MINUTE);
  // до выбора начала — предупреждение по лучшему варианту окна
  const windowLimit =
    selectedSlot && selectedSlot.kind !== "join"
      ? getWindowLimit({ segments: selectedSlot.segments, within: selectedSlot.window, durationMinutes, partySize: selectedSlot.kind === "pool" ? partyCount : 1, minMinutes: selectedSlot.minMinutes })
      : null;
  const limited =
    startsAt && endsAt
      ? minutesOf(startsAt, endsAt) < durationMinutes
        ? { minutes: minutesOf(startsAt, endsAt), until: endsAt }
        : null
      : windowLimit?.state === "limited"
        ? { minutes: windowLimit.maxMinutes, until: windowLimit.until }
        : null;

  const [playerDraft, setPlayer] = useState(() => emptyPlayerForm());
  // присоединение к столу: игра — как у первого игрока (сервер проверяет то же)
  const lockedGame =
    selectedSlot?.kind === "join" ? ((selectedSlot.players.find((p) => p.game)?.game as PlayerFormValue["game"] | undefined) ?? "40k") : null;
  const player = lockedGame && playerDraft.game !== lockedGame ? { ...playerDraft, game: lockedGame } : playerDraft;
  const [clubArmy, setClubArmy] = useState(false);
  const [painting, setPainting] = useState(emptyPaintingForm);
  const [showErrors, setShowErrors] = useState(false);

  const formError =
    detailsKind === "wh_player"
      ? validatePlayerForm(player, options.maxPoints)
      : detailsKind === "painting"
        ? validatePaintingForm(painting)
        : null;
  const timeError = startsAt ? null : "Выберите время начала";
  const validationError = timeError ?? formError;

  const mutation = useMutation({
    mutationFn: () => {
      if (!serviceId || !selectedSlot || !startsAt) {
        throw new Error("Не выбрано время");
      }
      return createBooking({
        serviceId,
        startsAt,
        tableId: selectedSlot.kind === "pool" ? undefined : selectedSlot.tableId,
        partySize: selectedSlot.kind === "pool" ? partyCount : 1,
        seatClubArmyOptions: detailsKind === "wh_player" ? [clubArmy] : undefined,
        details:
          detailsKind === "wh_player"
            ? playerFormToDetails(player)
            : detailsKind === "painting"
              ? paintingFormToDetails(painting)
              : undefined,
      });
    },
    onSuccess: (result) => {
      setLastBooking({
        startsAt: result.startsAt ?? startsAt,
        endsAt: result.endsAt ?? endsAt,
        joined: result.joinedSession ?? false,
        partySize: selectedSlot?.kind === "pool" ? partyCount : 1,
      });
      queryClient.invalidateQueries({ queryKey: ["service-availability"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      nextStage();
    },
  });

  const handleSubmit = () => {
    setShowErrors(true);
    if (validationError) return;
    mutation.mutate();
  };

  if (!selectedSlot) {
    return (
      <div className="px-5 py-6 text-sm text-fg-2">
        Сначала выберите время на предыдущем шаге.
      </div>
    );
  }

  const isJoin = selectedSlot.kind === "join";
  const partySize = selectedSlot.kind === "pool" ? partyCount : 1;

  return (
    <div className="ds-enter h-full w-full space-y-6 px-5 py-3 pb-10 text-fg">
      <article className="overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated">
        <ServiceDetailsImage
          imageUrl={service?.slug ? s3Url(`services/${service.slug}.webp`) : undefined}
          alt={service?.title ?? ""}
        />
        <div className="space-y-3 p-4">
          <ServiceDetailsHeader
            activity={service?.title ?? undefined}
            discipline={discipline?.title}
            description={service?.description ?? undefined}
          />
          <div className="space-y-2 border-t border-white/[0.06] pt-3 text-[15px]">
            <InfoLine icon={<CalendarDays className="size-4" />}>{formatSelectedDate(selectedDate)}</InfoLine>
            {startsAt && (
              <InfoLine icon={<Clock3 className="size-4" />}>
                {formatClubTimeRange(startsAt, endsAt)}
                {endsAt && <span className="text-fg-2"> · {hoursLabel(minutesOf(startsAt, endsAt))}</span>}
              </InfoLine>
            )}
            {selectedSlot.kind === "pool" && !isClubVisit && (
              <InfoLine icon={<UsersRound className="size-4" />}>
                Свободно мест: {minFreeSeats(selectedSlot.segments)} из {selectedSlot.capacity}
              </InfoLine>
            )}
            {service?.hasTrainer ? (
              <div className="pt-1">
                <TrainerBadge players={selectedSlot.kind === "pool" ? 1 : selectedSlot.capacity} />
              </div>
            ) : null}
          </div>
        </div>
      </article>

      {limited && <LimitedTimeBanner minutes={limited.minutes} until={limited.until} fullMinutes={durationMinutes} place={selectedSlot.kind === "pool" ? "место" : "стол"} />}

      {isJoin && (
        <div className="rounded-[16px] border border-accent/40 bg-accent/10 p-4">
          <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-accent">
            <Swords className="size-4" />
            Ваш соперник
          </p>
          {selectedSlot.players.map((p, index) => (
            <p key={index} className="mt-2 text-[15px] text-fg">
              <span className="font-semibold">{p.firstName}</span>
              {p.army ? <span className="text-fg-2"> · {p.gameLabel ?? "Warhammer 40,000"} · {p.army}{p.points != null ? ` · ${p.points} очков` : ""} · {p.experienceLabel}</span> : null}
            </p>
          ))}
        </div>
      )}

      {selectedSlot.kind === "pool" && maxParty > 1 && (
        <div>
          <FieldLabel>Сколько мест</FieldLabel>
          <NumberChips
            max={Math.min(maxParty, 10)}
            value={Math.min(partyCount, maxParty)}
            onChange={(count) => {
              setPartyCount(count);
              setChosenStart(null);
            }}
          />
        </div>
      )}

      {!isJoin && (
        <section>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <FieldLabel>{isClubVisit ? "Время прихода" : "Время начала"}</FieldLabel>
            {startsAt && endsAt && (
              <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums">{formatClubTimeRange(startsAt, endsAt)}</span>
            )}
          </div>
          {timeOptions.length === 0 ? (
            <p className="text-sm text-fg-2">В этом окне не помещается запись. Вернитесь и выберите другое время.</p>
          ) : (
            <>
              <TimeChips
                options={timeOptions}
                value={startsAt}
                onChange={setChosenStart}
                within={selectedSlot.window}
                segments={selectedSlot.segments}
                partySize={partySize}
                short={(option) => minutesOf(option, endOf(option)) < durationMinutes}
              />
              <DayBar segments={selectedSlot.segments} partySize={partySize} startsAt={startsAt} endsAt={endsAt} />
            </>
          )}
          {showErrors && timeError && <p className="mt-2 text-sm text-danger">{timeError}</p>}
        </section>
      )}

      {detailsKind === "wh_player" && (
        <>
          <PlayerInfoForm
            value={player}
            onChange={setPlayer}
            lockedGame={lockedGame}
            options={options}
            playerName={user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : undefined}
          />
          <ToggleRow title="Нужна армия клуба" checked={clubArmy} onChange={setClubArmy} />
        </>
      )}

      {detailsKind === "painting" && <PaintingForm value={painting} onChange={setPainting} options={options} />}

      {showErrors && formError && (
        <div role="alert" className="rounded-[14px] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {formError}
        </div>
      )}

      {mutation.isError && (
        <div role="alert" className="rounded-[14px] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {mutation.error.message}
        </div>
      )}

      {limited && <LimitedTimeBanner minutes={limited.minutes} until={limited.until} fullMinutes={durationMinutes} place={selectedSlot.kind === "pool" ? "место" : "стол"} compact />}

      <DsButton variant="primary" size="lg" onClick={handleSubmit} disabled={mutation.isPending || serviceQuery.isLoading} className="w-full">
        {isJoin ? <Swords className="size-5" /> : <Dice6 className="size-5" />}
        {mutation.isPending ? "Записываем…" : isJoin ? "Присоединиться к игре" : "Записаться"}
      </DsButton>
    </div>
  );
}

/**
 * Красное предупреждение (B1): время доступно, но короче полной длительности. Показывается вверху формы и у кнопки
 * записи, чтобы его было видно на всём шаге.
 */
function LimitedTimeBanner({ minutes, until, fullMinutes, place, compact = false }: { minutes: number; until: string; fullMinutes: number; place: string; compact?: boolean }) {
  return (
    <div role="status" className="rounded-[14px] border border-danger/50 bg-danger/10 px-4 py-3 text-sm text-fg">
      <p className="font-semibold text-danger">
        ⚠️ Время ограничено: только {hoursLabel(minutes)} вместо {hoursLabel(fullMinutes)} — до {formatClubTime(until)}
      </p>
      {!compact && (
        <p className="mt-1 text-fg-2">
          Записаться можно. Если не успеете, попросим освободить {place} к следующей записи; если {place === "стол" ? "стол будет свободен" : "место будет свободно"} — постараемся продлить время.
        </p>
      )}
    </div>
  );
}

function InfoLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-fg">
      <span className="text-accent">{icon}</span>
      {children}
    </p>
  );
}
