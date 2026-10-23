import { useNow } from "@/hooks/useNow";
import { DetailRow } from "./DetailRow";
import { hoursLabel } from "@/utils/slots";
import { formatReservationDate } from "@/utils/date";
import { getSeatsLabel } from "@/utils/plural";
import { isInactiveReservation } from "@/utils/reservation";
import {
  formatTimeRange,
  getStatusLabel,
  getStatusStyle,
  isCancelledReservation,
} from "@/utils/reservationDisplay";
import clsx from "clsx";
import {
  CalendarDays,
  Clock3,
  LoaderCircle,
  PencilLine,
  UsersRound,
  XCircle,
} from "lucide-react";
import { BookingDetailsRows } from "./BookingDetailsRows";
import { detailsKindForSlug } from "@/apiUtils/booking";
import type { Reservation } from "@/types";
import { getSkeletonColors } from "@/theme/colors";
import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

type ReservationCardProps = {
  reservation: Reservation;
  isPast: boolean;
  serviceTitle?: string;
  /** полная длительность услуги, минут — если запись короче, красная пометка «время ограничено» (B1) */
  serviceDuration?: number | null;
  isServiceLoading: boolean;
  disciplineTitle?: string;
  isCancelling: boolean;
  onCancel: () => void;
  onEdit?: () => void;
};

export function ReservationCard({
  reservation,
  isPast,
  serviceTitle,
  serviceDuration,
  isServiceLoading,
  disciplineTitle,
  isCancelling,
  onCancel,
  onEdit,
}: ReservationCardProps) {
  // B1: запись короче полной длительности услуги
  const bookedMinutes =
    reservation.startsAt && reservation.endsAt
      ? Math.round((new Date(reservation.endsAt).getTime() - new Date(reservation.startsAt).getTime()) / 60_000)
      : null;
  const limitedMinutes = serviceDuration && bookedMinutes != null && bookedMinutes < serviceDuration ? bookedMinutes : null;

  const cancelled = isCancelledReservation(reservation);
  const clubArmyCount = reservation.seatClubArmyOptions.filter(Boolean).length;
  const isInactive = isInactiveReservation(reservation);
  const now = useNow();
  const canEdit =
    !isInactive &&
    onEdit != null &&
    detailsKindForSlug(reservation.serviceSlug) != null &&
    new Date(reservation.startsAt).getTime() > now;

  return (
    <SkeletonTheme baseColor={getSkeletonColors().baseColor} highlightColor={getSkeletonColors().highlightColor}>
      <article
        className={clsx(
          "overflow-hidden rounded-2xl border bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.25)]",
          isPast && "pointer-events-none border-white/10 opacity-45",
          !isPast && cancelled && "border-white/10 opacity-75",
          !isPast && !cancelled && "border-accent/30",
        )}
      >
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">
                {isServiceLoading ? (
                  <Skeleton width={160} height={20} />
                ) : (
                  serviceTitle
                )}
              </h2>
              {isServiceLoading ? (
                <Skeleton width={80} height={20} />
              ) : (
                <p className="mt-1 text-sm text-white/50">{disciplineTitle}</p>
              )}
            </div>

            {isServiceLoading ? (
              <Skeleton width={80} height={20} />
            ) : (
              <span
                className={clsx(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                  getStatusStyle(reservation.status),
                )}
              >
                {getStatusLabel(reservation.status)}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 px-4 py-4 text-sm">
          <DetailRow
            icon={<CalendarDays className="size-4" />}
            label="Дата"
            value={formatReservationDate(reservation.startsAt)}
            isLoading={isServiceLoading}
          />
          <DetailRow
            icon={<Clock3 className="size-4" />}
            label="Время"
            value={formatTimeRange(reservation.startsAt, reservation.endsAt)}
            isLoading={isServiceLoading}
          />
          <DetailRow
            icon={<UsersRound className="size-4" />}
            label="Мест"
            value={String(reservation.partySize)}
            isLoading={isServiceLoading}
          />
          {limitedMinutes != null && serviceDuration && (
            <p className="rounded-lg border border-red-400/50 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200">
              ⚠️ Время ограничено: {hoursLabel(limitedMinutes)} вместо {hoursLabel(serviceDuration)}. Если не успеете — попросим освободить место к следующей записи; если будет свободно — постараемся продлить.
            </p>
          )}
          <BookingDetailsRows details={reservation.details} />
          {clubArmyCount > 0 && (
            <DetailRow
              icon={<UsersRound className="size-4" />}
              label="Армия клуба"
              value={`${clubArmyCount} ${getSeatsLabel(clubArmyCount)}`}
              isLoading={isServiceLoading}
            />
          )}
        </div>

        {!isInactive && (
          <div className="space-y-2 border-t border-white/10 px-4 py-4">
            {canEdit && !isServiceLoading && (
              <button
                type="button"
                onClick={onEdit}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/3 px-4 py-3 text-sm font-semibold text-white transition-colors active:bg-white/10"
              >
                <PencilLine className="size-4" />
                {detailsKindForSlug(reservation.serviceSlug) === "painting"
                  ? "Изменить данные покраски"
                  : "Изменить армию, очки, опыт"}
              </button>
            )}
            {isServiceLoading ? (
              <Skeleton height={40} />
            ) : (
              <button
                type="button"
                onClick={onCancel}
                disabled={isCancelling}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200 transition-colors active:bg-red-400/20 disabled:opacity-60"
              >
                {isCancelling ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <XCircle className="size-4" />
                )}
                {isCancelling ? "Отменяем..." : "Отменить запись"}
              </button>
            )}
          </div>
        )}
      </article>
    </SkeletonTheme>
  );
}
