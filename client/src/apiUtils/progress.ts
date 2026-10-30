import { apiRequest } from "@/apiUtils/general";

/** Прогресс игрока (сервер: modules/progress) */
export type ProgressCategory = "warhammer" | "dnd" | "painting" | "visits";
export type RankKey = "beginner" | "player" | "experienced" | "veteran";

export type CategoryProgress = {
  category: ProgressCategory;
  games: number;
  rank: RankKey;
  rankLabel: string;
  nextAt: number | null;
  nextLabel: string | null;
};

export type PlayerProgress = { categories: CategoryProgress[]; total: number };

export const RANK_ORDER: RankKey[] = ["beginner", "player", "experienced", "veteran"];
export const RANK_MIN: Record<RankKey, number> = { beginner: 0, player: 5, experienced: 15, veteran: 40 };

export const CATEGORY_LABELS: Record<ProgressCategory, string> = {
  warhammer: "Warhammer",
  dnd: "D&D",
  painting: "Покраска",
  visits: "Посещение клуба",
};

export const getMyProgress = () => apiRequest<PlayerProgress>("/me/progress");
