import { getDisciplines, getServiceById } from "@/apiUtils/disciplines";
import { unregisterFromEvent } from "@/apiUtils/events";
import { cancelReservation, getMyReservations } from "@/apiUtils/reservations";
import { CancelConfirmDialog } from "./components/CancelConfirmDialog";
import { EventCancelConfirmDialog } from "./components/EventCancelConfirmDialog";
import { EventReservationCard } from "./components/EventReservationCard";
import { ReservationCard } from "./components/ReservationCard";
import { EditDetailsDialog } from "./components/EditDetailsDialog";
import { DndBookingCard, TrialRequestCard } from "./components/DndCards";
import {
  cancelDndBooking,
  cancelTrialRequest,
  getMyDnd,
  isDndBookingInactive,
} from "@/apiUtils/dnd";
import { isPastEvent } from "./utils";
import { Segmented } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";
import ReservationCardSkeleton from "@/components/skeletons/ReservationCardSkeleton";
import { formatReservationDate } from "@/utils/date";
import {
  isInactiveReservation,
  isPastReservation,
  sortReservationsForDisplay,
} from "@/utils/reservation";
import { formatTimeRange } from "@/utils/reservationDisplay";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarDays,
  RefreshCw,
} from "lucide-react";
import TelegramOnly from "@/components/ui/TelegramOnly/TelegramOnly";
import { isOutsideTelegram } from "@/utils/telegramEnv";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { toast } from "@/stores/useToastStore";

const RESERVATION_SKELETON_COUNT = 5;

