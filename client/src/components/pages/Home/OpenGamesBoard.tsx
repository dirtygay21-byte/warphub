import { getOpenGames, type OpenGame } from "@/apiUtils/booking";
import type { Discipline } from "@/types";
import { DateTile, SectionLabel } from "@/components/ui/ds";
import { useRegistrationStageStore } from "@/stores/useRegistrationStageStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { formatClubDate, formatClubTimeRange } from "@/utils/clubTime";
import { haptic } from "@/utils/haptic";
import { s3Url } from "@/utils/s3utils";
import { shareToChat } from "@/utils/telegramApp";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useState } from "react";

/** Текст приглашения для чата: игра, день, время, кто ждёт. */
export function openGameShareText(g: Pick<OpenGame, "serviceTitle" | "startsAt" | "endsAt" | "players">) {
  const p = g.players[0];
  const who = [p?.gameLabel, p?.army].filter(Boolean).join(", ");
  return `Ищу соперника в WarpHub: ${g.serviceTitle ?? "игра"}, ${formatClubDate(g.startsAt)}, ${formatClubTimeRange(g.startsAt, g.endsAt)}${
    who ? ` (${who})` : ""
  }. Записаться — в боте:`;
}

/**
 * Доска «Ищут соперника» (этап 2, 15.11.2026): все столы на 7 дней, где один игрок ждёт пару, — по всем играм сразу.
 * «Играть» ведёт прямо к анкете присоединения (тот же путь, что карточка на шаге выбора времени); «Позвать» — в чат Telegram.
 * Пустая доска не показывается.
 */
export default function OpenGamesBoard({ disciplines }: { disciplines: Discipline[] }) {
  const query = useQuery({ queryKey: ["open-games"], queryFn: getOpenGames, staleTime: 30_000 });
  const [all, setAll] = useState(false);
  const { setDisciplineId, setServiceId, setSelectedDate, setSelectedSlot, setPartyCount, setPrefillDetails } = useReservationStore();
  const { nextStage } = useRegistrationStageStore();

  const games = query.data ?? [];
  if (games.length === 0) return null;
  const shown = all ? games : games.slice(0, 3);

  const join = (g: OpenGame) => {
    haptic.tap();
    const [y, m, d] = g.date.split("-").map(Number);
    setPrefillDetails(null);
    setDisciplineId(g.disciplineId);
    setServiceId(g.serviceId);
    setSelectedDate(new Date(y!, m! - 1, d!));
    setPartyCount(1);
    setSelectedSlot({
      kind: "join",
      tableId: g.tableId,
      category: g.tableCategory,
      startsAt: g.startsAt,
      endsAt: g.endsAt,
      occupied: g.occupied,
      capacity: g.capacity,
      players: g.players,
    });
    nextStage();
    nextStage();
    nextStage();
  };

  return (
    <section>
      <SectionLabel>Ищут соперника · {games.length}</SectionLabel>
      <div className="flex flex-col gap-2">
        {shown.map((g) => {
          const discipline = disciplines.find((x) => x.id === g.disciplineId);
          const p = g.players[0];
          const sub = [p?.firstName, p?.experienceLabel, p?.army].filter(Boolean).join(" · ");
          return (
            <article key={`${g.serviceId}-${g.tableId}-${g.startsAt}`} className="flex items-center gap-3 rounded-[18px] border border-accent/40 bg-app-elevated p-3">
              <DateTile date={g.startsAt} tone="lime" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  {discipline && <img src={s3Url(`disciplines/${discipline.slug}.webp`)} alt="" className="size-4 shrink-0" />}
                  <span className="truncate text-[15px] font-bold leading-tight">{g.serviceTitle ?? discipline?.title ?? "Игра"}</span>
                </span>
                <span className="mt-1 block text-[14px] text-fg">{formatClubTimeRange(g.startsAt, g.endsAt)}</span>
                {sub && <span className="mt-0.5 block truncate text-[13px] text-fg-2">{sub}</span>}
              </span>
              <span className="flex shrink-0 flex-col gap-1.5">
                <button type="button" onClick={() => join(g)} className="ds-press min-h-9 rounded-[11px] bg-accent px-3 text-[13px] font-bold text-accent-foreground">
                  Играть
                </button>
                <button
                  type="button"
                  onClick={() => (haptic.tap(), shareToChat(openGameShareText(g)))}
                  aria-label="Позвать друга в чате"
                  className="ds-press flex min-h-9 items-center justify-center gap-1 rounded-[11px] bg-white/[0.07] px-3 text-[12.5px] font-semibold text-fg-2"
                >
                  <Send className="size-3.5" />
                  Позвать
                </button>
              </span>
            </article>
          );
        })}
        {games.length > 3 && (
          <button type="button" onClick={() => (haptic.tap(), setAll((v) => !v))} className="ds-press min-h-10 rounded-[14px] text-[14px] font-semibold text-accent">
            {all ? "Свернуть" : `Показать все (${games.length})`}
          </button>
        )}
      </div>
    </section>
  );
}
