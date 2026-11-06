import { getAdminEvents } from "@/apiUtils/admin";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { CalendarX2, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import EventCard from "./components/EventCard";
import EventDetailsModal from "./components/EventDetailsModal";
import { Skeleton } from "@/components/ui/ds";

export default function EventsList() {
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const eventsQuery = useQuery({
    queryKey: ["admin-events"],
    queryFn: getAdminEvents,
  });

  const closeModal = () => {
    setSelectedEventId(null);
    setIsCreateOpen(false);
  };

  const openCreateModal = () => {
    setSelectedEventId(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (eventId: number) => {
    setIsCreateOpen(false);
    setSelectedEventId(eventId);
  };

  if (eventsQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Загружаем события">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[88px] rounded-2xl" />
        ))}
      </div>
    );
  }

  if (eventsQuery.isError) {
    return (
      <>
        <div className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-app-elevated px-5 py-8 text-center">
          <p className="text-sm text-fg-2">
            Не удалось загрузить ивенты. Попробуйте ещё раз.
          </p>
          <button
            type="button"
            onClick={() => eventsQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
          >
            <RefreshCw className="size-4" />
            Повторить
          </button>
        </div>

        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <button
            type="button"
            onClick={openCreateModal}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lg transition-transform active:scale-95"
          >
            <Plus className="size-4" />
            Создать ивент
          </button>
        </div>

        {isCreateOpen && (
          <EventDetailsModal mode="create" onClose={closeModal} />
        )}
      </>
    );
  }

  const events = eventsQuery.data ?? [];

  return (
    <>
      <div className="space-y-4 pb-24">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-fg-3">
            {events.length > 0 ? `Всего ${events.length}` : "Ивентов пока нет"}
          </p>

          <button
            type="button"
            onClick={() => eventsQuery.refetch()}
            disabled={eventsQuery.isFetching}
            aria-label="Обновить список"
            className="flex ds-hit size-10 items-center justify-center rounded-xl border border-white/10 bg-white/3 transition-colors active:bg-white/10 disabled:opacity-60"
          >
            <RefreshCw
              className={clsx(
                "size-4",
                eventsQuery.isFetching && "animate-spin"
              )}
            />
          </button>
        </div>

        {events.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-app-elevated px-5 py-8 text-center text-fg-2">
            <CalendarX2 className="size-10 text-fg-3" />
            <p className="text-sm">Созданных ивентов пока нет</p>
          </div>
        ) : (
          <div
            className={clsx(
              "space-y-3 md:grid md:grid-cols-2 md:items-start md:gap-4 md:space-y-0 xl:grid-cols-3",
              eventsQuery.isFetching && "opacity-70"
            )}
          >
            {events.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onClick={() => openEditModal(event.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
        <button
          type="button"
          onClick={openCreateModal}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground shadow-lg transition-transform active:scale-95"
        >
          <Plus className="size-4" />
          Создать ивент
        </button>
      </div>

      {isCreateOpen && <EventDetailsModal mode="create" onClose={closeModal} />}

      {selectedEventId !== null && (
        <EventDetailsModal
          mode="edit"
          eventId={selectedEventId}
          onClose={closeModal}
        />
      )}
    </>
  );
}
