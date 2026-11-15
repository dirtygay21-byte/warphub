import type { OpenGame } from "@/apiUtils/booking";
import { formatClubDate, formatClubTimeRange } from "@/utils/clubTime";

/** Текст приглашения для чата: игра, день, время, кто ждёт. */
export function openGameShareText(g: Pick<OpenGame, "serviceTitle" | "startsAt" | "endsAt" | "players">) {
  const p = g.players[0];
  const who = [p?.gameLabel, p?.army].filter(Boolean).join(", ");
  return `Ищу соперника в WarpHub: ${g.serviceTitle ?? "игра"}, ${formatClubDate(g.startsAt)}, ${formatClubTimeRange(g.startsAt, g.endsAt)}${
    who ? ` (${who})` : ""
  }. Записаться — в боте:`;
}
