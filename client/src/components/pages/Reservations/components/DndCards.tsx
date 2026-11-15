import {
  DND_TRIAL_STATUS_LABELS,
  DND_MASTER_CONTACT,
  flexibleLabel,
  isDndBookingInactive,
  type DndBooking,
  type DndGame,
  type DndTrialRequest,
} from "@/apiUtils/dnd";
import { formatClub, formatClubTimeRange } from "@/utils/clubTime";
import clsx from "clsx";
import {
  CalendarDays,
  Clock3,
  LoaderCircle,
  Medal,
  Sparkles,
  ThumbsUp,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { DetailRow } from "./DetailRow";
import { DateTile } from "@/components/ui/ds";

function CancelButton({
  label,
  isPending,
  onConfirm,
}: {
  label: string;
  isPending: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className="ds-press flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-danger/40 bg-transparent px-4 text-[15px] font-semibold text-danger disabled:opacity-60"
    >
      {isPending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <XCircle className="size-4" />
      )}
      {isPending ? "Отменяем…" : armed ? "Нажмите ещё раз для отмены" : label}
    </button>
  );
}

export function DndBookingCard({
  booking,
  isCancelling,
  errorMessage,
  onCancel,
}: {
  booking: DndBooking & { game: DndGame };
  isCancelling: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
}) {
  const inactive = isDndBookingInactive(booking);
  const gameCancelled = booking.game.status === "cancelled";
  const statusLabel =
    booking.status === "cancelled"
      ? "Отменена"
      : gameCancelled
        ? "Игра отменена"
        : inactive
          ? "Прошла"
          : "Записан";

  return (
    <article
      className={clsx(
        "ds-enter overflow-hidden rounded-[18px] border bg-app-elevated",
        inactive ? "border-white/[0.08] opacity-60" : "border-white/10",
      )}
    >
      {/* дата плиткой, как у остальных записей (15.11.2026) */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] p-3">
        {booking.game.startsAt && <DateTile date={booking.game.startsAt} tone={inactive ? "muted" : "lime"} />}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[16px] font-bold leading-tight">{booking.game.title}</h2>
          <p className="mt-1 flex items-center gap-2">
            <span className="truncate text-[14px] text-fg-2">D&D · {booking.game.gameType}</span>
            <span
              className={clsx(
                "inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-[8px] px-2 text-[11.5px] font-semibold",
                inactive ? "bg-white/[0.08] text-fg-2" : "bg-accent text-accent-foreground",
              )}
            >
              {statusLabel}
            </span>
          </p>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 text-sm">
        {booking.game.startsAt ? (
          <>
            <DetailRow
              icon={<CalendarDays className="size-4" />}
              label="Дата"
              value={formatClub(booking.game.startsAt, {
                day: "numeric",
                month: "long",
                weekday: "short",
              })}
              isLoading={false}
            />
            <DetailRow
              icon={<Clock3 className="size-4" />}
              label="Время"
              value={formatClubTimeRange(booking.game.startsAt, booking.game.endsAt)}
              isLoading={false}
            />
          </>
        ) : (
          <DetailRow
            icon={<CalendarDays className="size-4" />}
            label="Когда"
            value={`${flexibleLabel(booking.game)}. ${DND_MASTER_CONTACT}`}
            isLoading={false}
          />
        )}
        <DetailRow
          icon={<UsersRound className="size-4" />}
          label="Мест"
          value={String(booking.quantity)}
          isLoading={false}
        />
        {booking.game.startsAt && (
          <DetailRow
            icon={<ThumbsUp className="size-4" />}
            label="Время удобно"
            value={booking.timeIsConvenient ? "Да" : "Нет"}
            isLoading={false}
          />
        )}
        {booking.experienceLabel && (
          <DetailRow
            icon={<Medal className="size-4" />}
            label="Опыт"
            value={booking.experienceLabel}
            isLoading={false}
          />
        )}
      </div>

      {!inactive && (
        <div className="space-y-2 border-t border-white/10 px-4 py-4">
          {errorMessage && (
            <p className="text-sm text-danger">{errorMessage}</p>
          )}
          <CancelButton
            label="Отменить запись"
            isPending={isCancelling}
            onConfirm={onCancel}
          />
        </div>
      )}
    </article>
  );
}

export function TrialRequestCard({
  request,
  isCancelling,
  errorMessage,
  onCancel,
}: {
  request: DndTrialRequest;
  isCancelling: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
}) {
  const inactive = request.status === "cancelled";

  return (
    <article
      className={clsx(
        "ds-enter overflow-hidden rounded-[18px] border bg-app-elevated",
        inactive ? "border-white/[0.08] opacity-60" : "border-white/10",
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-4 text-accent" />
            Хочу попробовать D&D
          </h2>
          <p className="mt-1 text-sm text-fg-3">Заявка без даты</p>
        </div>
        <span
          className={clsx(
            "inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-lg px-2 text-[12px] font-semibold",
            request.status === "new" && "bg-warn text-accent-foreground",
            request.status === "grouped" && "bg-accent text-accent-foreground",
            request.status === "cancelled" && "bg-white/[0.08] text-fg-2",
          )}
        >
          {DND_TRIAL_STATUS_LABELS[request.status]}
        </span>
      </div>

      <div className="space-y-3 px-4 py-4 text-sm">
        <DetailRow
          icon={<UsersRound className="size-4" />}
          label="Игроков"
          value={`${request.playersCount}${request.isPrivate ? " · своей компанией" : ""}`}
          isLoading={false}
        />
        <DetailRow
          icon={<Clock3 className="size-4" />}
          label="Удобное время"
          value={
            request.preferredTimeLabels.length
              ? request.preferredTimeLabels.join(", ")
              : "Любое"
          }
          isLoading={false}
        />
        {request.experienceLabel && (
          <DetailRow
            icon={<Medal className="size-4" />}
            label="Опыт"
            value={request.experienceLabel}
            isLoading={false}
          />
        )}
        {request.status === "grouped" && (
          <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm text-fg">
            Мы подобрали вам игру! Запишитесь в разделе D&D → «Игры по расписанию».
          </p>
        )}
      </div>

      {request.status === "new" && (
        <div className="space-y-2 border-t border-white/10 px-4 py-4">
          {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
          <CancelButton
            label="Отменить заявку"
            isPending={isCancelling}
            onConfirm={onCancel}
          />
        </div>
      )}
    </article>
  );
}
