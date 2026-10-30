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
  LoaderCircle,
  PencilLine,
  UsersRound,
  XCircle,
} from "lucide-react";
import { BookingDetailsRows } from "./BookingDetailsRows";
import { DsButton } from "@/components/ui/ds";
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
          "ds-enter overflow-hidden rounded-[18px] border bg-app-elevated",
          isPast && "pointer-events-none border-white/[0.08] opacity-60",
          !isPast && cancelled && "border-white/[0.08] opacity-75",
          !isPast && !cancelled && "border-white/10",
        )}
      >
        <div className="space-y-1 px-4 pt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">
              {isServiceLoading ? <Skeleton width={140} height={14} /> : [disciplineTitle, serviceTitle].filter(Boolean).join(" · ")}
            </span>
            {isServiceLoading ? (
              <Skeleton width={80} height={24} />
            ) : (
              <span className={clsx("inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-lg px-2 text-[12px] font-semibold", getStatusStyle(reservation.status))}>
                {getStatusLabel(reservation.status)}
              </span>
            )}
          </div>
          <p className="text-lg font-bold leading-snug">
            {formatReservationDate(reservation.startsAt)} · <span className="whitespace-nowrap">{formatTimeRange(reservation.startsAt, reservation.endsAt)}</span>
          </p>
        </div>

        <div className="space-y-2.5 px-4 py-3 text-sm">
          <DetailRow
            icon={<UsersRound className="size-4" />}
            label="Мест"
            value={String(reservation.partySize)}
            isLoading={isServiceLoading}
          />
          {limitedMinutes != null && serviceDuration && (
            <p className="rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-[13px] font-semibold text-danger">
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
          <div className={clsx("grid gap-2 px-4 pb-4", canEdit && !isServiceLoading ? "grid-cols-2" : "grid-cols-1")}>
            {canEdit && !isServiceLoading && (
              <DsButton variant="secondary" onClick={onEdit} aria-label={detailsKindForSlug(reservation.serviceSlug) === "painting" ? "Изменить данные покраски" : "Изменить армию, очки, опыт"} title={detailsKindForSlug(reservation.serviceSlug) === "painting" ? "Изменить данные покраски" : "Изменить армию, очки, опыт"}>
                <PencilLine className="size-4" />
                Изменить
              </DsButton>
            )}
            {isServiceLoading ? (
              <Skeleton height={44} />
            ) : (
              <DsButton variant="danger" onClick={onCancel} disabled={isCancelling}>
                {isCancelling ? <LoaderCircle className="size-4 animate-spin" /> : <XCircle className="size-4" />}
                {isCancelling ? "Отменяем…" : "Отменить"}
              </DsButton>
            )}
          </div>
        )}
      </article>
    </SkeletonTheme>
  );
}
