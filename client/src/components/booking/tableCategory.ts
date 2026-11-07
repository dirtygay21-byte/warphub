/**
 * Категории столов (решение владельца 05.11.2026): столы 1–2 — Full-scale Wargaming (40K, AoS),
 * столы 3–4 — Tactical Games (Kill Team, Warcry). Игры на сервере — backend/src/config/booking.ts → tableCategoryByGame.
 */
export type TableCategory = "wh" | "small";

export const TABLE_CATEGORY_LABEL: Record<TableCategory, string> = {
  wh: "Полномасштабный варгейм",
  small: "Тактические игры",
};

/** Игры, которые можно выбрать на столе категории */
export const GAMES_BY_CATEGORY: Record<TableCategory, readonly string[]> = {
  wh: ["40k", "aos"],
  small: ["kt", "warcry"],
};
