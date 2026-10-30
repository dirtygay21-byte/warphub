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
import ReservationCardSkeleton from "@/components/skeletons/ReservationCardSkeleton";
import { formatReservationDate } from "@/utils/date";
import { getRecordsLabel } from "@/utils/plural";
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
import clsx from "clsx";
import {
  CalendarDays,
  Eye,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import TelegramOnly from "@/components/ui/TelegramOnly/TelegramOnly";
import { isOutsideTelegram } from "@/utils/telegramEnv";
import { useMemo, useState } from "react";

const RESERVATION_SKELETON_COUNT = 5;

export default function Reservation() {
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
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
    },
  });

  const cancelTrialMutation = useMutation({
    mutationFn: cancelTrialRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-dnd"] });
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
    },
  });

  const cancelEventMutation = useMutation({
    mutationFn: unregisterFromEvent,
    onSuccess: (_data, eventId) => {
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["nearest-event"] });
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      setShowEventCancelDialog(false);
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
      showInactive
        ? reservations
        : reservations.filter(
            (reservation) => !isInactiveReservation(reservation)
          ),
    [reservations, showInactive]
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
  const visibleDndBookings = showInactive
    ? dndBookings
    : dndBookings.filter((booking) => !isDndBookingInactive(booking));
  const visibleTrials = showInactive
    ? trialRequests
    : trialRequests.filter((request) => request.status !== "cancelled");

  const visibleCount =
    visibleReservations.length +
    (registeredEvent ? 1 : 0) +
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
        <p className="text-sm text-white/70">
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
      <div className="px-6 pb-3 pt-6 text-white lg:pt-8">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold">Мои записи</h1>
          <p className="mt-1 text-sm text-white/50">Загружаем записи...</p>
        </div>

        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          {Array.from({ length: RESERVATION_SKELETON_COUNT }, (_, index) => (
            <ReservationCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 pb-3 pt-6 text-white lg:pt-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Мои записи</h1>
          <p className="mt-1 text-sm text-white/50">
            {visibleCount > 0
              ? `${visibleCount} ${getRecordsLabel(visibleCount)}`
              : inactiveCount > 0 && !showInactive
              ? "Нет активных записей"
              : "Пока нет записей"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {inactiveCount > 0 && (
            <button
              type="button"
              onClick={() => setShowInactive((current) => !current)}
              aria-label={
                showInactive ? "Скрыть неактивные" : "Показать неактивные"
              }
              className={clsx(
                "flex size-10 items-center justify-center rounded-xl border transition-colors",
                showInactive
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-white/10 bg-white/3 text-white/80 active:bg-white/10"
              )}
            >
              {showInactive ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              reservationsQuery.refetch();
              dndQuery.refetch();
            }}
            disabled={reservationsQuery.isFetching}
            aria-label="Обновить список записей"
            className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-white transition-colors active:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw
              className={`size-4 ${
                reservationsQuery.isFetching ? "animate-spin" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {visibleCount === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-app-elevated px-6 py-10 text-center">
          <CalendarDays className="mx-auto size-10 text-accent" />
          <p className="mt-4 text-base font-medium">
            {inactiveCount > 0 && !showInactive
              ? "Активных записей нет"
              : "Записей пока нет"}
          </p>
          <p className="mt-2 text-sm text-white/50">
            {inactiveCount > 0 && !showInactive
              ? "Нажмите «Показать неактивные», чтобы увидеть прошлые и отменённые записи."
              : "Запишитесь на главной странице."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
          {registeredEvent && (
            <EventReservationCard
              event={registeredEvent}
              isPast={isPastEvent(registeredEvent)}
              isCancelling={cancelEventMutation.isPending}
              onCancel={() => setShowEventCancelDialog(true)}
            />
          )}
          {visibleTrials.map((request) => (
            <TrialRequestCard
              key={request.id}
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
          ))}
          {visibleDndBookings.map((booking) => (
            <DndBookingCard
              key={booking.id}
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
          ))}
          {visibleReservations.map((reservation) => (
            <ReservationCard
              key={reservation.id}
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
          ))}
        </div>
      )}

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

      {reservationBeingEdited && (
        <EditDetailsDialog
          reservation={reservationBeingEdited}
          onClose={() => setReservationToEdit(null)}
        />
      )}

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
    </div>
  );
}
