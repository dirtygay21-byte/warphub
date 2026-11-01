import type { AdminDndGame, DndGameStatus } from "@/apiUtils/dnd";
import { toClubDatetimeLocal } from "@/utils/clubTime";

export type GameDraft = {
  title: string;
  description: string;
  gameType: string;
  /** flexible — дни недели и время суток (по умолчанию); exact — точное начало */
  timeMode: "flexible" | "exact";
  daysOfWeek: string[];
  timesOfDay: string[];
  startsAt: string;
  /** длительность игры, часов (точное время): конец = начало + часы; клуб закрыт ещё на час после (31.10.2026) */
  hours: string;
  capacity: string;
  imageUrl: string;
  status: DndGameStatus;
};

/** Длительность игры D&D на выбор, часов */
export const DND_HOURS = ["1", "2", "3", "4", "5", "6", "7", "8"];
/** Клуб закрыт после игры D&D ещё столько часов (как bookingConfig.dndClosureBufferMinutes на сервере) */
export const DND_CLOSURE_BUFFER_HOURS = 1;

/** Часы существующей игры: из начала и конца, округлено до часа (1–8); без конца — 4 */
const gameHours = (startsAt: string | null, endsAt: string | null) => {
  if (!startsAt || !endsAt) return "4";
  const h = Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000);
  return String(Math.min(8, Math.max(1, h)));
};

export const GAME_TYPE_PRESETS = ["Пробная игра", "One-shot", "Кампания"];

export const emptyGameDraft = (patch: Partial<GameDraft> = {}): GameDraft => ({
  title: "",
  description: "",
  gameType: GAME_TYPE_PRESETS[0]!,
  timeMode: "flexible",
  daysOfWeek: [],
  timesOfDay: [],
  startsAt: "",
  hours: "4",
  capacity: "5",
  imageUrl: "",
  status: "open",
  ...patch,
});

export const gameToDraft = (game: AdminDndGame): GameDraft => ({
  title: game.title,
  description: game.description ?? "",
  gameType: game.gameType,
  timeMode: game.startsAt ? "exact" : "flexible",
  daysOfWeek: game.daysOfWeek.map(String),
  timesOfDay: game.timesOfDay,
  startsAt: toClubDatetimeLocal(game.startsAt),
  hours: gameHours(game.startsAt, game.endsAt),
  capacity: String(game.capacity),
  imageUrl: game.imageUrl ?? "",
  status: game.status,
});
