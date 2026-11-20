import { useNow } from "@/hooks/useNow";
import { DetailRow } from "./DetailRow";
import { hoursLabel } from "@/utils/slots";
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
  AtSign,
  ChevronDown,
  LoaderCircle,
  PencilLine,
  Table2,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { haptic } from "@/utils/haptic";
import { CopyNick, PlayerInfo } from "@/components/booking/PlayerInfo";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { BookingDetailsRows } from "./BookingDetailsRows";
import { DateTile, DsButton } from "@/components/ui/ds";
import { detailsKindForSlug, gameLabelOf, isWhPlayerDetails, clubArmyLabel } from "@/apiUtils/booking";
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

  // 31.10.2026: карточка свёрнута; нажатие раскрывает все подробности на месте (без отдельного экрана)
  const [open, setOpen] = useState(false);
  const options = useBookingOptions();
  const mates = reservation.tablemates ?? [];
  const atTable = reservation.tableId != null;
  const isPlayer = isWhPlayerDetails(reservation.details);
  const summary = [
    limitedMinutes != null ? "⚠️ время ограничено" : null,
    reservation.tableName,
    isWhPlayerDetails(reservation.details) ? gameLabelOf(options, reservation.details.game) : null,
    atTable && !cancelled
      ? mates.length > 0
        ? `${mates.length === 1 ? "соперник" : "за столом"}: ${mates.map((m) => m.firstName).join(", ")}`
        : isPlayer
          ? "ждём соперника"
          : null
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <SkeletonTheme baseColor={getSkeletonColors().baseColor} highlightColor={getSkeletonColors().highlightColor}>
      <article
        className={clsx(
          "ds-enter overflow-hidden rounded-[18px] border bg-app-elevated",
          isPast && "border-white/[0.08] opacity-60",
          !isPast && cancelled && "border-white/[0.08] opacity-75",
          !isPast && !cancelled && "border-white/10",
        )}
      >
        <button
          type="button"
          onClick={() => {
            haptic.tap();
            setOpen((value) => !value);
          }}
          aria-expanded={open}
          className="ds-press flex w-full items-center gap-3 p-3 text-left"
        >
          {/* дата плиткой слева (15.11.2026): список читается по датам; цвет плитки = статус */}
          <DateTile
            date={reservation.startsAt}
            tone={isPast ? "muted" : cancelled ? "danger" : "lime"}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[16px] font-bold leading-tight">
              {isServiceLoading ? <Skeleton width={140} height={16} /> : serviceTitle ?? disciplineTitle ?? "Запись"}
            </span>
            <span className="mt-1 flex items-center gap-2">
              <span className="whitespace-nowrap text-[14px] text-fg">{formatTimeRange(reservation.startsAt, reservation.endsAt)}</span>
              {!isServiceLoading && (
                <span className={clsx("inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-[8px] px-2 text-[11.5px] font-semibold", getStatusStyle(reservation.status))}>
                  {getStatusLabel(reservation.status)}
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-fg-2">{summary || disciplineTitle || "Подробности"}</span>
          </span>
          <ChevronDown className={clsx("size-5 shrink-0 text-fg-3 transition-transform duration-200", open && "rotate-180")} />
        </button>

        {open && (
        <div className="ds-fade border-t border-white/[0.06]">
        <div className="space-y-2.5 px-4 py-3 text-sm">
          <DetailRow
            icon={<UsersRound className="size-4" />}
            label="Мест"
            value={String(reservation.partySize)}
            isLoading={isServiceLoading}
          />
          {reservation.tableName && (
            <DetailRow icon={<Table2 className="size-4" />} label="Стол" value={reservation.tableName} isLoading={false} />
          )}
          {limitedMinutes != null && serviceDuration && (
            <p className="rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-[13px] font-semibold text-danger">
              ⚠️ Время ограничено: {hoursLabel(limitedMinutes)} вместо {hoursLabel(serviceDuration)}. Если не успеете — попросим освободить место к следующей записи; если будет свободно — постараемся продлить.
            </p>
          )}
          <BookingDetailsRows details={reservation.details} />
          {clubArmyCount > 0 && (
            <DetailRow
              icon={<UsersRound className="size-4" />}
              label={clubArmyLabel(isWhPlayerDetails(reservation.details) ? reservation.details.game : null)}
              value={`${clubArmyCount} ${getSeatsLabel(clubArmyCount)}`}
              isLoading={isServiceLoading}
            />
          )}
          {isPlayer && (
            <div className="flex items-center gap-3">
              <span className="text-accent">
                <AtSign className="size-4" />
              </span>
              <span className="text-fg-3">Ваш ник</span>
              <span className="ml-auto min-w-0">
                <CopyNick username={reservation.username} />
              </span>
            </div>
          )}
        </div>

        {atTable && !cancelled && (isPlayer || mates.length > 0) && (
          <section className="px-4 pb-3">
            <h3 className="mb-2 text-[12px] font-bold uppercase tracking-[0.08em] text-fg-3">За столом</h3>
            {mates.length > 0 ? (
              <ul className="space-y-2">
                {mates.map((player, index) => (
                  <li key={index}>
                    <PlayerInfo player={player} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-sm text-fg-2">Пока никого — ждём соперника.</p>
            )}
          </section>
        )}

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
        </div>
        )}
      </article>
    </SkeletonTheme>
  );
}
