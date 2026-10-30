import { DetailRow } from "./DetailRow";
import { formatReservationDate } from "@/utils/date";
import { formatTimeRange } from "@/utils/reservationDisplay";
import clsx from "clsx";
import {
  CalendarDays,
  Clock3,
  LoaderCircle,
  Table2,
  UsersRound,
  XCircle,
} from "lucide-react";
import type { RegisteredEvent } from "@/types";

type EventReservationCardProps = {
  event: RegisteredEvent;
  isPast: boolean;
  isCancelling: boolean;
  onCancel: () => void;
};

export function EventReservationCard({
  event,
  isPast,
  isCancelling,
  onCancel,
}: EventReservationCardProps) {
  return (
    <article
      className={clsx(
        "overflow-hidden rounded-2xl border bg-app-elevated shadow-[0_12px_40px_rgba(0,0,0,0.25)]",
        isPast && "pointer-events-none border-white/10 opacity-45",
        !isPast && "border-accent/30",
      )}
    >
      {event.bannerUrl && (
        <img
          src={event.bannerUrl}
          alt={event.title}
          className="aspect-[2/1] w-full object-cover"
        />
      )}

      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{event.title}</h2>
            <p className="mt-1 text-sm text-fg-3">Ближайший ивент</p>
          </div>

          <span className="shrink-0 rounded-full bg-green-400/15 px-3 py-1 text-xs font-semibold text-green-300">
            Записан
          </span>
        </div>
      </div>

      <div className="space-y-3 px-4 py-4 text-sm">
        <DetailRow
          icon={<CalendarDays className="size-4" />}
          label="Дата"
          value={formatReservationDate(event.startsAt)}
          isLoading={false}
        />
        <DetailRow
          icon={<Clock3 className="size-4" />}
          label="Время"
          value={formatTimeRange(event.startsAt, event.endsAt)}
          isLoading={false}
        />
        <DetailRow
          icon={<UsersRound className="size-4" />}
          label="Гостей"
          value={String(event.partySize)}
          isLoading={false}
        />
        {event.tableIds.length > 0 && (
          <DetailRow
            icon={<Table2 className="size-4" />}
            label="Стол"
            value={event.tableIds.map((id) => `#${id}`).join(", ")}
            isLoading={false}
          />
        )}
      </div>

      {!isPast && (
        <div className="border-t border-white/10 px-4 py-4">
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
            {isCancelling ? "Отменяем…" : "Не смогу посетить"}
          </button>
        </div>
      )}
    </article>
  );
}
