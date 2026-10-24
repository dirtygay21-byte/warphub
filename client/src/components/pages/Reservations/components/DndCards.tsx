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
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-200 transition-colors active:bg-red-400/20 disabled:opacity-60"
    >
      {isPending ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <XCircle className="size-4" />
      )}
      {isPending ? "Отменяем..." : armed ? "Нажмите ещё раз для отмены" : label}
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
        "overflow-hidden rounded-2xl border bg-app-elevated",
        inactive ? "border-white/10 opacity-60" : "border-accent/30",
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{booking.game.title}</h2>
          <p className="mt-1 text-sm text-white/50">D&D · {booking.game.gameType}</p>
        </div>
        <span
          className={clsx(
            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
            inactive ? "bg-white/10 text-white/60" : "bg-green-400/15 text-green-300",
          )}
        >
          {statusLabel}
        </span>
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
            <p className="text-sm text-red-200">{errorMessage}</p>
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
        "overflow-hidden rounded-2xl border bg-app-elevated",
        inactive ? "border-white/10 opacity-60" : "border-accent/30",
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-4 text-accent" />
            Хочу попробовать D&D
          </h2>
          <p className="mt-1 text-sm text-white/50">Заявка без даты</p>
        </div>
        <span
          className={clsx(
            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
            request.status === "new" && "bg-yellow-400/15 text-yellow-300",
            request.status === "grouped" && "bg-green-400/15 text-green-300",
            request.status === "cancelled" && "bg-white/10 text-white/60",
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
          <p className="rounded-lg bg-green-400/10 px-3 py-2 text-sm text-green-200">
            Мы подобрали вам игру! Запишитесь в разделе D&D → «Игры по расписанию».
          </p>
        )}
      </div>

      {request.status === "new" && (
        <div className="space-y-2 border-t border-white/10 px-4 py-4">
          {errorMessage && <p className="text-sm text-red-200">{errorMessage}</p>}
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
