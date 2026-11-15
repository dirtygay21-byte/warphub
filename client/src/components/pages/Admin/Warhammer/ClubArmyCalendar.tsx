import { getClubArmyCalendar, type ClubArmyBooking } from "@/apiUtils/adminWarhammer";
import { gameHasPoints, gameLabelOf } from "@/apiUtils/booking";
import { DateTile, SectionLabel } from "@/components/ui/ds";
import { useBookingOptions } from "@/hooks/useBookingOptions";
import { clubDateKeyOf, formatClubDate, formatClubTimeRange } from "@/utils/clubTime";
import { userLabel } from "@/utils/user";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";

const overlaps = (a: ClubArmyBooking, b: ClubArmyBooking) =>
  a.game === b.game && Date.parse(a.startsAt) < Date.parse(b.endsAt ?? b.startsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt ?? a.startsAt);

/**
 * Календарь армий клуба (этап 2, 15.11.2026): все активные записи с армией / командой / варбандой клуба на 14 дней,
 * по дням. Пересечение по времени в одной игре подсвечено — две записи одновременно просят модели одной системы.
 */
export default function ClubArmyCalendar() {
  const options = useBookingOptions();
  const query = useQuery({ queryKey: ["admin-club-armies"], queryFn: getClubArmyCalendar, staleTime: 60_000 });
  const [open, setOpen] = useState(false);

  const days = useMemo(() => {
    const list = query.data ?? [];
    const map = new Map<string, { b: ClubArmyBooking; clash: number }[]>();
    for (const b of list) {
      const key = clubDateKeyOf(b.startsAt);
      const clash = list.filter((o) => o !== b && overlaps(o, b)).length;
      map.set(key, [...(map.get(key) ?? []), { b, clash }]);
    }
    return [...map.entries()];
  }, [query.data]);

  const total = query.data?.length ?? 0;
  const clashes = days.some(([, rows]) => rows.some((r) => r.clash > 0));

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="ds-press flex w-full items-center gap-3 rounded-[16px] border border-white/10 bg-app-elevated px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold">Армии клуба · 14 дней</span>
          <span className="mt-0.5 block text-[13px] text-fg-2">
            {query.isLoading ? "Загружаем…" : query.isError ? "Не удалось загрузить" : total === 0 ? "Никто не просит армию клуба" : `Записей: ${total}${clashes ? " · есть пересечения" : ""}`}
          </span>
        </span>
        <ChevronDown className={`size-5 shrink-0 text-fg-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && total > 0 && (
        <div className="mt-3 flex flex-col gap-4">
          {days.map(([key, rows]) => (
            <div key={key}>
              <SectionLabel>{formatClubDate(rows[0]!.b.startsAt)}</SectionLabel>
              <div className="flex flex-col gap-2">
                {rows.map(({ b, clash }) => (
                  <div
                    key={b.reservationId}
                    className={`flex items-center gap-3 rounded-[14px] border bg-app-elevated p-3 ${clash > 0 ? "border-warn/60" : "border-white/10"}`}
                  >
                    <DateTile date={b.startsAt} tone={b.status === "pending" ? "warn" : "lime"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold">{gameLabelOf(options, b.game)}</span>
                      <span className="mt-0.5 block text-[13.5px] text-fg">
                        {formatClubTimeRange(b.startsAt, b.endsAt)}
                        {b.tableName ? ` · ${b.tableName}` : ""}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] text-fg-2">
                        {[
                          userLabel(b.player),
                          b.seats > 1 ? `${b.label.toLowerCase()} ×${b.seats}` : b.label.toLowerCase(),
                          b.points != null && gameHasPoints(b.game) ? `${b.points} оч.` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {clash > 0 && <span className="mt-1 block text-[12.5px] font-semibold text-warn">Пересекается по времени: {clash}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
