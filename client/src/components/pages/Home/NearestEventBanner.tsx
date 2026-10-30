import { getNearestEvent } from "@/apiUtils/events";
import EventRegistrationModal from "@/components/pages/Home/EventRegistrationModal";
import { formatEventPeriod } from "@/utils/eventDisplay";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";
import { getSeatsLabel } from "@/utils/plural";

export default function NearestEventBanner() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const nearestEventQuery = useQuery({
    queryKey: ["nearest-event"],
    queryFn: getNearestEvent,
  });

  if (nearestEventQuery.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[18px] bg-app-surface">
        <LoaderCircle className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  if (nearestEventQuery.isError) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[18px] bg-app-surface px-4 text-center text-sm text-fg-2">
        Не удалось загрузить ближайший ивент
      </div>
    );
  }

  const event = nearestEventQuery.data;

  if (!event) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[18px] bg-app-surface px-4 text-center text-sm text-fg-2">
        Ближайших ивентов пока нет
      </div>
    );
  }

  const freeSeats = event.freeSeats ?? event.capacity;
  const canRegister = freeSeats >= 1;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!canRegister) return;
          haptic.tap();
          setIsModalOpen(true);
        }}
        disabled={!canRegister}
        aria-label={canRegister ? `Записаться на ивент «${event.title}»` : "Мест нет"}
        className={clsx(
          "relative block h-full w-full overflow-hidden rounded-[18px] text-left",
          canRegister ? "ds-press cursor-pointer" : "cursor-not-allowed"
        )}
      >
        {event.bannerUrl ? (
          <img src={event.bannerUrl} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-app-surface" />
        )}

        {/* затемнение снизу — текст читается на любой картинке */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-4 text-fg">
          <h3 className="text-[19px] font-bold leading-tight">{event.title}</h3>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-white/85">{formatEventPeriod(event.startsAt, event.endsAt)}</span>
            {canRegister ? (
              <Badge tone="accent" className="bg-accent/20">
                Свободно {freeSeats} {getSeatsLabel(freeSeats)}
              </Badge>
            ) : (
              <Badge tone="danger">Мест нет</Badge>
            )}
          </div>
        </div>
      </button>

      {isModalOpen && (
        <EventRegistrationModal
          eventId={event.id}
          initialFreeSeats={freeSeats}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </>
  );
}
