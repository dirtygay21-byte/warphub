import { DetailRow } from "./DetailRow";
import { formatReservationDate } from "@/utils/date";
import { formatTimeRange } from "@/utils/reservationDisplay";
import clsx from "clsx";
import { DsButton } from "@/components/ui/ds";
import {
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
        "ds-enter overflow-hidden rounded-[18px] border bg-app-elevated",
        isPast && "pointer-events-none border-white/[0.08] opacity-60",
        !isPast && "border-white/10",
      )}
    >
      {event.bannerUrl && (
        <img
          src={event.bannerUrl}
          alt={event.title}
          className="aspect-[2/1] w-full object-cover"
        />
      )}

      <div className="space-y-1 px-4 pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-semibold uppercase tracking-[0.08em] text-fg-3">Ивент · {event.title}</span>
          <span className="inline-flex h-[26px] shrink-0 items-center whitespace-nowrap rounded-lg bg-accent/15 px-2 text-[12px] font-semibold text-accent">
            Записан
          </span>
        </div>
        <p className="text-lg font-bold leading-snug">
          {formatReservationDate(event.startsAt)} · <span className="whitespace-nowrap">{formatTimeRange(event.startsAt, event.endsAt)}</span>
        </p>
      </div>

      <div className="space-y-2.5 px-4 py-3 text-sm">
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
        <div className="px-4 pb-4">
          <DsButton variant="danger" onClick={onCancel} disabled={isCancelling} className="w-full">
            {isCancelling ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <XCircle className="size-4" />
            )}
            {isCancelling ? "Отменяем…" : "Не смогу посетить"}
          </DsButton>
        </div>
      )}
    </article>
  );
}
