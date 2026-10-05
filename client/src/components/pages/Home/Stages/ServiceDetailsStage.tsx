import { createBooking, detailsKindForSlug } from "@/apiUtils/booking";
import { getDisciplines, getServiceById } from "@/apiUtils/disciplines";
import { FieldLabel, NumberChips } from "@/components/booking/FormControls";
import { PaintingForm, PlayerInfoForm } from "@/components/booking/PlayerForms";
import {
  emptyPaintingForm,
  emptyPlayerForm,
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
import { getStartTimeOptions, minFreeSeats } from "@/utils/slots";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
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
    });
  }, [selectedSlot, durationMinutes, partyCount]);

  const [chosenStart, setChosenStart] = useState<string | null>(null);

  // Присоединение — время игры фиксировано; посещение клуба — первое доступное
  const startsAt =
    selectedSlot?.kind === "join"
      ? selectedSlot.startsAt
      : isClubVisit
        ? (timeOptions[0] ?? null)
        : chosenStart && timeOptions.includes(chosenStart)
          ? chosenStart
          : null;
  const endsAt = startsAt
    ? new Date(new Date(startsAt).getTime() + durationMinutes * MINUTE).toISOString()
    : null;

  const [player, setPlayer] = useState(emptyPlayerForm);
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
      <div className="px-6 py-6 text-sm text-white/60">
        Сначала выберите время на предыдущем шаге.
      </div>
    );
  }

  const isJoin = selectedSlot.kind === "join";

  return (
    <div className="w-full h-full px-6 py-3 pb-10 text-white">
      <article className="overflow-hidden rounded-2xl border border-white/10 bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <ServiceDetailsImage
          imageUrl={service?.slug ? s3Url(`services/${service.slug}.webp`) : undefined}
          alt={service?.title ?? ""}
        />

        <div className="space-y-6 p-4">
          <ServiceDetailsHeader
            activity={service?.title ?? undefined}
            discipline={discipline?.title}
            description={service?.description ?? undefined}
          />

          <div className="space-y-2.5 rounded-xl border border-white/10 bg-white/3 p-3 text-sm">
            <InfoLine icon={<CalendarDays className="size-4" />}>
              {formatSelectedDate(selectedDate)}
            </InfoLine>
            {startsAt && (
              <InfoLine icon={<Clock3 className="size-4" />}>
                {formatClubTimeRange(startsAt, endsAt)}
              </InfoLine>
            )}
            {selectedSlot.kind === "pool" && !isClubVisit && (
              <InfoLine icon={<UsersRound className="size-4" />}>
                Свободно мест: {minFreeSeats(selectedSlot.segments)} из{" "}
                {selectedSlot.capacity}
              </InfoLine>
            )}
            {service?.hasTrainer ? (
              <div className="pt-1">
                <TrainerBadge
                  players={selectedSlot.kind === "pool" ? 1 : selectedSlot.capacity}
                />
              </div>
            ) : null}
          </div>

          {isJoin && (
            <div className="rounded-xl border border-accent/40 bg-accent/10 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                <Swords className="size-4" />
                Ваш соперник
              </p>
              {selectedSlot.players.map((p, index) => (
                <p key={index} className="mt-1.5 text-sm text-white/85">
                  {p.firstName}
                  {p.army ? ` · ${p.army} · ${p.points} очков · ${p.experienceLabel}` : ""}
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

          {!isJoin && !isClubVisit && (
            <div>
              <FieldLabel>Время начала</FieldLabel>
              {timeOptions.length === 0 ? (
                <p className="text-sm text-white/55">
                  В этом окне не помещается запись. Вернитесь и выберите другое время.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {timeOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={startsAt === option}
                      onClick={() => setChosenStart(option)}
                      className={clsx(
                        "rounded-lg border px-3 py-2 text-sm font-semibold transition-colors",
                        startsAt === option
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-white/10 bg-white/5 text-white active:bg-white/10",
                      )}
                    >
                      {formatClubTime(option)}
                    </button>
                  ))}
                </div>
              )}
              {showErrors && timeError && (
                <p className="mt-2 text-sm text-red-300">{timeError}</p>
              )}
            </div>
          )}

          {detailsKind === "wh_player" && (
            <>
              <PlayerInfoForm
                value={player}
                onChange={setPlayer}
                options={options}
                playerName={
                  user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : undefined
                }
              />
              <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/3 px-3 py-3 text-sm text-white/85">
                <span>Нужна армия клуба</span>
                <input
                  type="checkbox"
                  checked={clubArmy}
                  onChange={(event) => setClubArmy(event.target.checked)}
                  className="size-4 accent-accent"
                />
              </label>
            </>
          )}

          {detailsKind === "painting" && (
            <PaintingForm value={painting} onChange={setPainting} options={options} />
          )}

          {showErrors && formError && (
            <div className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {formError}
            </div>
          )}

          {mutation.isError && (
            <div className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              {mutation.error.message}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={mutation.isPending || serviceQuery.isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-4 text-base font-semibold text-accent-foreground transition-transform active:scale-95 disabled:opacity-50"
          >
            {isJoin ? <Swords className="size-5" /> : <Dice6 className="size-5" />}
            {mutation.isPending
              ? "Записываем..."
              : isJoin
                ? "Присоединиться к игре"
                : "Записаться"}
          </button>
        </div>
      </article>
    </div>
  );
}

function InfoLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-white/85">
      <span className="text-accent">{icon}</span>
      {children}
    </p>
  );
}
