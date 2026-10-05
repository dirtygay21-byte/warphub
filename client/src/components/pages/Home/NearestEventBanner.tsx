import { getNearestEvent } from "@/apiUtils/events";
import EventRegistrationModal from "@/components/pages/Home/EventRegistrationModal";
import { formatEventPeriod } from "@/utils/eventDisplay";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";

export default function NearestEventBanner() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const nearestEventQuery = useQuery({
    queryKey: ["nearest-event"],
    queryFn: getNearestEvent,
  });

  if (nearestEventQuery.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-app-surface">
        <LoaderCircle className="size-8 animate-spin text-accent" />
      </div>
    );
  }

  if (nearestEventQuery.isError) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-app-surface px-4 text-center text-sm text-white/60">
        Не удалось загрузить ближайший ивент
      </div>
    );
  }

  const event = nearestEventQuery.data;

  if (!event) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-app-surface px-4 text-center text-sm text-white/60">
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
        onClick={() => canRegister && setIsModalOpen(true)}
        disabled={!canRegister}
        aria-label={canRegister ? "Записаться на ивент" : "Мест нет"}
        className={clsx(
          "relative h-full w-full overflow-hidden rounded-xl text-left",
          canRegister
            ? "cursor-pointer transition-transform active:scale-[0.99]"
            : "cursor-not-allowed opacity-70"
        )}
      >
        {event.bannerUrl ? (
          <img
            src={event.bannerUrl}
            alt={event.title}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-app-surface" />
        )}

        <div className="absolute inset-0 bg-overlay/60" />

        <div className="relative z-10 flex h-full flex-col items-center justify-center px-4 py-6 text-center text-white">
          <h2 className="text-xl font-semibold sm:text-2xl">{event.title}</h2>
          <p className="mt-2 text-sm text-white/80 sm:text-base">
            {formatEventPeriod(event.startsAt, event.endsAt)}
          </p>
          <p className="mt-auto text-sm text-white/60">
            {canRegister ? "Нажми чтобы записаться" : "Мест нет"}
          </p>
        </div>

        <p className="absolute bottom-3 right-3 z-10 text-sm text-white/60">
          мест: {freeSeats}
        </p>
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