export default function Reservation() {
  const queryClient = useQueryClient();
  // «Активные / Прошедшие» вместо значка-глаза (UI-аудит A7, D2)
  const [tab, setTab] = useState<"active" | "past">("active");
  const showPast = tab === "past";
  const [reservationToCancel, setReservationToCancel] = useState<string | null>(
    null
  );
  const [showEventCancelDialog, setShowEventCancelDialog] = useState(false);
  const [reservationToEdit, setReservationToEdit] = useState<string | null>(
    null
  );

  const dndQuery = useQuery({
    queryKey: ["my-dnd"],
    queryFn: getMyDnd,
  });

  const cancelDndBookingMutation = useMutation({
    mutationFn: cancelDndBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-dnd"] });
      queryClient.invalidateQueries({ queryKey: ["dnd-games"] });
      toast.success("Запись на D&D отменена");
    },
  });

  const cancelTrialMutation = useMutation({
    mutationFn: cancelTrialRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-dnd"] });
      toast.success("Заявка отменена");
    },
  });

  const reservationsQuery = useQuery({
    queryKey: ["reservations"],
    queryFn: getMyReservations,
  });

  const serviceIds = useMemo(
    () => [
      ...new Set(
        (reservationsQuery.data?.reservations ?? []).map((r) => r.serviceId)
      ),
    ],
    [reservationsQuery.data]
  );

  const serviceQueries = useQueries({
    queries: serviceIds.map((id) => ({
      queryKey: ["service", id],
      queryFn: () => getServiceById(id),
    })),
  });

  const disciplinesQuery = useQuery({
    queryKey: ["disciplines"],
    queryFn: getDisciplines,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelReservation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      setReservationToCancel(null);
      toast.success("Запись отменена");
    },
  });

  const cancelEventMutation = useMutation({
    mutationFn: unregisterFromEvent,
    onSuccess: (_data, eventId) => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["nearest-event"] });
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      setShowEventCancelDialog(false);
      toast.success("Вы отказались от участия");
    },
  });

  const servicesById = useMemo(
    () =>
      new Map(
        serviceQueries
          .map((query) => query.data)
          .filter((service) => service != null)
          .map((service) => [service.id, service])
      ),
    [serviceQueries]
  );

  const loadingServiceIds = useMemo(
    () =>
      new Set(
        serviceQueries
          .map((query, index) => (query.isLoading ? serviceIds[index] : null))
          .filter((id): id is number => id != null)
      ),
    [serviceIds, serviceQueries]
  );

  const disciplinesById = useMemo(
    () =>
      new Map(
        (disciplinesQuery.data ?? []).map((discipline) => [
          discipline.id,
          discipline.title,
        ])
      ),
    [disciplinesQuery.data]
  );

  const registeredEvent = reservationsQuery.data?.event ?? null;

  const reservations = useMemo(
    () =>
      sortReservationsForDisplay(reservationsQuery.data?.reservations ?? []),
    [reservationsQuery.data]
  );

  const visibleReservations = useMemo(
    () =>
      reservations.filter(
        (reservation) => isInactiveReservation(reservation) === showPast
      ),
    [reservations, showPast]
  );

  const dndBookings = useMemo(
    () =>
      [...(dndQuery.data?.bookings ?? [])].sort(
        (a, b) =>
          Number(isDndBookingInactive(a)) - Number(isDndBookingInactive(b)) ||
          // игры без точного времени — первыми среди активных
          (a.game.startsAt ? new Date(a.game.startsAt).getTime() : 0) -
            (b.game.startsAt ? new Date(b.game.startsAt).getTime() : 0)
      ),
    [dndQuery.data]
  );
  const trialRequests = useMemo(
    () => dndQuery.data?.trialRequests ?? [],
    [dndQuery.data]
  );
  const visibleDndBookings = dndBookings.filter((booking) => isDndBookingInactive(booking) === showPast);
  const visibleTrials = trialRequests.filter((request) => (request.status === "cancelled") === showPast);
  const visibleEvent = registeredEvent && isPastEvent(registeredEvent) === showPast ? registeredEvent : null;

  const visibleCount =
    visibleReservations.length +
    (visibleEvent ? 1 : 0) +
    visibleDndBookings.length +
    visibleTrials.length;
  const inactiveCount = useMemo(
    () =>
      reservations.filter((reservation) => isInactiveReservation(reservation))
        .length +
      dndBookings.filter(isDndBookingInactive).length +
      trialRequests.filter((request) => request.status === "cancelled").length,
    [reservations, dndBookings, trialRequests]
  );
  const activeCount =
    reservations.length + dndBookings.length + trialRequests.length + (registeredEvent ? 1 : 0) - inactiveCount;
  const reservationBeingEdited = reservationToEdit
    ? reservations.find((reservation) => reservation.id === reservationToEdit)
    : undefined;

  const reservationPendingCancel = reservationToCancel
    ? reservations.find((reservation) => reservation.id === reservationToCancel)
    : undefined;
  const pendingCancelServiceTitle = reservationPendingCancel
    ? servicesById.get(reservationPendingCancel.serviceId)?.title
    : undefined;

  const isPageLoading =
    reservationsQuery.isLoading ||
    disciplinesQuery.isLoading ||
    serviceQueries.some((query) => query.isLoading);

  if (isOutsideTelegram()) return <TelegramOnly what="Ваши записи" />;

  if (reservationsQuery.isError) {
    return (
      <div className="flex min-h-[calc(100dvh-140px)] flex-col items-center justify-center gap-4 px-6 text-center text-white">
        <p className="text-sm text-fg-2">
          Не удалось загрузить записи. Попробуйте ещё раз.
        </p>
        <button
          type="button"
          onClick={() => reservationsQuery.refetch()}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
        >
          <RefreshCw className="size-4" />
          Повторить
        </button>
      </div>
    );
  }

  if (isPageLoading) {
    return (
      <div className="px-5 pb-3 pt-6 text-fg lg:pt-8">
        <div className="mb-4">
          <h1 className="font-display text-[28px] font-semibold uppercase leading-none">Мои записи</h1>
          <p className="mt-2 text-sm text-fg-2">Загружаем записи…</p>
        </div>

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          {Array.from({ length: RESERVATION_SKELETON_COUNT }, (_, index) => (
            <ReservationCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  // одна лента по времени (15.11.2026): ивенты, D&D и записи вперемешку по дате; прошедшие — сначала последние.
  // Заявки «Хочу попробовать» без даты — сверху, D&D без даты — после датированных.
  const timeline: { key: string; at: number; el: ReactNode }[] = [];
  if (visibleEvent) {
    timeline.push({ key: "event", at: Date.parse(visibleEvent.startsAt), el: (
      <EventReservationCard
        event={visibleEvent}
        isPast={isPastEvent(visibleEvent)}
        isCancelling={cancelEventMutation.isPending}
        onCancel={() => setShowEventCancelDialog(true)}
      />
    ) });
  }
  for (const request of visibleTrials) {
    timeline.push({ key: `trial:${request.id}`, at: showPast ? Infinity : -Infinity, el: (
      <TrialRequestCard
      request={request}
      isCancelling={
        cancelTrialMutation.isPending &&
        cancelTrialMutation.variables === request.id
      }
      errorMessage={
        cancelTrialMutation.isError &&
        cancelTrialMutation.variables === request.id
          ? cancelTrialMutation.error.message
          : null
      }
      onCancel={() => cancelTrialMutation.mutate(request.id)}
    />
    ) });
  }
  for (const booking of visibleDndBookings) {
    timeline.push({ key: `dnd:${booking.id}`, at: booking.game.startsAt ? Date.parse(booking.game.startsAt) : showPast ? -Infinity : Infinity, el: (
      <DndBookingCard
      booking={booking}
      isCancelling={
        cancelDndBookingMutation.isPending &&
        cancelDndBookingMutation.variables === booking.id
      }
      errorMessage={
        cancelDndBookingMutation.isError &&
        cancelDndBookingMutation.variables === booking.id
          ? cancelDndBookingMutation.error.message
          : null
      }
      onCancel={() => cancelDndBookingMutation.mutate(booking.id)}
    />
    ) });
  }
  for (const reservation of visibleReservations) {
    timeline.push({ key: `res:${reservation.id}`, at: Date.parse(reservation.startsAt), el: (
      <ReservationCard
      reservation={reservation}
      isPast={isPastReservation(reservation)}
      onEdit={() => setReservationToEdit(reservation.id)}
      serviceDuration={servicesById.get(reservation.serviceId)?.duration ?? null}
      serviceTitle={
        servicesById.get(reservation.serviceId)?.title ??
        reservation.serviceTitle ??
        undefined
      }
      isServiceLoading={loadingServiceIds.has(reservation.serviceId)}
      disciplineTitle={
        servicesById.get(reservation.serviceId)
          ? disciplinesById.get(
              servicesById.get(reservation.serviceId)!.disciplineId
            )
          : undefined
      }
      isCancelling={
        cancelMutation.isPending &&
        cancelMutation.variables === reservation.id
      }
      onCancel={() => setReservationToCancel(reservation.id)}
    />
    ) });
  }
  timeline.sort((a, b) => (showPast ? b.at - a.at : a.at - b.at));

  return (
    <div className="ds-enter px-5 pb-3 pt-6 text-fg lg:pt-8">
      <div className="mb-4 flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[28px] font-semibold uppercase leading-none">Мои записи</h1>
          <button
            type="button"
            onClick={() => {
              haptic.tap();
              reservationsQuery.refetch();
              dndQuery.refetch();
            }}
            disabled={reservationsQuery.isFetching}
            aria-label="Обновить список записей"
            title="Обновить"
            className="ds-press flex size-11 items-center justify-center rounded-xl border border-white/10 bg-app-elevated text-fg disabled:opacity-60"
          >
            <RefreshCw className={`size-[18px] ${reservationsQuery.isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "active", label: `Активные${activeCount > 0 ? ` · ${activeCount}` : ""}` },
            { value: "past", label: `Прошедшие${inactiveCount > 0 ? ` · ${inactiveCount}` : ""}` },
          ]}
        />
      </div>

      {visibleCount === 0 ? (
        <div className="ds-enter rounded-[18px] border border-white/10 bg-app-elevated px-6 py-10 text-center">
          <CalendarDays className="mx-auto size-10 text-accent" />
          <p className="mt-4 text-base font-semibold">{showPast ? "Прошедших записей нет" : "Активных записей нет"}</p>
          <p className="mt-2 text-sm text-fg-2">
            {showPast ? "Здесь появятся прошлые и отменённые записи." : "Запишитесь на главной — новые записи появятся здесь."}
          </p>
        </div>
      ) : (
        <div className="ds-stagger flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          {timeline.map((item) => (
            <Fragment key={item.key}>{item.el}</Fragment>
          ))}
        </div>
      )}

      <AnimatePresence>
        {registeredEvent && showEventCancelDialog && (
          <EventCancelConfirmDialog
            eventTitle={registeredEvent.title}
            dateLabel={formatReservationDate(registeredEvent.startsAt)}
            timeLabel={formatTimeRange(
              registeredEvent.startsAt,
              registeredEvent.endsAt
            )}
            isPending={cancelEventMutation.isPending}
            errorMessage={
              cancelEventMutation.isError
                ? cancelEventMutation.error.message
                : null
            }
            onClose={() => {
              if (!cancelEventMutation.isPending) {
                setShowEventCancelDialog(false);
                cancelEventMutation.reset();
              }
            }}
            onConfirm={() => cancelEventMutation.mutate(registeredEvent.id)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reservationBeingEdited && (
          <EditDetailsDialog
            reservation={reservationBeingEdited}
            onClose={() => setReservationToEdit(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reservationPendingCancel && (
          <CancelConfirmDialog
            serviceTitle={pendingCancelServiceTitle}
            dateLabel={formatReservationDate(reservationPendingCancel.startsAt)}
            timeLabel={formatTimeRange(
              reservationPendingCancel.startsAt,
              reservationPendingCancel.endsAt
            )}
            isPending={cancelMutation.isPending}
            errorMessage={
              cancelMutation.isError ? cancelMutation.error.message : null
            }
            onClose={() => {
              if (!cancelMutation.isPending) {
                setReservationToCancel(null);
                cancelMutation.reset();
              }
            }}
            onConfirm={() => cancelMutation.mutate(reservationPendingCancel.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
