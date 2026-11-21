import { clubArmyLabel, createBooking, detailsKindForSlug, gameHasPoints } from "@/apiUtils/booking";
import { getDisciplines, getServiceById } from "@/apiUtils/disciplines";
import { FieldLabel, NumberChips } from "@/components/booking/FormControls";
import { DayBar, TimeChips } from "@/components/booking/TimeChips";
import { DsButton, ToggleRow } from "@/components/ui/ds";
import { PaintingForm, PlayerInfoForm } from "@/components/booking/PlayerForms";
import {
  emptyPaintingForm,
  emptyPlayerForm,
  playerFormFromDetails,
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
import { Dice6, Swords } from "lucide-react";
import { useMemo, useState } from "react";
import { TrainerBadge } from "./TableSelection/SessionCards";
import { StubTime, Ticket, TicketKicker } from "@/components/booking/Ticket";
import BoostySubscriptionInfo from "@/components/booking/BoostySubscriptionInfo";
import { boostyKindForService } from "@/components/booking/boosty";
import { GAMES_BY_CATEGORY } from "@/components/booking/tableCategory";

const TRAINING_SLUGS = new Set(["wh_group_training", "wh_solo_training"]);
const CLUB_ARMY_TRAINING_POINTS = 1000;
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
    prefillDetails,
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
  const boostyKind = boostyKindForService(service);
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

  // «Записаться снова»: армия, очки и опыт из прошлой записи
  const [playerDraft, setPlayer] = useState(() => (prefillDetails ? playerFormFromDetails(prefillDetails) : emptyPlayerForm()));
  // присоединение к столу: игра — как у первого игрока (сервер проверяет то же)
  const lockedGame =
    selectedSlot?.kind === "join" ? ((selectedSlot.players.find((p) => p.game)?.game as PlayerFormValue["game"] | undefined) ?? "40k") : null;
  const player = lockedGame && playerDraft.game !== lockedGame ? { ...playerDraft, game: lockedGame } : playerDraft;
  // категория стола (Full-scale Wargaming: 40K, AoS; Tactical Games: Kill Team, Warcry) — только свои игры
  const slotCategory = selectedSlot && (selectedSlot.kind === "new" || selectedSlot.kind === "join") ? selectedSlot.category : undefined;
  const gamesForSlot = slotCategory ? options.games.filter((g) => GAMES_BY_CATEGORY[slotCategory].includes(g.value)) : undefined;
  const [clubArmy, setClubArmy] = useState(false);
  // армия клуба (решение владельца 14.11.2026): обучающая игра — всегда 1000 очков, обычная игра — игрок выбирает очки
  const isTraining = TRAINING_SLUGS.has(service?.slug ?? "");
  const [clubArmyPointsDraft, setClubArmyPoints] = useState("");
  // Kill Team и Warcry — без очков: команда/варбанда клуба стандартная (решение владельца 15.11.2026)
  const hasPoints = gameHasPoints(player.game);
  const pickArmyPoints = clubArmy && !isTraining && hasPoints;
  const clubArmyPoints = isTraining ? CLUB_ARMY_TRAINING_POINTS : Number(clubArmyPointsDraft || player.points || 0);
  const clubArmyError =
    pickArmyPoints && (!Number.isInteger(clubArmyPoints) || clubArmyPoints < 1 || clubArmyPoints > options.maxPoints)
      ? "Укажите, на сколько очков нужна армия клуба"
      : null;
  const [painting, setPainting] = useState(emptyPaintingForm);
  const [showErrors, setShowErrors] = useState(false);

  const formError =
    detailsKind === "wh_player"
      ? (validatePlayerForm(player, options.maxPoints, isTraining) ?? clubArmyError)
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
            ? { ...playerFormToDetails(player, isTraining), ...(clubArmy && hasPoints ? { clubArmyPoints } : {}) }
            : detailsKind === "painting"
              ? paintingFormToDetails(painting)
              : undefined,
      });
    },
    onSuccess: (result) => {
      setLastBooking({
        id: result.id,
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
  const placeLabel = selectedSlot.kind === "new" ? selectedSlot.label : isJoin ? "игра с соперником" : null;
  const partySize = selectedSlot.kind === "pool" ? partyCount : 1;

  return (
    <div className="ds-enter h-full w-full space-y-6 px-5 py-3 pb-10 text-fg">
      {/* сводка — билет (17.11.2026): фото услуги, «услуга · стол», дата и время; корешок — начало */}
      <div className="relative">
        <Ticket
          image={service?.slug ? s3Url(`services/${service.slug}.webp`) : null}
          imageHeight={96}
          stub={
            startsAt ? (
              <StubTime time={formatClubTime(startsAt)} note={endsAt ? hoursLabel(minutesOf(startsAt, endsAt)) : undefined} />
            ) : (
              <StubTime time="—" note="время ниже" />
            )
          }
        >
          <TicketKicker>{[service?.title ?? discipline?.title, placeLabel].filter(Boolean).join(" · ")}</TicketKicker>
          <span className="mt-1 block text-base font-extrabold first-letter:uppercase">{formatSelectedDate(selectedDate)}</span>
          {startsAt && <span className="mt-0.5 block text-sm tabular-nums text-fg-2">{formatClubTimeRange(startsAt, endsAt)}</span>}
          {selectedSlot.kind === "pool" && !isClubVisit && (
            <span className="mt-0.5 block text-sm text-fg-2">
              Свободно мест: {minFreeSeats(selectedSlot.segments)} из {selectedSlot.capacity}
            </span>
          )}
          {service?.hasTrainer ? (
            <span className="mt-2 block">
              <TrainerBadge players={selectedSlot.kind === "pool" ? 1 : selectedSlot.capacity} />
            </span>
          ) : null}
        </Ticket>
        {boostyKind && (
          <div className="absolute top-2" style={{ right: 112 }}>
            <BoostySubscriptionInfo kind={boostyKind} context="booking" className="bg-black/55 text-fg backdrop-blur-sm" />
          </div>
        )}
      </div>

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
            games={gamesForSlot}
            training={isTraining}
            playerName={user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : undefined}
          />
          <ToggleRow
            title={`Нужна ${clubArmyLabel(player.game).toLowerCase()}`}
            subtitle={
              clubArmy
                ? player.game === "kt"
                  ? "Стандартная команда клуба для Kill Team"
                  : player.game === "warcry"
                    ? "Стандартная варбанда клуба для Warcry"
                    : isTraining
                      ? `Обучающая игра: армия клуба на ${CLUB_ARMY_TRAINING_POINTS} очков`
                      : "Выберите, на сколько очков нужна армия"
                : undefined
            }
            checked={clubArmy}
            onChange={setClubArmy}
          />
          {pickArmyPoints && (
            <section className="rounded-[14px] border border-white/10 bg-app-elevated p-4">
              <FieldLabel>Очки армии клуба</FieldLabel>
              <div className="flex flex-wrap gap-2">
                {options.pointsPresets.map((preset) => {
                  const on = clubArmyPoints === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setClubArmyPoints(String(preset))}
                      className={
                        on
                          ? "rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground"
                          : "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white active:bg-white/10"
                      }
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                inputMode="numeric"
                aria-label="Очки армии клуба"
                placeholder="Или введите своё значение"
                value={clubArmyPointsDraft || player.points}
                onChange={(event) => setClubArmyPoints(event.target.value.replace(/\D/g, "").slice(0, 5))}
                className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-field px-3 py-2.5 text-base text-white outline-none focus:border-accent/60"
              />
              <p className="mt-2 text-xs text-fg-3">По умолчанию — как очки вашей игры. Аренда считается по этим очкам.</p>
            </section>
          )}
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
 * Предупреждение (B1; по цветам 17.11.2026 — янтарная метка на нейтральной карточке, не красная рамка): время доступно, но короче полной длительности. Показывается вверху формы и у кнопки
 * записи, чтобы его было видно на всём шаге.
 */
function LimitedTimeBanner({ minutes, until, fullMinutes, place, compact = false }: { minutes: number; until: string; fullMinutes: number; place: string; compact?: boolean }) {
  return (
    <div role="status" className="rounded-[14px] border border-white/10 bg-app-elevated px-4 py-3 text-sm text-fg">
      <p className="font-semibold text-warn">
        Время ограничено: только {hoursLabel(minutes)} вместо {hoursLabel(fullMinutes)} — до {formatClubTime(until)}
      </p>
      {!compact && (
        <p className="mt-1 text-fg-2">
          Записаться можно. Если не успеете, попросим освободить {place} к следующей записи; если {place === "стол" ? "стол будет свободен" : "место будет свободно"} — постараемся продлить время.
        </p>
      )}
    </div>
  );
}
