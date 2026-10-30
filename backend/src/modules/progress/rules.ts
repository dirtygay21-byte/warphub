/**
 * Прогресс игрока (30.10.2026): число сыгранных игр по категориям и ранг. Правила владельца:
 * засчитываются только подтверждённые записи, и только после окончания их времени; отменённые — никогда.
 * Пороги одинаковы для всех категорий: Новичок 0–4, Игрок 5–14, Опытный 15–39, Ветеран 40+.
 */
export const PROGRESS_CATEGORIES = ['warhammer', 'dnd', 'painting', 'visits'] as const;
export type ProgressCategory = (typeof PROGRESS_CATEGORIES)[number];

export const RANKS = [
  { key: 'beginner', label: 'Новичок', min: 0 },
  { key: 'player', label: 'Игрок', min: 5 },
  { key: 'experienced', label: 'Опытный', min: 15 },
  { key: 'veteran', label: 'Ветеран', min: 40 },
] as const;
export type RankKey = (typeof RANKS)[number]['key'];

/** Категория записи по услуге; null — услуга в прогресс не входит. */
export function categoryOfService(slug: string | null | undefined): ProgressCategory | null {
  if (slug === 'wh_game' || slug === 'wh_group_training' || slug === 'wh_solo_training') return 'warhammer';
  if (slug === 'wh_painting') return 'painting';
  if (slug === 'club_visit') return 'visits';
  return null;
}

/** Запись засчитана: подтверждена и её время прошло (по концу, а если конца нет — по началу). */
export function reservationCounts(r: { status: string; startsAt: Date | null; endsAt: Date | null }, now: Date): boolean {
  if (r.status !== 'confirmed') return false;
  const end = r.endsAt ?? r.startsAt;
  return end !== null && end.getTime() <= now.getTime();
}

/**
 * Запись на D&D засчитана: запись активна, игра не отменена и прошла. У игры с точным временем — по концу
 * (или началу); у игры без точного времени — когда администратор закрыл игру (status = closed).
 */
export function dndBookingCounts(
  b: { status: string; gameStatus: string; startsAt: Date | null; endsAt: Date | null },
  now: Date,
): boolean {
  if (b.status !== 'active' || b.gameStatus === 'cancelled' || b.gameStatus === 'draft') return false;
  const end = b.endsAt ?? b.startsAt;
  if (end) return end.getTime() <= now.getTime();
  return b.gameStatus === 'closed';
}

export type CategoryProgress = {
  category: ProgressCategory;
  games: number;
  rank: RankKey;
  rankLabel: string;
  /** порог следующего ранга; null — уже Ветеран */
  nextAt: number | null;
  nextLabel: string | null;
};

export function rankOf(games: number) {
  let index = 0;
  for (let i = 0; i < RANKS.length; i++) if (games >= RANKS[i]!.min) index = i;
  return index;
}

export function progressOf(category: ProgressCategory, games: number): CategoryProgress {
  const i = rankOf(games);
  const next = RANKS[i + 1];
  return {
    category,
    games,
    rank: RANKS[i]!.key,
    rankLabel: RANKS[i]!.label,
    nextAt: next ? next.min : null,
    nextLabel: next ? next.label : null,
  };
}
