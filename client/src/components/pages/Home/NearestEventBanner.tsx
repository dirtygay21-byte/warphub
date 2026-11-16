import { getNearestEvent } from "@/apiUtils/events";
import ContentImage from "@/components/ui/ContentImage";
import EventRegistrationModal from "@/components/pages/Home/EventRegistrationModal";
import { formatEventPeriod } from "@/utils/eventDisplay";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";

import { useState } from "react";
import { Badge, Skeleton } from "@/components/ui/ds";
import { haptic } from "@/utils/haptic";
import { getSeatsLabel } from "@/utils/plural";
import { AnimatePresence } from "motion/react";
import { ChevronRight } from "lucide-react";

export default function NearestEventBanner() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const nearestEventQuery = useQuery({
    queryKey: ["nearest-event"],
    queryFn: getNearestEvent,
  });

  if (nearestEventQuery.isLoading) {
    return (
      <Skeleton className="aspect-[2/1] w-full rounded-[18px]" />
    );
  }

  if (nearestEventQuery.isError) {
    return (
      <div className="flex min-h-[64px] w-full items-center justify-center rounded-[18px] border border-white/10 bg-app-elevated px-4 text-center text-sm text-fg-2">
        Не удалось загрузить ближайший ивент
      </div>
    );
  }

  const event = nearestEventQuery.data;

  if (!event) {
    return (
      <div className="flex min-h-[64px] w-full items-center justify-center rounded-[18px] border border-white/10 bg-app-elevated px-4 text-center text-sm text-fg-2">
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
          // баннер во всю ширину, 2:1 — как обложки новостей (16.11.2026): картинка видна целиком, GIF играет на главной
          "block w-full overflow-hidden rounded-[18px] border border-white/10 bg-app-elevated text-left",
          canRegister ? "ds-press cursor-pointer" : "cursor-not-allowed"
        )}
      >
        <span className="relative block aspect-[2/1] w-full overflow-hidden bg-accent">
          {event.bannerUrl ? (
            <ContentImage src={event.bannerUrl} alt="" crop={event.bannerCrop} className="absolute inset-0 size-full" />
          ) : (
            <span className="absolute inset-0 flex items-end p-4">
              <span className="line-clamp-2 font-display text-[28px] uppercase leading-none text-accent-foreground">{event.title}</span>
            </span>
          )}
        </span>
        <span className="flex items-center gap-3 px-4 pb-3.5 pt-3">
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[17px] font-bold leading-tight text-fg">{event.title}</span>
            <span className="mt-1 block text-[13px] text-fg-2">{formatEventPeriod(event.startsAt, event.endsAt)}</span>
            <span className="mt-2 block">
              {canRegister ? (
                <Badge tone="accent">
                  Свободно {freeSeats} {getSeatsLabel(freeSeats)}
                </Badge>
              ) : (
                <Badge tone="danger">Мест нет</Badge>
              )}
            </span>
          </span>
          {canRegister && <ChevronRight aria-hidden className="size-5 shrink-0 text-fg-3" />}
        </span>
      </button>

      <AnimatePresence>
        {isModalOpen && (
          <EventRegistrationModal
            eventId={event.id}
            initialFreeSeats={freeSeats}
            onClose={() => setIsModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
