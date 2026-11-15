import { DetailRow } from "./DetailRow";
import ContentImage from "@/components/ui/ContentImage";
import { formatTimeRange } from "@/utils/reservationDisplay";
import clsx from "clsx";
import { DateTile, DsButton } from "@/components/ui/ds";
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
      {/* как остальные записи (15.11.2026): дата плиткой, название и время; картинка ивента — маленькой справа */}
      <div className="flex items-center gap-3 p-3">
        <DateTile date={event.startsAt} tone={isPast ? "muted" : "lime"} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[16px] font-bold leading-tight">{event.title}</p>
          <p className="mt-1 flex items-center gap-2">
            <span className="whitespace-nowrap text-[14px] text-fg">{formatTimeRange(event.startsAt, event.endsAt)}</span>
            <span className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded-[8px] bg-accent px-2 text-[11.5px] font-semibold text-accent-foreground">
              Ивент · записан
            </span>
          </p>
        </div>
        {event.bannerUrl && (
          <ContentImage src={event.bannerUrl} alt="" crop={event.bannerCrop} className="aspect-[4/3] w-[72px] shrink-0 overflow-hidden rounded-[10px]" />
        )}
      </div>

      <div className="space-y-2.5 border-t border-white/[0.06] px-4 py-3 text-sm">
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
