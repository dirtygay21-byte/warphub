import type { Event } from "@/types";
import ContentImage from "@/components/ui/ContentImage";
import { getSeatsLabel } from "@/utils/plural";
import { DateTile } from "@/components/ui/ds";
import { ChevronRight } from "lucide-react";
import { formatEventPeriod } from "../utils";

type EventCardProps = {
  event: Event;
  onClick: () => void;
};

/** Ивент в админке строкой (перестройка 15.11.2026): дата плиткой, название, время, места и столы; баннер — миниатюрой. */
export default function EventCard({ event, onClick }: EventCardProps) {
  const tablesLabel = event.tableIds.length > 0 ? event.tableIds.join(", ") : "—";

  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-press flex w-full items-center gap-3 rounded-[18px] border border-white/10 bg-app-elevated p-3 text-left"
    >
      <DateTile date={event.startsAt} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-bold leading-tight text-fg">{event.title}</span>
        <span className="mt-1 block text-[13px] text-fg-2">{formatEventPeriod(event.startsAt, event.endsAt)}</span>
        <span className="mt-0.5 block truncate text-[12.5px] text-fg-3">
          {event.seatsPerTable} {getSeatsLabel(event.seatsPerTable)} · столы: {tablesLabel}
        </span>
      </span>
      {event.bannerUrl ? (
        <ContentImage src={event.bannerUrl} alt="" crop={event.bannerCrop} className="aspect-[4/3] w-[64px] shrink-0 overflow-hidden rounded-[10px]" />
      ) : (
        <span className="flex aspect-[4/3] w-[64px] shrink-0 items-center justify-center rounded-[10px] bg-white/5 text-center text-[11px] text-fg-3">Без баннера</span>
      )}
      <ChevronRight className="size-5 shrink-0 text-fg-3" />
    </button>
  );
}
