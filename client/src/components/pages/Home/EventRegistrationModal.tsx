/* eslint-disable react-hooks/set-state-in-effect */
import { getEventById, registerForEvent } from "@/apiUtils/events";
import ContentImage from "@/components/ui/ContentImage";
import SeatCountControl from "@/components/pages/Home/Stages/TableSelection/SeatCountControl";
import { formatEventDateTime, formatEventPeriod } from "@/utils/eventDisplay";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  CalendarDays,
  LoaderCircle,
  RefreshCw,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogExit } from "@/components/ui/ds/useDialogExit";
import { toast } from "@/stores/useToastStore";

type EventRegistrationModalProps = {
  eventId: number;
  initialFreeSeats?: number;
  onClose: () => void;
};

export default function EventRegistrationModal({
  eventId,
  initialFreeSeats,
  onClose,
}: EventRegistrationModalProps) {
  const queryClient = useQueryClient();
  const [partySize, setPartySize] = useState(1);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eventQuery = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => getEventById(eventId),
  });

  const freeSeats = eventQuery.data?.freeSeats ?? initialFreeSeats ?? 0;
  const maxPartySize = Math.max(freeSeats, 0);

  useEffect(() => {
    setPartySize((current) =>
      maxPartySize > 0 ? Math.min(current, maxPartySize) : 1
    );
  }, [maxPartySize]);

  const registerMutation = useMutation({
    mutationFn: () => registerForEvent(eventId, partySize),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nearest-event"] });
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Вы записаны на ивент");
      onClose();
    },
    onError: (error) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось записаться на ивент"
      );
    },
  });

  const handleClose = () => {
    if (registerMutation.isPending) return;

    onClose();
  };

  const handleRegister = () => {
    if (registerMutation.isPending || maxPartySize < 1) return;

    setErrorMessage(null);
    registerMutation.mutate();
  };

  const leaving = useDialogExit();

  return createPortal(
    <div
      className={`ds-fade fixed inset-0 z-[60] flex items-end justify-center bg-overlay/70 px-4 pb-8 pt-6 sm:items-center${leaving ? " ds-leaving" : ""}`}
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex max-h-[calc(100dvh-3rem)] w-[calc(100vw-3rem)] max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-app-elevated text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-semibold">Запись на ивент</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={registerMutation.isPending}
            aria-label="Закрыть"
            className="flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/3 text-white/80 transition-colors active:bg-white/10 disabled:opacity-60"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {eventQuery.isLoading && (
            <div className="flex min-h-48 items-center justify-center py-10">
              <LoaderCircle className="size-8 animate-spin text-accent" />
            </div>
          )}

          {eventQuery.isError && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-4 px-5 py-10 text-center">
              <p className="text-sm text-fg-2">
                Не удалось загрузить ивент. Попробуйте ещё раз.
              </p>
              <button
                type="button"
                onClick={() => eventQuery.refetch()}
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-transform active:scale-95"
              >
                <RefreshCw className="size-4" />
                Повторить
              </button>
            </div>
          )}

          {eventQuery.data && (
            <div className="space-y-4 p-5">
              {eventQuery.data.bannerUrl ? (
                <ContentImage
                  src={eventQuery.data.bannerUrl}
                  alt={eventQuery.data.title}
                  crop={eventQuery.data.bannerCrop}
                  className="aspect-video w-full rounded-xl"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-white/5 text-sm text-fg-3">
                  Без баннера
                </div>
              )}

              <div>
                <h3 className="text-xl font-semibold">
                  {eventQuery.data.title}
                </h3>
                {eventQuery.data.description && (
                  <p className="mt-2 text-sm leading-relaxed text-fg-2">
                    {eventQuery.data.description}
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-white/10 bg-white/3 p-4 text-sm text-fg-2">
                <p className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>
                    {formatEventPeriod(
                      eventQuery.data.startsAt,
                      eventQuery.data.endsAt
                    )}
                  </span>
                </p>

                <p className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>
                    Начало: {formatEventDateTime(eventQuery.data.startsAt)}
                  </span>
                </p>

                <p className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 size-4 shrink-0 text-accent" />
                  <span>
                    Окончание: {formatEventDateTime(eventQuery.data.endsAt)}
                  </span>
                </p>

                <p className="flex items-center gap-2">
                  <UsersRound className="size-4 shrink-0 text-accent" />
                  <span>мест: {freeSeats}</span>
                </p>
              </div>

              <div>
                <p className="mb-2 text-sm text-fg-3">
                  Сколько мест нужно?
                </p>
                <SeatCountControl
                  disabled={maxPartySize < 1 || registerMutation.isPending}
                  maxPartyCount={Math.max(maxPartySize, 1)}
                  selectedPartyCount={partySize}
                  onChange={setPartySize}
                />
              </div>
            </div>
          )}
        </div>

        {eventQuery.data && (
          <div className="shrink-0 space-y-3 border-t border-white/10 px-5 py-4">
            {errorMessage && (
              <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
                {errorMessage}
              </div>
            )}

            <button
              type="button"
              onClick={handleRegister}
              disabled={
                registerMutation.isPending || maxPartySize < 1 || partySize < 1
              }
              className={clsx(
                "flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-transform active:scale-95 disabled:opacity-40",
                "bg-accent text-accent-foreground"
              )}
            >
              {registerMutation.isPending ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Записываем...
                </>
              ) : maxPartySize < 1 ? (
                "Мест нет"
              ) : (
                "Подтвердить запись"
              )}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
