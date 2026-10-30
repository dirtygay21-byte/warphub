import type { CategoryProgress, ProgressCategory } from "@/apiUtils/progress";
import { RANK_ORDER } from "@/apiUtils/progress";

const KEY = "wh_avatar_frame";

/** Выбранная игроком рамка (на этом устройстве); иначе — категория с высшим рангом, при равенстве — где больше игр. */
export function pickFrame(categories: CategoryProgress[]): CategoryProgress | null {
  if (!categories.length) return null;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    /* хранилище недоступно — берём лучшую категорию */
  }
  const chosen = categories.find((c) => c.category === saved);
  if (chosen) return chosen;
  return [...categories].sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank) || b.games - a.games)[0]!;
}

export function saveFrame(category: ProgressCategory) {
  try {
    localStorage.setItem(KEY, category);
  } catch {
    /* не сохранилось — выбор действует до перезагрузки */
  }
}
