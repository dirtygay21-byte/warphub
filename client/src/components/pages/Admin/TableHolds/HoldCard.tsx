import { deleteTableHold, HOLD_PURPOSE_LABELS, type TableHold } from "@/apiUtils/tableHolds";
import { formatClub, formatClubTimeRange } from "@/utils/clubTime";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, UserRound } from "lucide-react";
import { useState } from "react";

/**
 * Бронь стола (общая для «Столы Warhammer» и D&D): стол, когда, цель, название, кто бронирует, описание,
 * кто создал в приложении; снять — двумя нажатиями. showDate — в общем списке (в дневном виде дата уже видна).
 */
export default function HoldCard({ hold, showDate = false }: { hold: TableHold; showDate?: boolean }) {
  const queryClient = useQueryClient();
  const [armed, setArmed] = useState(false);
  const remove = useMutation({
    meta: { success: "Бронь стола удалена" },
    mutationFn: () => deleteTableHold(hold.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-warhammer-day"] });
      queryClient.invalidateQueries({ queryKey: ["table-holds"] });
    },
  });
  const creator = hold.createdBy.name ?? (hold.createdBy.username ? `@${hold.createdBy.username}` : `ID ${hold.createdBy.telegramId}`);

  return (
    <article className="rounded-[16px] border border-accent/30 bg-app-elevated p-4 text-sm text-fg">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold">
            {showDate && <span className="capitalize">{formatClub(hold.startsAt, { weekday: "short", day: "numeric", month: "long" })} · </span>}
            <span className="whitespace-nowrap">{formatClubTimeRange(hold.startsAt, hold.endsAt)}</span>
          </p>
          <p className="mt-0.5 text-fg-2">{hold.tableName}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-accent/15 px-2 py-1 text-[12px] font-semibold text-accent">
          <Lock className="size-3.5" />
          {HOLD_PURPOSE_LABELS[hold.purpose]}
        </span>
      </div>
      <p className="mt-2 text-[15px] font-semibold">{hold.title}</p>
      {hold.reservedBy && (
        <p className="mt-1 flex items-center gap-1.5 text-fg">
          <UserRound className="size-4 shrink-0 text-accent" />
          Бронирует: {hold.reservedBy}
        </p>
      )}
      {hold.description && <p className="mt-1.5 whitespace-pre-line text-fg-2">{hold.description}</p>}
      <p className="mt-2 text-[12px] text-fg-3">Создал в приложении: {creator}</p>
      <button
        type="button"
        disabled={remove.isPending}
        onClick={() => (armed ? remove.mutate() : setArmed(true))}
        onBlur={() => setArmed(false)}
        className="ds-press mt-3 h-11 w-full rounded-[14px] border border-danger/40 text-[15px] font-semibold text-danger disabled:opacity-60"
      >
        {remove.isPending ? "Снимаем…" : armed ? "Нажмите ещё раз, чтобы снять" : "Снять бронь"}
      </button>
      {remove.isError && <p className="mt-2 text-[13px] text-danger">{remove.error.message}</p>}
    </article>
  );
}
