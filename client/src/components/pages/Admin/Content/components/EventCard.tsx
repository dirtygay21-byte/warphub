import type { Event } from "@/types";
import { getSeatsLabel } from "@/utils/plural";
import { CalendarDays, Table2, UsersRound } from "lucide-react";
import { formatEventPeriod } from "../utils";

type EventCardProps = {
  event: Event;
  onClick: () => void;
};

export default function EventCard({ event, onClick }: EventCardProps) {
  const tablesLabel =
    event.tableIds.length > 0 ? event.tableIds.join(", ") : "—";

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full overflow-hidden rounded-2xl border border-white/10 bg-app-elevated text-left transition-colors hover:cursor-pointer hover:border-accent/40 active:bg-white/5"
    >
      {event.bannerUrl ? (
        <img
          src={event.bannerUrl}
          alt={event.title}
          className="aspect-[16/7] w-full object-cover"
        />
      ) : (
        <div className="flex aspect-[16/7] w-full items-center justify-center bg-white/5 text-sm text-white/40">
          Без баннера
        </div>
      )}

      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{event.title}</h3>
          {event.description && (
            <p className="mt-1 line-clamp-2 text-sm text-white/60">
              {event.description}
            </p>
          )}
        </div>

        <div className="space-y-2 text-sm text-white/70">
          <p className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
            <span>{formatEventPeriod(event.startsAt, event.endsAt)}</span>
          </p>

          <p className="flex items-center gap-2">
            <UsersRound className="size-4 shrink-0 text-accent" />
            <span>
              {event.seatsPerTable} {getSeatsLabel(event.seatsPerTable)}
            </span>
          </p>

          <p className="flex items-center gap-2">
            <Table2 className="size-4 shrink-0 text-accent" />
            <span>Столы: {tablesLabel}</span>
          </p>
        </div>
      </div>
    </button>
  );
}
