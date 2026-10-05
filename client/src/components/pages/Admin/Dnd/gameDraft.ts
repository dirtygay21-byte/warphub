import type { AdminDndGame, DndGameStatus } from "@/apiUtils/dnd";
import { toClubDatetimeLocal } from "@/utils/clubTime";

export type GameDraft = {
  title: string;
  description: string;
  gameType: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  imageUrl: string;
  status: DndGameStatus;
};

export const GAME_TYPE_PRESETS = ["Пробная игра", "One-shot", "Кампания"];

export const emptyGameDraft = (patch: Partial<GameDraft> = {}): GameDraft => ({
  title: "",
  description: "",
  gameType: GAME_TYPE_PRESETS[0]!,
  startsAt: "",
  endsAt: "",
  capacity: "5",
  imageUrl: "",
  status: "open",
  ...patch,
});

export const gameToDraft = (game: AdminDndGame): GameDraft => ({
  title: game.title,
  description: game.description ?? "",
  gameType: game.gameType,
  startsAt: toClubDatetimeLocal(game.startsAt),
  endsAt: toClubDatetimeLocal(game.endsAt),
  capacity: String(game.capacity),
  imageUrl: game.imageUrl ?? "",
  status: game.status,
});
